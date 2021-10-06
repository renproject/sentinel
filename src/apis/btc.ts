import Axios from "axios";
import { List } from "immutable";

import { getRenNetworkDetails } from "@renproject/interfaces";

import { BlockChairAddress } from "../apis/btcTypes";
import { Network, Token } from "../types/types";

export interface StdTransaction {
    txHash: string;
    time: number;
    balanceChange: number;
    numberOfVOuts: number | undefined;
    numberOfVIns: number | undefined;
    fee?: number;
}

export const getBCHTransactions = async (
    network: Network,
    token: Token,
    address: string,
): Promise<List<StdTransaction>> => {
    if (token.symbol !== "BCH") {
        throw new Error(`Unsupported token ${token.symbol}`);
    }

    if (getRenNetworkDetails(network.network).isTestnet) {
        throw new Error(
            `Unsupported network ${network.name} for token ${token.symbol}`,
        );
    }

    const url = "bitcoin-cash";

    // TODO: Use pagination like ZEC to search until a timestamp.
    const response = (
        await Axios.get<BlockChairAddress>(
            `https://api.blockchair.com/${url}/dashboards/address/${address}?transaction_details=true&limit=100,0`,
        )
    ).data;
    return List(response.data[address].transactions).map((utxo) => ({
        txHash: `${utxo.hash}_${address}_${utxo.balance_change}`,
        time: new Date(`${utxo.time} UTC`).getTime() / 1000,
        balanceChange: utxo.balance_change,
        numberOfVOuts: undefined,
        numberOfVIns: undefined,
    }));
};

export interface Vout {
    scriptpubkey: string;
    scriptpubkey_asm: string;
    scriptpubkey_type: string;
    scriptpubkey_address: string;
    value: number;
}

export interface BlockstreamTX {
    vout: Vout[];
    vin: unknown[];
    txid: string;
    status: {
        confirmed: boolean;
        block_height: number;
        block_hash: string;
        block_time: number;
    };
    fee: number;
}

export interface BlockstreamUTXO {
    txid: string;
    vout: number;
    status: {
        confirmed: boolean;
    };
    value: number;
}

export const getBTCTransactions = async (
    network: Network,
    token: Token,
    address: string,
    untilTime: number,
): Promise<List<StdTransaction>> => {
    if (token.symbol !== "BTC") {
        throw new Error(`Unsupported token ${token.symbol}`);
    }

    const isMainnet = !getRenNetworkDetails(network.network).isTestnet;

    // const url =
    //     isMainnet
    //         ? token === Token.BTC
    //             ? "bitcoin"
    //             : token === Token.BCH
    //             ? "bitcoin-cash"
    //             : ""
    //         : token === Token.BTC
    //         ? "bitcoin/testnet"
    //         : "";

    // if (url === "") {
    //     throw new Error(
    //         `Unsupported network and token pair ${network.name}, ${token.symbol}`,
    //     );
    // }

    let txs: BlockstreamTX[] = [];
    let page = 1;
    let latestTxid = "";

    while (page < 200) {
        // TODO: Use pagination like ZEC to search until a timestamp.
        const response =
            (
                await Axios.get<BlockstreamTX[]>(
                    `https://blockstream.info/${
                        isMainnet ? "" : "testnet/"
                    }api/address/${address}/txs/chain/${latestTxid}`,
                )
            ).data || [];

        txs = txs.concat(response);

        if (response.length < 25) {
            break;
        }

        if (
            response.length > 0 &&
            response[response.length - 1].status.block_time &&
            response[response.length - 1].status.block_time < untilTime
        ) {
            if (page > 2) {
                process.stdout.write(" (reached timestamp)");
            }
            break;
        }

        latestTxid = response[response.length - 1].txid;
        process.stdout.write(
            `${page > 1 ? "\r" : ""}[DEBUG] Fetching page ${page}...`,
        );
        page += 1;
    }
    if (page > 1) {
        console.log("");
    }

    let ret = List<StdTransaction>();
    for (const utxo of txs) {
        for (let i = 0; i < utxo.vout.length; i++) {
            const vout = utxo.vout[i];
            if (vout.scriptpubkey_address === address) {
                ret = ret.push({
                    txHash: `${utxo.txid}_${i}`,
                    time: utxo.status.confirmed
                        ? utxo.status.block_time
                        : Math.floor(Date.now() / 1000),
                    balanceChange: vout.value,
                    numberOfVOuts: utxo.vout.length,
                    numberOfVIns: utxo.vin.length,
                    fee: utxo.fee,
                });
            }
        }
    }

    const utxos = (
        (
            await Axios.get<BlockstreamUTXO[]>(
                `https://blockstream.info/${
                    isMainnet ? "" : "testnet/"
                }api/address/${address}/utxo`,
            )
        ).data || []
    ).filter((utxo) => utxo.status.confirmed === false);
    for (const utxo of utxos) {
        if (ret.filter((tx) => tx.txHash === utxo.txid).size === 0) {
            const tx = (
                await Axios.get<BlockstreamTX>(
                    `https://blockstream.info/${
                        isMainnet ? "" : "testnet/"
                    }api/tx/${utxo.txid}`,
                )
            ).data;

            ret = ret.push({
                txHash: `${utxo.txid}_${utxo.vout}`,
                time: Math.floor(Date.now() / 1000),
                balanceChange: utxo.value,
                numberOfVOuts: tx.vout.length,
                numberOfVIns: tx.vin.length,
                fee: tx.fee,
            });
        }
    }

    return ret;

    // return List(response.data[address].transactions).map(utxo => ({
    //     txHash: `${utxo.hash}_${address}_${utxo.balance_change}`,
    //     time: new Date(`${utxo.time} UTC`).getTime() / 1000,
    //     balanceChange: utxo.balance_change,
    //     numberOfVOuts: undefined,
    // }));
};
