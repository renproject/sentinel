import {
    Arbitrum,
    Avalanche,
    BinanceSmartChain,
    Bitcoin,
    BitcoinCash,
    DigiByte,
    Dogecoin,
    Ethereum,
    Fantom,
    Filecoin,
    Goerli,
    Polygon,
    Solana,
    Terra,
    Zcash,
} from "@renproject/chains";
import { EthereumBaseChain } from "@renproject/chains-ethereum/build/main/base";
import { resolveNetwork } from "@renproject/chains-solana/build/main/networks";
import { Chain, ChainCommon, RenNetwork } from "@renproject/utils";
import BigNumber from "bignumber.js";
import { ethers } from "ethers";
import { Logger } from "winston";

import { INFURA_KEY } from "../config";
import { Transaction } from "../db/entities/Transaction";
import { getEVMLogs, getEVMPayload } from "./evm";

export interface ChainDetails {
    chain: Chain;
    getLogs?: (
        fromHeight: BigNumber | null,
    ) => Promise<{ burns: Transaction[]; currentBlock: BigNumber }>;
    getPayload?: (txHash: string) => Promise<{ chain: string }>;
}

export const initializeChain = <T extends ChainCommon>(
    Chain: {
        chain: string;
        new (...params: any[]): T;
    },
    network = RenNetwork.Testnet,
    logger: Logger,
): T => {
    switch (Chain.chain) {
        // Bitcoin chains
        case Bitcoin.chain:
        case BitcoinCash.chain:
        case Zcash.chain:
        case DigiByte.chain:
        case Dogecoin.chain: {
            return new (Chain as unknown as typeof Bitcoin)({
                network,
            }) as ChainCommon as T;
        }

        // Filecoin
        case Filecoin.chain: {
            return new (Chain as unknown as typeof Filecoin)({
                network,
            }) as ChainCommon as T;
        }

        // Terra
        case Terra.chain: {
            return new (Chain as unknown as typeof Terra)({
                network,
            }) as ChainCommon as T;
        }

        // EVM chains
        case Ethereum.chain:
        case BinanceSmartChain.chain:
        case Fantom.chain:
        case Polygon.chain:
        case Arbitrum.chain:
        case Avalanche.chain:
        case Goerli.chain: {
            // case Kava.chain:
            const provider = new ethers.providers.JsonRpcProvider(
                Chain.chain === "Ethereum"
                    ? `https://mainnet.infura.io/v3/${INFURA_KEY}`
                    : (Chain as unknown as typeof Ethereum).configMap[network]
                          .config.rpcUrls[0],
            );
            return new (Chain as unknown as typeof Ethereum)({
                network,
                provider,
            }) as ChainCommon as T;
        }

        // Solana
        case Solana.chain: {
            return new (Chain as unknown as typeof Solana)({
                network,
                provider: resolveNetwork(network).endpoint,
            }) as ChainCommon as T;
        }

        default: {
            throw new Error(`No test initializer for ${Chain.chain}.`);
        }
    }
};

const EVMChain = <C extends typeof EthereumBaseChain>(
    chainClass: C,
    network: RenNetwork,
    logger: Logger,
) => {
    const chain: EthereumBaseChain = initializeChain(
        chainClass,
        network,
        logger,
    );
    return {
        chain,
        getLogs: (fromHeight: BigNumber | null) =>
            getEVMLogs(chain, network, fromHeight, logger),
        getPayload: (txHash: string) => getEVMPayload(chain, txHash),
    };
};

export const initializeChains = (
    network: RenNetwork,
    logger: Logger,
): { [chain: string]: ChainDetails } => ({
    // Lock-chains
    Bitcoin: {
        chain: initializeChain(Bitcoin, network, logger),
    },
    BitcoinCash: {
        chain: initializeChain(BitcoinCash, network, logger),
    },
    DigiByte: {
        chain: initializeChain(DigiByte, network, logger),
    },
    Dogecoin: {
        chain: initializeChain(Dogecoin, network, logger),
    },
    Zcash: {
        chain: initializeChain(Zcash, network, logger),
    },
    Filecoin: {
        chain: initializeChain(Filecoin, network, logger),
    },
    Terra: {
        chain: initializeChain(Terra, network, logger),
    },

    // EVM cains
    Arbitrum: EVMChain(Arbitrum, network, logger),
    Avalanche: EVMChain(Avalanche, network, logger),
    BinanceSmartChain: EVMChain(BinanceSmartChain, network, logger),
    Ethereum: EVMChain(Ethereum, network, logger),
    Fantom: EVMChain(Fantom, network, logger),
    // Goerli: EVMChain(Goerli, network, logger),
    Polygon: EVMChain(Polygon, network, logger),

    // Solana
    Solana: {
        chain: initializeChain(Solana, network, logger),
    },
});

export type Chains = ReturnType<typeof initializeChains>;
