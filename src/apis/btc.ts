import Axios from "axios";
import { List } from "immutable";

import { BlockChairAddress } from "../apis/btcTypes";
import { Network, Token } from "../types/types";

export interface StdTransaction {
    txHash: string;
    time: number;
    balanceChange: number;
    numberOfVOuts: number | undefined;
}

export const getBTCTransactions = async (network: Network, token: Token, address: string): Promise<List<StdTransaction>> => {
    const url = network === Network.Chaosnet ?
        (token === Token.BTC ? "bitcoin" : token === Token.BCH ? "bitcoin-cash" : "") :
        (token === Token.BTC ? "bitcoin/testnet" : "");

    if (url === "") {
        throw new Error(`Unsupported network and token pair ${network}, ${token}`);
    }

    const response = (await Axios.get<BlockChairAddress>(`https://api.blockchair.com/${url}/dashboards/address/${address}?transaction_details=true`)).data;
    return List(response.data[address].transactions).map(utxo => ({
        txHash: `${utxo.hash}_${utxo.balance_change}`,
        time: (new Date(`${utxo.time} UTC`)).getTime() / 1000,
        balanceChange: utxo.balance_change,
        numberOfVOuts: undefined,
    }));
};
