import BigNumber from "bignumber.js";
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
        const past: string[] = [];

        const transactions = token === Token.ZEC ?
            await getZECTransactions(network, token, address) :
            await getBTCTransactions(network, token, address);

        const sortedUtxos = transactions.sortBy(tx => (new Date(`${tx.time} UTC`)).getTime());

        const adjust = (value: BigNumber | string): string => new BigNumber(value).div(new BigNumber(10).exponentiatedBy(8)).toFixed();

        for (const utxo of sortedUtxos.valueSeq()) {
            const balanceChange = new BigNumber(utxo.balanceChange);
            if (balanceChange.isLessThan(0)) {
                continue;
            }
            const txTimestamp = utxo.time;

            const timeBetweenBurnAndUTXO = timeDifference(utxo.time - item.timestamp);

            const fee = target.minus(utxo.balanceChange);
            const takenBy = await database.txIsFree(network, token, utxo.txHash);
            const txIsFree = takenBy.length === 0;
            console.log(`[DEBUG] Checking UTXO with fee ${fee.toFixed()} (${timeBetweenBurnAndUTXO}) ${!txIsFree ? `(taken by #${takenBy[0].ref} - ${timeDifference(utxo.time - takenBy[0].timestamp)})` : ""}`);
            if (
                txTimestamp >= item.timestamp &&
                (fee.isEqualTo(10601) || fee.isEqualTo(5301) || fee.isEqualTo(3533) || fee.isEqualTo(3534) || fee.isEqualTo(2651) || fee.isEqualTo(2121)) &&
                txIsFree
            ) {
                item.txHash = utxo.txHash;
                item.received = true;
                await database.updateBurn(item);
                console.log(`[INFO] Found! Fee is ${fee.toFixed()} (${timeBetweenBurnAndUTXO})`);
                return;
            } else if (txTimestamp >= item.timestamp && txIsFree && fee.gte(0)) {
                fees.push(`${adjust(balanceChange)} (${timeBetweenBurnAndUTXO})`);
            } else if (txTimestamp >= item.timestamp && fee.gte(0)) {
                taken.push(`${adjust(utxo.balanceChange.toFixed())} (${timeBetweenBurnAndUTXO})`);
            } else if (fee.gte(0)) {
                past.push(`${adjust(utxo.balanceChange.toFixed())} (${timeBetweenBurnAndUTXO})`);
            }
        }
        if (!item.received) {
            let errorMessage = `[burn-sentry] ${network.toLowerCase()} ${item.token} burn #${item.ref.toFixed()} not found (${naturalDiff}) - ${adjust(item.amount)} ${item.token} to ${address}`;
            if (fees.length > 0) {
                errorMessage += ` - Other utxos: ${fees.join(", ")}`;
            }
            if (taken.length > 0) {
                errorMessage += ` - Taken: ${taken.join(", ")}`;
            }
            if (past.length > 0) {
                errorMessage += ` - Too early: ${past.join(", ")}`;
            }

            if (diffMinutes > 10 && !item.sentried) {
                if (reportError(errorMessage)) {
                    item.sentried = true;
                    await database.updateBurn(item);
                }
            } else {
                console.log(`[WARNING] ${errorMessage}`);
            }
        }
    } catch (error) {
        console.error(error);
        logger.error(error);
    }
};
