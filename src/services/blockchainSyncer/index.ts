import RenJS from "@renproject/ren";
import { RenVMCrossChainTxSubmitter } from "@renproject/ren/build/main/renVMTxSubmitter";
import {
    ChainTransactionStatus,
    decodeRenVMSelector,
    generateGHash,
    generateNHash,
    generatePHash,
    generateSHash,
    utils,
} from "@renproject/utils";
import BigNumber from "bignumber.js";
import bs58 from "bs58";
import chalk from "chalk";
import stripAnsi from "strip-ansi";
import { Connection } from "typeorm";
import { Logger } from "winston";

import { Chain } from "../../db/entities/Chain";
import { Transaction } from "../../db/entities/Transaction";
import { ChainDetails, Chains } from "../../lib/chains";
import { printChain } from "../../lib/logger";
import { withTimeout } from "../../lib/misc";

// LOOP_INTERVAL defines how long the bot sleeps for in between checking for
// trade opportunities.
const LOOP_INTERVAL = 1 * utils.sleep.MINUTES;

const TRANSACTION_SENTRY_DELAY = 60 * utils.sleep.MINUTES;

/**
 * Check whether a RenVM transaction has been submitted. If not, submit it.
 */
const submitTransaction = async (
    transaction: Transaction,
    renJS: RenJS,
    chains: Chains,
    logger: Logger,
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
                    const base58Address = to.chain.addressFromBytes(
                        bs58.decode(
                            Buffer.from(
                                utils.fromBase64(toRecipient),
                            ).toString(),
                        ),
                    );
                    if (to.chain.validateAddress(base58Address)) {
                        toAddress = base58Address;
                        transaction.toRecipient = utils.toURLBase64(
                            Buffer.from(toAddress),
                        );
                    } else {
                        throw new Error(
                            `Unknown formats '${stripAnsi(
                                utf8Address,
                            )}', '${stripAnsi(bytesAddress)}', '${stripAnsi(
                                base58Address,
                            )}'.`,
                        );
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
            }
        }

        // If the transaction is older than TRANSACTION_SENTRY_DELAY,
        // and hasn't been completed or sentried yet, report an
        // error to Sentry.
        const timePassed =
            (transaction.created_at.getTime() - Date.now()) / 1000;
        if (
            timePassed > TRANSACTION_SENTRY_DELAY &&
            transaction.sentried === false &&
            transaction.done === false &&
            transaction.ignored === false
        ) {
            let decimals = 0;
            try {
                decimals = await from.chain.assetDecimals(transaction.asset);
            } catch (error) {
                // Ignore
            }
            reportError(
                `🔥🦉🔥 [sentinel][${
                    transaction.fromChain
                }] ${transaction.fromTxHash.trim()} ${new BigNumber(
                    transaction.amount,
                )
                    .shiftedBy(-decimals)
                    .toFixed()} ${transaction.asset}`,
            );
            transaction.sentried = true;
        }

        return transaction;
    } catch (error) {
        logger.error(
            chalk.red(
                `[renvm-tx] Error processing ${transaction.asset} ${transaction.fromChain} transaction ${transaction.fromTxHash}:`,
            ),
            error,
        );
        if (/rate limit/.exec(utils.extractError(error))) {
            await utils.sleep(1 * utils.sleep.SECONDS);
        }
    }
    return null;
};

const syncChainTransactions = async (
    renJS: RenJS,
    chain: ChainDetails,
    chains: Chains,
    database: Connection,
    logger: Logger,
) => {
    // Skip lock-chains and other unimplemented chains.
    if (!chain.getLogs) {
        return;
    }

    const chainRepository = await database.getRepository(Chain);
    const chainStorage = await chainRepository.findOneByOrFail({
        chain: chain.chain.chain,
    });

    const { transactions, newState } = await chain.getLogs(
        chainStorage.synced_state,
        chains,
    );

    chainStorage.synced_state = newState;
    await database.manager.save([chainStorage, ...transactions]);

    for (const transaction of transactions) {
        const updatedTransaction = await submitTransaction(
            transaction,
            renJS,
            chains,
            logger,
        );
        if (updatedTransaction) {
            await database.manager.save(updatedTransaction);
        }
    }
};

export const PENDING_TX_CHECK = 10; // iterations
export const SENTRIED_TX_CHECK = 100; // iterations

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

            // Loop every minute.
            for (let iteration = 0; ; iteration++) {
                const checkPendingTxs = iteration % PENDING_TX_CHECK === 0;
                const checkSentriedTxs = iteration % SENTRIED_TX_CHECK === 0;

                if (checkPendingTxs) {
                    // Fetch transactions that aren't marked done.
                    // Only filter sentried txs if `checkSentriedTxs` is false.
                    const transactions = await transactionRepository.find({
                        where: {
                            done: false,
                            sentried: checkSentriedTxs ? undefined : false,
                            ignored: false,
                        },
                    });

                    if (transactions.length > 0) {
                        logger.info(
                            `[renvm-tx] ${chalk.yellow(
                                transactions.length,
                            )} transactions to process (sentried=${chalk.yellow(
                                checkSentriedTxs,
                            )})`,
                        );
                    }

                    for (const transaction of transactions) {
                        const updatedTransaction = await submitTransaction(
                            transaction,
                            renJS,
                            chains,
                            logger,
                        );
                        if (updatedTransaction) {
                            await transactionRepository.save(
                                updatedTransaction,
                            );
                        }
                    }
                }

                // Fetch new events.
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
                            5 * utils.sleep.MINUTES,
                        );
                    } catch (error: any) {
                        console.error(error);
                        logger.error(chalk.red(error.message));
                    }
                }

                await utils.sleep(LOOP_INTERVAL);
            }
        },
    };
};
