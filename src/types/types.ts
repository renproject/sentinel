import {
    BinanceSmartChain,
    Bitcoin,
    BitcoinCash,
    BscConfigMap,
    Ethereum,
    EthereumConfigMap,
    Fantom,
    FantomConfigMap,
    Polygon,
    PolygonConfigMap,
    Zcash,
} from "@renproject/chains";
import { LockChain, MintChain, RenNetwork } from "@renproject/interfaces";
import BigNumber from "bignumber.js";
import { ethers } from "ethers";
import Web3 from "web3";

import { INFURA_KEY } from "../environmentVariables";

export interface Token {
    symbol: string;
    chain: LockChain;
}

export interface Network {
    name: string;
    network: RenNetwork;
    rpcUrl: string;
    tokens: Token[];
    chain: MintChain;
    blockLimit: number;
}

export const networks: Network[] = [
    {
        name: "MAINNET",
        network: RenNetwork.Mainnet,
        chain: Ethereum(
            new ethers.providers.JsonRpcProvider(
                EthereumConfigMap[RenNetwork.Mainnet].publicProvider({
                    infura: INFURA_KEY,
                }),
            ),
            RenNetwork.Mainnet,
        ),
        rpcUrl: `${
            EthereumConfigMap[RenNetwork.Mainnet].infura
        }/v3/${INFURA_KEY}`,
        tokens: [
            {
                symbol: "BTC",
                chain: Bitcoin(),
            },
            {
                symbol: "ZEC",
                chain: Zcash(),
            },
            {
                symbol: "BCH",
                chain: BitcoinCash(),
            },
        ],
        blockLimit: 10000000,
    },
    {
        name: "BSC_MAINNET",
        network: RenNetwork.Mainnet,
        chain: BinanceSmartChain(
            new ethers.providers.JsonRpcProvider(
                BscConfigMap[RenNetwork.Mainnet].publicProvider(),
            ),
            RenNetwork.Mainnet,
        ),
        rpcUrl: BscConfigMap[RenNetwork.Mainnet].infura,
        tokens: [
            {
                symbol: "BTC",
                chain: Bitcoin(),
            },
            {
                symbol: "ZEC",
                chain: Zcash(),
            },
            {
                symbol: "BCH",
                chain: BitcoinCash(),
            },
        ],
        blockLimit: 5000,
    },
    {
        name: "FANTOM_MAINNET",
        network: RenNetwork.Mainnet,
        chain: Fantom(
            new ethers.providers.JsonRpcProvider(
                FantomConfigMap[RenNetwork.Mainnet].publicProvider(),
            ),
            RenNetwork.Mainnet,
        ),
        rpcUrl: FantomConfigMap[RenNetwork.Mainnet].infura,
        tokens: [
            {
                symbol: "BTC",
                chain: Bitcoin(),
            },
            {
                symbol: "ZEC",
                chain: Zcash(),
            },
            {
                symbol: "BCH",
                chain: BitcoinCash(),
            },
        ],
        blockLimit: 10000000,
    },
    {
        name: "POLYGON_MAINNET",
        network: RenNetwork.Mainnet,
        chain: Polygon(
            new ethers.providers.JsonRpcProvider(
                PolygonConfigMap[RenNetwork.Mainnet].publicProvider(),
            ),
            RenNetwork.Mainnet,
        ),
        rpcUrl: PolygonConfigMap[RenNetwork.Mainnet].infura,
        tokens: [
            {
                symbol: "BTC",
                chain: Bitcoin(),
            },
            {
                symbol: "ZEC",
                chain: Zcash(),
            },
            {
                symbol: "BCH",
                chain: BitcoinCash(),
            },
        ],
        blockLimit: 1000,
    },
    // {
    //     name: "TESTNET",
    //     rpcUrl: `https://kovan.infura.io/v3/${INFURA_KEY}`,
    //     tokens: [
    //         {
    //             symbol: "BTC",
    //         },
    //         {
    //             symbol: "ZEC",
    //         },
    //         {
    //             symbol: "BCH",
    //         }
    //     ],
    // },
];

export interface Burn {
    // tslint:disable: readonly-keyword
    ref: BigNumber;
    network: Network;
    token: Token;
    address: string;
    amount: BigNumber;
    received: boolean;
    txHash: string | null;
    fromTxHash: string;
    timestamp: number;
    sentried: boolean;
    ignored: boolean;
    burnHash: string | undefined;
}
