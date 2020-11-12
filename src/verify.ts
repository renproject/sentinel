import BigNumber from "bignumber.js";
import chalk from "chalk";
import moment from "moment";
import { Logger } from "winston";

import { Database } from "./adapters/database";
import { getBCHTransactions, getBTCTransactions } from "./apis/btc";
import { getZECTransactions } from "./apis/zec";
import { timeAgo, timeDifference } from "./lib/naturalTime";
import { reportError } from "./lib/sentry";
import { ContractReader } from "./network";
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
    if (!contractReader.sdk) {
        return;
    }

    console.log("");

    try {
        const address = contractReader.sdk.utils[token].addressFrom(
            item.address,
        );

        const target = item.amount;

        const diffMinutes = moment().diff(
            moment.unix(item.timestamp),
            "minutes",
        );
        const naturalDiff = timeAgo(item.timestamp);

        // Invalid burn address
        if (
            [Token.BTC, Token.ZEC, Token.BCH].indexOf(token) >= 0 &&
            address.slice(0, 2) === "0x"
        ) {
            const errorMessage = `🔥🔥🔥 [burn-sentry] ${network.toLowerCase()} ${
                item.token
            } #${item.ref.toFixed()} (${naturalDiff}) - Invalid burn recipient "${Buffer.from(
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
                        amount: `${adjust(item.amount)} ${item.token}`,
                    })
                ) {
                    item.sentried = true;
                    await database.updateBurn(item);
                }
            } else {
                console.log(chalk.yellow(`[WARNING] ${errorMessage}`));
            }
            return;
        }

        logger.info(
            `[${network}][${token}] Checking ${address} received ${target.toFixed()} (${item.ref.toFixed()}) (${naturalDiff})`,
        );

        if (target.lte(10000)) {
            item.received = true;
            await database.updateBurn(item);
            console.log(`Skipping! Amount is ${target.toFixed()}`);
            return;
        }

        const fees: string[] = [];
        const taken: string[] = [];
        // const past: string[] = [];

        const transactions =
            token === Token.ZEC
                ? await getZECTransactions(
                      network,
                      token,
                      address,
                      item.timestamp,
                  )
                : token === Token.BCH
                ? await getBCHTransactions(network, token, address)
                : await getBTCTransactions(
                      network,
                      token,
                      address,
                      item.timestamp,
                  );

        const sortedUtxos = transactions
            .sortBy((tx) => new Date(`${tx.time} UTC`).getTime())
            .reverse();

        const networkFees = (await contractReader.sdk.getFees())[
            token.toLowerCase() as "btc" | "zec" | "bch"
        ];
        if (networkFees && target.lt(networkFees.release + 547)) {
            item.ignored = true;
            await database.updateBurn(item);
            console.log(
                chalk.yellow(
                    `[WARNING] Burn of ${target.toFixed()} is less than minimum: ${
                        networkFees.release + 547
                    }`,
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
            const fee = target.minus(utxo.balanceChange);
            if (fee.lt(0)) {
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
                console.log(
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

                const rightAmount = utxo.numberOfVOuts
                    ? utxo.numberOfVOuts >= 2 &&
                      utxo.fee &&
                      fee.isEqualTo(
                          utxo.fee /
                              Math.max(
                                  1,
                                  utxo.numberOfVOuts -
                                      1 +
                                      ((utxo.numberOfVIns || 1) - 1),
                              ),
                      )
                    : fee.isEqualTo(70000) ||
                      fee.isEqualTo(35000) ||
                      fee.isEqualTo(5000) ||
                      fee.isEqualTo(16000) ||
                      fee.isEqualTo(30000);

                if (
                    minutesBetweenBurnAndUTXO >= 0 &&
                    // minutesBetweenBurnAndUTXO <= 60 &&
                    txTimestamp >= item.timestamp &&
                    rightAmount &&
                    txIsFree
                ) {
                    item.txHash = utxo.txHash;
                    item.received = true;
                    await database.updateBurn(item);
                    console.log(
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
            if (Math.floor(diffMinutes) % 10 === 0) {
                console.log(
                    `Submitting ${item.token} burn ${item.ref.toFixed()}`,
                );
                contractReader
                    .submitBurn(item.token, item.ref.toNumber())
                    .catch(console.error);
            }

            let errorMessage = `🔥🔥🔥 [burn-sentry] ${network.toLowerCase()} ${
                item.token
            } #${item.ref.toFixed()} (${naturalDiff}) - ${adjust(
                item.amount,
            )} ${item.token} to ${address} - burn not found`;
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
                        network,
                        token,
                        ref: item.ref,
                        address,
                        timeAgo: naturalDiff,
                        amount: `${adjust(item.amount)} ${item.token}`,
                    })
                ) {
                    item.sentried = true;
                    await database.updateBurn(item);
                }
            } else {
                console.log(chalk.yellow(`[WARNING] ${errorMessage}`));
            }
        }
    } catch (error) {
        console.error(error);
        logger.error(error);
    }
};
