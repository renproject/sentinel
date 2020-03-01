import Axios from "axios";
import BigNumber from "bignumber.js";
import { List } from "immutable";
import moment from "moment";
import { Logger } from "winston";

import { Database } from "../adapters/database";
import { BlockChairAddress } from "../apis/btcTypes";
import { ContractReader } from "../chaosdex";
import { reportError } from "../lib/sentry";
import { Burn, Network, Token } from "../types/types";

export const btcVerifyBurn = async (contractReader: ContractReader, logger: Logger, database: Database, network: Network, token: Token, item: Burn) => {
    if (!contractReader.sdk) {
        return;
    }

    try {
        const address = contractReader.sdk.utils[token].addressFrom(item.address);
        const target = item.amount;

        logger.info(`[${network}][${token}] Checking ${address} received ${target.toFixed()} (${item.ref.toFixed()})`);

        const url = network === Network.Chaosnet ?
            (token === Token.BTC ? "bitcoin" : token === Token.BCH ? "bitcoin-cash" : "") :
            (token === Token.BTC ? "bitcoin/testnet" : "");

        if (url === "") {
            return;
        }

        const response = (await Axios.get<BlockChairAddress>(`https://api.blockchair.com/${url}/dashboards/address/${address}?transaction_details=true`)).data;

        if (target.lte(10000)) {
            item.received = true;
            await database.updateBurn(item);
            console.log(`Skipping! Amount is ${target.toFixed()}`);
            return;
        }

        const fees = [];
        const taken = [];
        const past = [];

        const sortedUtxos = List(response.data[address].transactions).sortBy(tx => (new Date(`${tx.time} UTC`)).getTime());

        for (const utxo of sortedUtxos.valueSeq()) {
            const balanceChange = new BigNumber(utxo.balance_change);
            if (balanceChange.isLessThan(0)) {
                continue;
            }
            const txTimestamp = (new Date(`${utxo.time} UTC`)).getTime() / 1000;
            const fee = target.minus(utxo.balance_change);
            const txIsFree = await database.txIsFree(network, token, utxo.hash);
            if (txTimestamp >= item.timestamp && fee.isGreaterThanOrEqualTo(10601) && fee.isLessThanOrEqualTo(10601) && txIsFree) {
                item.txHash = utxo.hash;
                item.received = true;
                await database.updateBurn(item);
                console.log(`Found! Fee is ${fee.toFixed()}`);
                return;
            } else if (txTimestamp >= item.timestamp && txIsFree && fee.gte(0)) {
                fees.push(fee.toFixed());
            } else if (txTimestamp >= item.timestamp && fee.gte(0)) {
                taken.push(fee.toFixed());
            } else if (fee.gte(0)) {
                past.push(fee.toFixed());
            }
        }
        if (!item.received) {
            const diffMinutes = moment().diff(item.timestamp * 1000, "minutes");
            const errorMessage = `[burn-sentry] ${network.toLowerCase()} ${item.token} burn #${item.ref.toFixed()} not found (${diffMinutes} minutes ago) - ${item.amount.div(new BigNumber(10).exponentiatedBy(8)).toFixed()} ${item.token} to ${address}`;
            console.log(`[WARNING] ${errorMessage}`);
            if (diffMinutes > 10 && !item.sentried) {
                if (reportError(errorMessage)) {
                    item.sentried = true;
                    await database.updateBurn(item);
                }
            }
        }
    } catch (error) {
        console.error(error);
        logger.error(error);
    }
};
