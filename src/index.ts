import "reflect-metadata";

import { RenVMProvider } from "@renproject/provider";
import RenJS from "@renproject/ren";
import { RenVMCrossChainTxSubmitter } from "@renproject/ren/build/main/renVMTxSubmitter";
import {
    ChainTransactionStatus,
    decodeRenVMSelector,
    generateGHash,
    generateNHash,
    generatePHash,
    generateSHash,
    RenNetwork,
    utils,
} from "@renproject/utils";
import * as Sentry from "@sentry/node";
import BigNumber from "bignumber.js";
import bs58 from "bs58";
import chalk from "chalk";
import { install as loadSourceMaps } from "source-map-support";
import { Connection } from "typeorm";
import { Logger } from "winston";

import { LIGHTNODE_URL, SENTRY_DSN } from "./config";
import { connectDatabase } from "./db";
import { Chain } from "./db/entities/Chain";
import { Transaction } from "./db/entities/Transaction";
import { ChainDetails, Chains, initializeChains } from "./lib/chains";
import { createLogger, printChain } from "./lib/logger";
import { MINUTES, sleep, withTimeout } from "./lib/misc";

loadSourceMaps();

// LOOP_INTERVAL defines how long the bot sleeps for in between checking for
// trade opportunities.
const minute = 60 * 1000;
const LOOP_INTERVAL = 1 * minute;

const syncChainTransactions = async (
    renJS: RenJS,
    chain: ChainDetails,
    chains: Chains,
    database: Connection,
    logger: Logger,
) => {
    if (!chain.getLogs) {
        return;
    }

    const chainRepository = await database.getRepository(Chain);
    const chainStorage = await chainRepository.findOneByOrFail({
        chain: chain.chain.chain,
    });

    let txs: Transaction[] = [];
    // for (let i = 0; i < 10; i++) {
    const { transactions, newState } = await chain.getLogs(
        chainStorage.synced_state,
        chains,
    );

    chainStorage.synced_state = newState;
    txs = [...txs, ...transactions];
    // }
    await database.manager.save([chainStorage, ...txs]);

    // (async () => {
    for (const transaction of txs) {
        const updatedTransaction = await submitTransaction(
            transaction,
            renJS,
            chains,
            logger,
            database,
        );
        if (updatedTransaction) {
            await database.manager.save(updatedTransaction);
        }
    }
    // })().catch(logger.error);
};

export const blockchainSyncerService = (
    renJS: RenJS,
    chains: Chains,
    database: Connection,
    logger: Logger,
) => {
    return {
        start: async () => {
            const mintChains = Object.values(chains).filter(
                (chain) => chain.getLogs,
            );

            const transactionRepository = await database.getRepository(
                Transaction,
            );

            // Run tactic every 30 seconds
            for (let iteration = 0; ; iteration++) {
                for (const chainDetails of mintChains) {
                    try {
                        await withTimeout(
                            syncChainTransactions(
                                renJS,
                                chainDetails,
                                chains,
                                database,
                                logger,
                            ),
                            5 * MINUTES,
                        );
                    } catch (error: any) {
                        console.error(error);
                        logger.error(chalk.red(error.message));
                    }
                }

                // if (iteration % 10 === 0) {
                //     const transactions = await transactionRepository.find({
                //         where: {
                //             done: false,
                //             sentried: false,
                //             ignored: false,
                //         },
                //         // order: {
                //         //     created_at: "desc",
                //         // },
                //     });

                //     if (transactions.length > 0) {
                //         logger.info(
                //             `[renvm-tx] ${chalk.yellow(
                //                 transactions.length,
                //             )} transactions to process.`,
                //         );
                //     }

                //     for (const transaction of transactions) {
                //         const updatedTransaction = await submitTransaction(
                //             transaction,
                //             renJS,
                //             chains,
                //             logger,
                //             database,
                //         );
                //         if (updatedTransaction) {
                //             await transactionRepository.save(
                //                 updatedTransaction,
                //             );
                //         }
                //     }
                // }
            }
        },
    };
};

