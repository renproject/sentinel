import BigNumber from "bignumber.js";
import chalk from "chalk";
import moment from "moment";
import { Logger } from "winston";

import { Database } from "./adapters/database";
import { getBTCTransactions } from "./apis/btc";
import { getZECTransactions } from "./apis/zec";
import { ContractReader } from "./chaosdex";
import { timeAgo, timeDifference } from "./lib/naturalTime";
import { reportError } from "./lib/sentry";
import { Burn, Network, Token } from "./types/types";

export const verifyBurn = async (contractReader: ContractReader, logger: Logger, database: Database, network: Network, token: Token, item: Burn) => {
    if (!contractReader.sdk) {
        return;
    }

    console.log("");

    try {
        const address = contractReader.sdk.utils[token].addressFrom(item.address);
        const target = item.amount;

        const diffMinutes = moment().diff(moment.unix(item.timestamp), "minutes");
        const naturalDiff = timeAgo(item.timestamp);

        logger.info(`[${network}][${token}] Checking ${address} received ${target.toFixed()} (${item.ref.toFixed()}) (${naturalDiff})`);

        if (target.lte(10000)) {
            item.received = true;
            await database.updateBurn(item);
            console.log(`Skipping! Amount is ${target.toFixed()}`);
            return;
        }

        const fees: string[] = [];
        const taken: string[] = [];
        // const past: string[] = [];

        const transactions = token === Token.ZEC ?
            await getZECTransactions(network, token, address, item.timestamp) :
            await getBTCTransactions(network, token, address);

        const sortedUtxos = transactions.sortBy(tx => (new Date(`${tx.time} UTC`)).getTime());

        const adjust = (value: BigNumber | string): string => new BigNumber(value).div(new BigNumber(10).exponentiatedBy(8)).toFixed();

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

            const minutesBetweenBurnAndUTXO = moment.unix(utxo.time).diff(moment.unix(item.timestamp), "minutes");
            const timeBetweenBurnAndUTXO = timeDifference(utxo.time - item.timestamp);

            const takenBy = await database.txIsFree(network, token, utxo.txHash);
            const txIsFree = takenBy.length === 0;
            console.log(`[DEBUG] Checking UTXO ${utxo.txHash.slice(0, 6)}...${utxo.txHash.slice(utxo.txHash.length - 6)} (${utxo.numberOfVOuts} vOuts) for ${utxo.balanceChange} with fee ${fee.toFixed()} (${timeBetweenBurnAndUTXO}) ${!txIsFree ? `(taken by #${takenBy[0].ref} - ${timeDifference(utxo.time - takenBy[0].timestamp)})` : ""}`);

            const rightAmount = utxo.numberOfVOuts === undefined ?
                (fee.isEqualTo(10601) || fee.isEqualTo(5301) || fee.isEqualTo(3535) || fee.isEqualTo(2651) || fee.isEqualTo(2121)) :
                (fee.isEqualTo(Math.ceil(10600 / (utxo.numberOfVOuts - 1)) + 1));
            if (
                minutesBetweenBurnAndUTXO >= 0 && minutesBetweenBurnAndUTXO <= 15 &&
                txTimestamp >= item.timestamp &&
                rightAmount &&
                txIsFree
            ) {
                item.txHash = utxo.txHash;
                item.received = true;
                await database.updateBurn(item);
                console.log(chalk.green(`[INFO] Found! ${utxo.balanceChange}. Fee is ${fee.toFixed()} (${timeBetweenBurnAndUTXO})`));
                return;
            } else if (txTimestamp >= item.timestamp && txIsFree && fee.gte(0)) {
                fees.push(`${adjust(balanceChange)} (${timeBetweenBurnAndUTXO})`);
            } else if (txTimestamp >= item.timestamp && fee.gte(0)) {
                taken.push(`${adjust(utxo.balanceChange.toFixed())} (${timeBetweenBurnAndUTXO})`);
                // } else if (fee.gte(0)) {
                //     past.push(`${adjust(utxo.balanceChange.toFixed())} (${timeBetweenBurnAndUTXO})`);
            }
        }
        if (!item.received) {
            let errorMessage = `[burn-sentry] ${network.toLowerCase()} ${item.token} #${item.ref.toFixed()} (${naturalDiff}) - ${adjust(item.amount)} ${item.token} to ${address} - burn not found`;
            if (fees.length > 0) {
                errorMessage += ` - Other utxos: ${fees.join(", ")}`;
            }
            if (taken.length > 0) {
                errorMessage += ` - Taken: ${taken.join(", ")}`;
            }
            // if (past.length > 0) {
            //     errorMessage += ` - Too early: ${past.join(", ")}`;
            // }

            if (diffMinutes > 10 && !item.sentried) {
                if (reportError(
                    errorMessage,
                    {
                        network,
                        token,
                        ref: item.ref,
                        address,
                        timeAgo: naturalDiff,
                        amount: `${adjust(item.amount)} ${item.token}`,
                    }
                )) {
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
