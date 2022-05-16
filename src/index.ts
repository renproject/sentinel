import "reflect-metadata";

import {
    RenVMCrossChainTransaction,
    RenVMProvider,
    RenVMTransactionWithStatus,
} from "@renproject/provider";
import RenJS from "@renproject/ren";
import { RenVMCrossChainTxSubmitter } from "@renproject/ren/build/main/renVMTxSubmitter";
import {
    ChainTransactionProgress,
    ChainTransactionStatus,
    generateGHash,
    generateNHash,
    generatePHash,
    generateSHash,
    RenNetwork,
    TxStatus,
    utils,
} from "@renproject/utils";
import * as Sentry from "@sentry/node";
import BigNumber from "bignumber.js";
import { install as loadSourceMaps } from "source-map-support";
import { Connection } from "typeorm";
import { Logger } from "winston";

import { createLogger } from "./adapters/logger";
import { LIGHTNODE_URL, SENTRY_DSN } from "./config";
import { connectDatabase } from "./db";
import { Chain } from "./db/entities/Chain";
import { Transaction } from "./db/entities/Transaction";
import { ChainDetails, Chains, initializeChains } from "./lib/chains";
import { colors, printChain } from "./lib/logger";
import { MINUTES, sleep, withTimeout } from "./lib/misc";

// import { ContractReader } from "./network/subzero";
// import { verifyBurn } from "./verify";

loadSourceMaps();

// LOOP_INTERVAL defines how long the bot sleeps for in between checking for
// trade opportunities.
const minute = 60 * 1000;
const LOOP_INTERVAL = 1 * minute;

const syncChainTransactions = async (
    chains: Chains,
    chain: ChainDetails,
    logger: Logger,
    database: Connection,
) => {
    if (!chain.getLogs) {
        return;
    }

    const chainRepository = await database.getRepository(Chain);
    const chainStorage = await chainRepository.findOneByOrFail({
        chain: chain.chain.chain,
    });

    const fromBlock = chainStorage.synced_height
        ? new BigNumber(chainStorage.synced_height).plus(1)
        : null;

    const { burns, currentBlock } = await withTimeout(
        chain.getLogs(fromBlock),
        20 * MINUTES,
    );

    logger.info(
        `[${printChain(chain.chain.chain)}] Got ${
            burns.length
        } burns from block #${
            fromBlock
                ? fromBlock.toString()
                : currentBlock.toString().toString()
        } (${
            fromBlock ? currentBlock.minus(fromBlock).toString() : "1"
        } blocks)`,
    );

    chainStorage.synced_height = currentBlock.toFixed();
    await database.manager.save([chainStorage, ...burns]);
};

export const blockchainSyncerService = (
    chains: Chains,
    logger: Logger,
    database: Connection,
) => {
    return {
        start: async () => {
            const mintChains = Object.values(chains).filter(
                (chain) => chain.getLogs,
            );

            // Run tactic every 30 seconds
            while (true) {
                for (const chainDetails of mintChains) {
                    try {
                        await withTimeout(
                            syncChainTransactions(
                                chains,
                                chainDetails,
                                logger,
                                database,
                            ),
                            30 * MINUTES,
                        );
                    } catch (error: any) {
                        console.error(error);
                        logger.error(colors.red(error.message));
                    }
                }
                // await sleep(LOOP_INTERVAL);
            }
        },
    };
};

