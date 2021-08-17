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
            new Web3(
                `${
                    EthereumConfigMap[RenNetwork.Mainnet].infura
                }/v3/${INFURA_KEY}`,
            ).currentProvider,
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
        network: RenNetwork.MainnetVDot3,
        chain: BinanceSmartChain(
            new Web3(BscConfigMap[RenNetwork.MainnetVDot3].infura)
                .currentProvider,
            RenNetwork.MainnetVDot3,
        ),
        rpcUrl: BscConfigMap[RenNetwork.MainnetVDot3].infura,
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
        network: RenNetwork.MainnetVDot3,
        chain: Fantom(
            new Web3(FantomConfigMap[RenNetwork.MainnetVDot3].infura)
                .currentProvider,
            RenNetwork.MainnetVDot3,
        ),
        rpcUrl: FantomConfigMap[RenNetwork.MainnetVDot3].infura,
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
        network: RenNetwork.MainnetVDot3,
        chain: Polygon(
            new Web3(PolygonConfigMap[RenNetwork.MainnetVDot3].infura)
                .currentProvider,
            RenNetwork.MainnetVDot3,
        ),
        rpcUrl: PolygonConfigMap[RenNetwork.MainnetVDot3].infura,
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
    timestamp: number;
    sentried: boolean;
    ignored: boolean;
    burnHash: string | undefined;
}
