import { strip0x } from "@renproject/utils";
import BigNumber from "bignumber.js";
import bs58 from "bs58";
import chalk from "chalk";
import moment from "moment";
import { Logger } from "winston";

import { Database } from "./adapters/database";
import {
    getBCHTransactions,
    getBTCTransactions,
    StdTransaction,
} from "./apis/btc";
import { getZECTransactions } from "./apis/zec";
import { extractError } from "./lib/extractError";
import { timeAgo, timeDifference } from "./lib/naturalTime";
import { reportError } from "./lib/sentry";
import { ContractReader } from "./network/subzero";
import { Burn, Network, Token } from "./types/types";

const adjust = (value: BigNumber | string): string =>
    new BigNumber(value).div(new BigNumber(10).exponentiatedBy(8)).toFixed();

export const verifyBurn = async (
    contractReader: ContractReader,
    logger: Logger,
    database: Database,
    network: Network,
    token: Token,
    item: Burn,
) => {
    if (!contractReader.network) {
        return;
    }

    try {
        let address = Buffer.from(strip0x(item.address), "hex").toString();

        if (token.symbol === "BTC" && address.slice(0, 2) === "BC") {
            address = address.toLocaleLowerCase();
        }

        const target = item.amount;

        const diffMinutes = moment().diff(
            moment.unix(item.timestamp),
            "minutes",
        );
        const naturalDiff = timeAgo(item.timestamp);

        // Invalid burn address
        if (
            ["BTC", "ZEC", "BCH"].indexOf(token.symbol) >= 0 &&
            address.slice(0, 2) === "0x"
        ) {
            const errorMessage = `🔥🔥🔥 [burn-sentry] ${network.name.toLowerCase()} ${
                item.token.symbol
            } ${item.burnHash?.trim()} #${item.ref.toFixed()} (${naturalDiff}) - Invalid burn recipient "${Buffer.from(
                address.slice(2),
                "hex",
            ).toString()}"`;
            if (!item.sentried) {
                if (
                    reportError(errorMessage, {
                        network,
                        token,
                        ref: item.ref,
                        address,
                        timeAgo: naturalDiff,
                        amount: `${adjust(item.amount)} ${item.token.symbol}`,
                    })
                ) {
                    item.sentried = true;
                    item.ignored = true;
                    await database.updateBurn(item);
                }
            } else {
                logger.info(chalk.yellow(`[WARNING] ${errorMessage}`));
                item.ignored = true;
                await database.updateBurn(item);
            }
            return;
        }

        if (token.symbol === "BTC" && !/^[a-z0-9:_-]+$/i.exec(address)) {
            address = bs58.encode(Buffer.from(strip0x(item.address), "hex"));
            logger.info(`Updated address to ${address}`);
        }

        logger.info(
            `[${network.name}][${
                token.symbol
            }] Checking ${address} received ${target
                .div(new BigNumber(10).exponentiatedBy(8))
                .toFixed()} ${
                token.symbol
            } (${item.ref.toFixed()}) (${naturalDiff})`,
        );

        if (target.lte(10000)) {
            item.received = true;
            await database.updateBurn(item);
            logger.info(`Skipping! Amount is ${target.toFixed()}`);
            return;
        }

        const fees: string[] = [];
        const taken: string[] = [];
        // const past: string[] = [];

        let transactions: Immutable.List<StdTransaction>;
        try {
            transactions =
                token.symbol === "ZEC"
                    ? await getZECTransactions(
                          network,
                          token,
                          address,
                          item.timestamp,
                      )
                    : token.symbol === "BCH"
                    ? await getBCHTransactions(network, token, address)
                    : await getBTCTransactions(
                          network,
                          token,
                          address,
                          item.timestamp,
                      );
        } catch (error) {
            if (
                error instanceof Error &&
                (error as any).respose &&
                /Too many history entries/.exec((error as any).response.data)
            ) {
                let errorMessage = `🔥🔥🔥 [burn-sentry] ${network.name.toLowerCase()} ${
                    item.token.symbol
                } ${item.burnHash?.trim()} #${item.ref.toFixed()} (${naturalDiff}) - ${adjust(
                    item.amount,
                )} ${
                    item.token.symbol
                } to ${address} - Unable to fetch transactions: ${
                    error.message
                }`;
                logger.info(chalk.yellow(`[WARNING] ${errorMessage}`));
                item.ignored = true;
                await database.updateBurn(item);
            }
            throw error;
        }

        const sortedUtxos = transactions
            .sortBy((tx) => new Date(`${tx.time} UTC`).getTime())
            .reverse();

        const networkFees = await contractReader.getReleaseFees(token);
        if (networkFees.release && target.lt(networkFees.release.plus(547))) {
            item.ignored = true;
            await database.updateBurn(item);
            logger.info(
                chalk.yellow(
                    `[WARNING] Burn of ${target.toFixed()} is less than minimum: ${networkFees.release.plus(
                        547,
                    )}`,
                ),
            );
            return;
        }

        for (const utxo of sortedUtxos.valueSeq()) {
            const balanceChange = new BigNumber(utxo.balanceChange);
            // A transaction out, not in
            if (balanceChange.isLessThan(0)) {
                continue;
            }

            const txTimestamp = utxo.time;

            // Too early
            if (utxo.time < txTimestamp) {
                continue;
            }

            // Sent too much
            if (target.isLessThan(utxo.balanceChange)) {
                continue;
            }

            const minutesBetweenBurnAndUTXO = moment
                .unix(utxo.time)
                .diff(moment.unix(item.timestamp), "minutes");
            const timeBetweenBurnAndUTXO = timeDifference(
                utxo.time - item.timestamp,
            );

            if (minutesBetweenBurnAndUTXO >= 0) {
                const takenBy = await database.txIsFree(
                    network,
                    token,
                    utxo.txHash,
                );
                const txIsFree = takenBy.length === 0;
                // const fee = target.minus(utxo.balanceChange);
                const fee = target
                    .times((10000 - networkFees.burn) / 10000)
                    .minus(utxo.balanceChange);

                logger.info(
                    `[DEBUG] Checking UTXO ${utxo.txHash.slice(
                        0,
                        6,
                    )}...${utxo.txHash.slice(utxo.txHash.length - 6)} (${
                        utxo.numberOfVOuts
                    } vOuts, fee ${utxo.fee}) for ${
                        utxo.balanceChange
                    } with fee ${fee.toFixed()} (${timeBetweenBurnAndUTXO}) ${
                        !txIsFree
                            ? `(taken by #${takenBy[0].ref} - ${timeDifference(
                                  utxo.time - takenBy[0].timestamp,
                              )})`
                            : ""
                    }`,
                );

                // const splitFee = (n: number) =>
                // Math.ceil(9399 / (n > 1 ? n - 1 : n)) + 1;

                // const rightAmount =
                //     utxo.numberOfVOuts === undefined
                //         ? fee.isEqualTo(splitFee(1)) ||
                //           fee.isEqualTo(splitFee(2)) ||
                //           fee.isEqualTo(splitFee(3)) ||
                //           fee.isEqualTo(splitFee(4)) ||
                //           fee.isEqualTo(splitFee(5)) ||
                //           fee.isEqualTo(splitFee(6)) ||
                //           fee.isEqualTo(splitFee(7)) ||
                //           fee.isEqualTo(splitFee(8))
                //         : fee.isEqualTo(splitFee(utxo.numberOfVOuts)) ||
                //           fee.isEqualTo(splitFee(utxo.numberOfVOuts + 1));

                const rightAmount =
                    network.name.slice(0, 3) !== "ETH"
                        ? fee.isLessThan(300000)
                        : utxo.numberOfVOuts && utxo.fee
                        ? fee.isEqualTo(
                              utxo.fee /
                                  Math.max(
                                      1,
                                      utxo.numberOfVOuts -
                                          1 +
                                          ((utxo.numberOfVIns || 1) - 1),
                                  ),
                          )
                        : fee.isEqualTo(70000) ||
                          fee.isEqualTo(100000) ||
                          fee.isEqualTo(35000) ||
                          fee.isEqualTo(5000) ||
                          fee.isEqualTo(16000) ||
                          fee.isEqualTo(30000);

                // @notice - to enable only using utxos less than an hour after
                // the burn, uncomment the first condition.
                if (
                    // minutesBetweenBurnAndUTXO <= 60 &&
                    minutesBetweenBurnAndUTXO >= 0 &&
                    txTimestamp >= item.timestamp &&
                    rightAmount &&
                    txIsFree
                ) {
                    item.txHash = utxo.txHash;
                    item.received = true;
                    await database.updateBurn(item);
                    logger.info(
                        chalk.green(
                            `[INFO] Found! ${
                                utxo.balanceChange
                            }. Fee is ${fee.toFixed()} (${timeBetweenBurnAndUTXO})`,
                        ),
                    );
                    return;
                }

                if (txTimestamp >= item.timestamp && txIsFree && fee.gte(0)) {
                    fees.push(
                        `${adjust(balanceChange)} (${timeBetweenBurnAndUTXO})`,
                    );
                } else if (txTimestamp >= item.timestamp && fee.gte(0)) {
                    taken.push(
                        `${adjust(
                            utxo.balanceChange.toFixed(),
                        )} (${timeBetweenBurnAndUTXO})`,
                    );
                    // } else if (fee.gte(0)) {
                    //     past.push(`${adjust(utxo.balanceChange.toFixed())} (${timeBetweenBurnAndUTXO})`);
                }
            }
        }
        if (!item.received) {
            // Try submitting to RenVM once every 10 minutes.
            if (true || Math.floor(diffMinutes) % 1 === 0) {
                logger.info(
                    `Submitting ${
                        item.token.symbol
                    } burn ${item.ref.toFixed()}`,
                );
                contractReader
                    .submitBurn(
                        item.token,
                        item.ref.toNumber(),
                        network.name.slice(0, 3) !== "ETH"
                            ? item.burnHash || undefined
                            : undefined,
                    )
                    .catch((error) =>
                        logger.error(chalk.gray(extractError(error))),
                    );
            }

            let errorMessage = `🔥🔥🔥 [burn-sentry] ${network.name.toLowerCase()} ${item.burnHash?.trim()} ${adjust(
                item.amount,
            )} ${
                item.token.symbol
            } #${item.ref.toFixed()} (${naturalDiff}) to ${address} - burn not found`;
            if (fees.length > 0) {
                errorMessage += ` - Other utxos: ${fees.join(", ")}`;
            }
            if (taken.length > 0) {
                errorMessage += ` - Taken: ${taken.join(", ")}`;
            }
            // if (past.length > 0) {
            //     errorMessage += ` - Too early: ${past.join(", ")}`;
            // }

            // Alert after 90 minutes
            if (diffMinutes > 90 && !item.sentried) {
                if (
                    reportError(errorMessage, {
                        network: network.name,
                        token,
                        ref: item.ref,
                        address,
                        timeAgo: naturalDiff,
                        amount: `${adjust(item.amount)} ${item.token.symbol}`,
                    })
                ) {
                    item.sentried = true;
                    await database.updateBurn(item);
                }
            } else {
                logger.info(chalk.yellow(`[WARNING] ${errorMessage}`));
            }
        }
    } catch (error: any) {
        logger.error(
            chalk.red(
                `Error checking ${token.symbol} tx #${item.ref}`,
                extractError(error),
                `(burn hash: ${item.burnHash})`,
            ),
        );
    }
};