export const transactionUpdaterService = (
    chains: Chains,
    logger: Logger,
    database: Connection,
) => {
    return {
        start: async () => {
            const renJS = new RenJS("mainnet");
            const transactionRepository = await database.getRepository(
                Transaction,
            );

            while (true) {
                const transactions = await transactionRepository.findBy({
                    done: false,
                    sentried: false,
                    ignored: false,
                });

                for (const transaction of transactions) {
                    try {
                        const {
                            asset,
                            fromTxHash,
                            fromTxIndex,
                            amount,
                            toRecipient,
                            fromChain,
                        } = transaction;
                        const payload = transaction.toPayload
                            ? utils.fromBase64(transaction.toPayload)
                            : Buffer.from([]);
                        const nonce = utils.fromBase64(transaction.nonce);
                        const originChain = Object.values(chains).find((ch) =>
                            Object.values(ch.chain.assets).includes(
                                transaction.asset,
                            ),
                        );
                        const toChain: string | undefined =
                            transaction.toChain ||
                            (originChain && originChain.chain.chain);
                        const from = chains[fromChain];
                        const to = toChain ? chains[toChain] : undefined;
                        if (!from) {
                            logger.error(`No from chain.`);
                            continue;
                        }
                        if (!to) {
                            logger.error(`No to chain.`);
                            continue;
                        }

                        const txid = utils.fromBase64(fromTxHash);

                        const nhash = generateNHash(nonce, txid, fromTxIndex);
                        const phash = generatePHash(payload);
                        const shash = generateSHash(
                            `${asset}/to${to.chain.chain}`,
                        );
                        const ghash = generateGHash(
                            phash,
                            shash,
                            to.chain.addressToBytes(toRecipient),
                            nonce,
                        );

                        const selector = `${asset}/from${fromChain}${
                            originChain && originChain.chain.chain !== toChain
                                ? `_to${toChain}`
                                : ""
                        }`;

                        const submitter = new RenVMCrossChainTxSubmitter(
                            renJS.provider,
                            selector,
                            {
                                txid,
                                txindex: new BigNumber(fromTxIndex),
                                amount: new BigNumber(amount),
                                payload,
                                phash,
                                to: toRecipient,
                                nonce,
                                nhash,
                                gpubkey: Buffer.from([]),
                                ghash,
                            },
                        );

                        let result:
                            | (ChainTransactionProgress & {
                                  response?:
                                      | RenVMTransactionWithStatus<RenVMCrossChainTransaction>
                                      | undefined;
                              })
                            | undefined = undefined;
                        try {
                            result = await submitter.query();
                        } catch (error) {
                            try {
                                await submitter.submit();
                                void utils
                                    .POST(
                                        "https://validate-mint.herokuapp.com/",
                                        JSON.stringify({
                                            app: "burn-sentry",
                                            hash: submitter.tx.hash,
                                        }),
                                    )
                                    .catch(() => {
                                        /* Ignore error. */
                                    });
                                try {
                                    result = await submitter.query();
                                } catch (error) {
                                    logger.error(
                                        colors.red(
                                            `Unable to query ${submitter.tx.hash} after submitting:`,
                                        ),
                                        error,
                                    );
                                    logger.debug(
                                        JSON.stringify(
                                            submitter.export(),
                                            null,
                                            "    ",
                                        ),
                                    );
                                }
                            } catch (errorInner) {
                                logger.error(
                                    colors.red(
                                        `Unable to submit ${submitter.tx.hash}:`,
                                    ),
                                    error,
                                );
                                logger.debug(
                                    JSON.stringify(
                                        submitter.export(),
                                        null,
                                        "    ",
                                    ),
                                );
                            }
                        }
                        if (result) {
                            logger.info(
                                `${selector} ${colors.yellow(
                                    submitter.tx.hash,
                                )}: ${colors.green(result.status)}`,
                            );
                            if (
                                result.status === ChainTransactionStatus.Done ||
                                result.status ===
                                    ChainTransactionStatus.Reverted
                            ) {
                                transaction.done = true;
                                await transactionRepository.save(transaction);
                            }
                        }
                    } catch (error) {
                        logger.error(
                            colors.red(
                                `Error processing transaction ${transaction.fromTxHash}:`,
                            ),
                            error,
                        );
                        logger.debug(
                            transaction.fromTxHash,
                            transaction.fromChain,
                        );
                    }
                }

                await sleep(LOOP_INTERVAL);
            }
        },
    };
};

export const main = async (_args: readonly string[]) => {
    // Logger
    const logger = createLogger();

    // UI server
    // setupApp(logger);

    // Set up sentry
    Sentry.init({
        dsn: SENTRY_DSN,
        integrations: ((integrations: Array<{ name: string }>) => {
            // integrations will be all default integrations
            return integrations.filter((integration) => {
                return (
                    integration.name !== "OnUncaughtException" &&
                    integration.name !== "OnUnhandledRejection" &&
                    integration.name !== "Http"
                );
            });
        }) as any, // tslint:disable-line: no-any
    });

    const provider = await new RenVMProvider(LIGHTNODE_URL);
    const network = (await provider.getNetwork()) as RenNetwork;

    // Database
    const database = await connectDatabase(logger, network);

    // let contractReaders = Map<string, ContractReader>();

    const chains = await initializeChains(network, logger);

    const blockchainSyncer = blockchainSyncerService(chains, logger, database);

    const transactionUpdater = transactionUpdaterService(
        chains,
        logger,
        database,
    );

    blockchainSyncer.start().catch((error) => {
        console.error(error);
        process.exit(1);
    });

    transactionUpdater.start().catch((error) => {
        console.error(error);
        process.exit(1);
    });
};

main(process.argv.slice(2)).catch((error) => console.error(error));

let x: MessageEvent;