const submitTransaction = async (
    transaction: Transaction,
    renJS: RenJS,
    chains: Chains,
    logger: Logger,
    database: Connection,
): Promise<Transaction | null> => {
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
            Object.values(ch.chain.assets).includes(transaction.asset),
        );
        const toChain: string | undefined =
            transaction.toChain || (originChain && originChain.chain.chain);
        const from = chains[fromChain];
        const to = toChain ? chains[toChain] : undefined;
        if (!from) {
            logger.error(`No from chain.`);
            return null;
        }
        if (!to) {
            logger.error(`No to chain.`);
            return null;
        }
        if (!originChain) {
            logger.error(`No origin chain.`);
            return null;
        }

        const txid = from.chain.txHashToBytes(fromTxHash);

        let toAddress;
        let toAddressBytes;
        try {
            const utf8Address = Buffer.from(
                utils.fromBase64(toRecipient),
            ).toString();
            if (to.chain.validateAddress(utf8Address)) {
                toAddress = utf8Address;
            } else {
                const bytesAddress = to.chain.addressFromBytes(
                    utils.fromBase64(toRecipient),
                );
                if (to.chain.validateAddress(bytesAddress)) {
                    toAddress = bytesAddress;
                } else {
                    const base58Address = bs58
                        .decode(
                            Buffer.from(
                                utils.fromBase64(toRecipient),
                            ).toString(),
                        )
                        .toString();
                    if (to.chain.validateAddress(base58Address)) {
                        toAddress = base58Address;
                        transaction.toRecipient = utils.toURLBase64(
                            Buffer.from(toAddress),
                        );
                    } else {
                        throw new Error(`Unknown format.`);
                    }
                }
            }
            toAddressBytes = to.chain.addressToBytes(toAddress);
        } catch (error) {
            throw new Error(
                `Unable to decode ${
                    to.chain.chain
                } address '${toRecipient}': ${utils.extractError(error)}`,
            );
        }

        const nhash = generateNHash(nonce, txid, fromTxIndex);
        const phash = generatePHash(payload);
        const shash = generateSHash(`${asset}/to${to.chain.chain}`);
        const ghash = generateGHash(phash, shash, toAddressBytes, nonce);

        let selector: string;
        if (originChain.chain.chain === to.chain.chain) {
            selector = `${asset}/from${from.chain.chain}`;
        } else if (originChain.chain.chain === from.chain.chain) {
            selector = `${asset}/to${to.chain.chain}`;
        } else {
            selector = `${asset}/from${from.chain.chain}_to${to.chain.chain}`;
        }

        const submitter = new RenVMCrossChainTxSubmitter(
            renJS.provider,
            selector,
            {
                txid,
                txindex: new BigNumber(fromTxIndex),
                amount: new BigNumber(amount),
                payload,
                phash,
                to: toAddress,
                nonce,
                nhash,
                gpubkey: Buffer.from([]),
                ghash,
            },
        );

        transaction.renVmHash = submitter.tx.hash;

        try {
            await submitter.query();
        } catch (error: any) {
            if (
                submitter.progress?.status !== ChainTransactionStatus.Reverted
            ) {
                try {
                    await submitter.submit();
                    if (/not found$/.exec(error.message)) {
                        logger.info(
                            `[renvm-tx] Submitted ${chalk.yellow(
                                submitter.tx.hash,
                            )}!`,
                        );
                    }
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
                        await submitter.query();
                    } catch (error) {
                        logger.error(
                            chalk.red(
                                `Unable to query ${submitter.tx.hash} after submitting:`,
                            ),
                            error,
                        );
                        logger.debug(
                            JSON.stringify(submitter.export(), null, "    "),
                        );
                    }
                } catch (errorInner) {
                    logger.error(
                        chalk.red(`Unable to submit ${submitter.tx.hash}:`),
                        errorInner,
                    );
                    logger.debug(
                        JSON.stringify(submitter.export(), null, "    "),
                    );
                }
            }
        }
        if (submitter.progress) {
            {
                const { asset, from, to } = decodeRenVMSelector(
                    selector,
                    originChain.chain.chain || "",
                );
                logger.info(
                    `[renvm-tx] ${printChain(from)}->${asset}->${printChain(
                        to,
                    )} ${chalk.yellow(submitter.tx.hash)}: ${chalk.green(
                        submitter.progress.status,
                    )}`,
                );
            }
            if (
                submitter.progress.status === ChainTransactionStatus.Done ||
                submitter.progress.status === ChainTransactionStatus.Reverted
            ) {
                transaction.done = true;
                if (submitter.progress.response?.tx.out?.txid) {
                    transaction.toTxHash = to.chain.txHashFromBytes(
                        submitter.progress.response.tx.out.txid,
                    );
                }
                return transaction;
            }
        }
    } catch (error) {
        logger.error(
            chalk.red(
                `[renvm-tx] Error processing ${transaction.asset} ${transaction.fromChain} transaction ${transaction.fromTxHash}:`,
            ),
            error,
        );
    }
    return null;
};

export const transactionUpdaterService = (
    renJS: RenJS,
    chains: Chains,
    database: Connection,
    logger: Logger,
) => {
    return {
        start: async () => {
            const transactionRepository = await database.getRepository(
                Transaction,
            );

            while (true) {
                const transactions = await transactionRepository.find({
                    where: {
                        done: false,
                        sentried: false,
                        ignored: false,
                    },
                    // order: {
                    //     created_at: "desc",
                    // },
                });

                if (transactions.length > 0) {
                    logger.info(
                        `${chalk.yellow(
                            transactions.length,
                        )} transactions to process.`,
                    );
                }

                for (const transaction of transactions) {
                    const updatedTransaction = await submitTransaction(
                        transaction,
                        renJS,
                        chains,
                        logger,
                        database,
                    );
                    if (updatedTransaction) {
                        await transactionRepository.save(updatedTransaction);
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

    const renJS = new RenJS("mainnet");

    const blockchainSyncer = blockchainSyncerService(
        renJS,
        chains,
        database,
        logger,
    );

    const transactionUpdater = transactionUpdaterService(
        renJS,
        chains,
        database,
        logger,
    );

    blockchainSyncer.start().catch((error) => {
        console.error(error);
        process.exit(1);
    });

    // transactionUpdater.start().catch((error) => {
    //     console.error(error);
    //     process.exit(1);
    // });
};

main(process.argv.slice(2)).catch((error) => console.error(error));

let x: MessageEvent;
