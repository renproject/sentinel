import Axios from "axios";
import BigNumber from "bignumber.js";
import { List } from "immutable";

import { Network, Token } from "../types/types";
import { StdTransaction } from "./btc";
import { ZChainAddress } from "./zchain";
import { ZecInsightAddress } from "./zecInsight";

export const getZECTransactions = async (network: Network, token: Token, address: string): Promise<List<StdTransaction>> => {

    if (token !== Token.ZEC) {
        throw new Error(`Unsupported token ${token}`);
    }

    let ret = List<StdTransaction>();

    if (network === Network.Chaosnet) {

        const limit = 20;
        const URL = (offset: number) => `https://api.zcha.in/v2/mainnet/accounts/${address}/recv?sort=value&direction=ascending&limit=${limit}&offset=${offset}`;

        let utxos: ZChainAddress = [];

        let currentOffset = 0;
        while (currentOffset < 1000) {
            const response = (await Axios.get<ZChainAddress>(URL(currentOffset))).data;
            utxos = utxos.concat(response);
            if (response.length < limit) {
                break;
            }
            console.log(`\n\n\nMore than 20! (${currentOffset})\n\n`);
            currentOffset += limit;
        }

        for (const utxo of utxos) {
            let balanceChange = 0;
            for (const vout of utxo.vout) {
                if (vout.scriptPubKey.addresses && vout.scriptPubKey.addresses.includes(address)) {
                    balanceChange = balanceChange + vout.valueZat;
                }
            }
            ret = ret.push({
                txHash: utxo.hash,
                time: utxo.timestamp,
                balanceChange,
            });
        }

    } else {
        const URL = `https://explorer.testnet.z.cash/api/addrs/${address}/txs`;

        const utxos = (await Axios.get<ZecInsightAddress>(URL)).data.items;

        for (const utxo of utxos) {
            let balanceChange = new BigNumber(0);
            for (const vout of utxo.vout) {
                if (vout.scriptPubKey.addresses && vout.scriptPubKey.addresses.includes(address)) {
                    balanceChange = balanceChange.plus(new BigNumber(vout.value).times(new BigNumber(10).exponentiatedBy(8)));
                }
            }
            ret = ret.push({
                txHash: utxo.blockhash,
                time: utxo.time,
                balanceChange: balanceChange.decimalPlaces(0).toNumber(),
            });
        }
    }

    return ret;
};
