import {
    Arbitrum,
    Avalanche,
    BinanceSmartChain,
    Bitcoin,
    BitcoinCash,
    Catalog,
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
import { Chain, ChainCommon, RenNetwork } from "@renproject/utils";
import { ethers } from "ethers";
import { Logger } from "winston";

import { INFURA_KEY } from "../config";
import { Transaction } from "../db/entities/Transaction";
import { getEVMLogs } from "./chainHandlers/evm";
import { getSolanaLogs } from "./chainHandlers/solana";

export interface ChainDetails<State = any> {
    chain: Chain;
    getLogs?: (
        synced_state: State,
        chains: Chains,
    ) => Promise<{ transactions: Transaction[]; newState: State }>;
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
        case Arbitrum.chain:
        case Avalanche.chain:
        case BinanceSmartChain.chain:
        case Catalog.chain:
        case Ethereum.chain:
        case Fantom.chain:
        case Goerli.chain:
        case Polygon.chain: {
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
            }) as ChainCommon as T;
        }

        default: {
            throw new Error(`No test initializer for ${Chain.chain}.`);
        }
    }
};

const maxConfirmations = {
    Arbitrum: "18446744073709551615",
    Avalanche: "1500000",
    BinanceSmartChain: "2000000",
    Catalog: "500000",
    Ethereum: "500000",
    Fantom: "6500000",
    Polygon: "3000000",
};

const EVMChain = <C extends typeof EthereumBaseChain>(
    chainClass: C,
    network: RenNetwork,
    logger: Logger,
): ChainDetails<string> => {
    const chain: EthereumBaseChain = initializeChain(
        chainClass,
        network,
        logger,
    );
    return {
        chain,
        getLogs: (syncedState: string) =>
            getEVMLogs(
                chain,
                network,
                syncedState,
                maxConfirmations[chain.chain],
                logger,
            ),
    };
};

const SolanaChain = <C extends typeof Solana>(
    chainClass: C,
    network: RenNetwork,
    logger: Logger,
): ChainDetails<string> => {
    const chain: Solana = initializeChain(chainClass, network, logger);
    return {
        chain,
        getLogs: (syncedState: string, chains: Chains) =>
            getSolanaLogs(chain, network, syncedState, chains, logger),
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
    Catalog: EVMChain(Catalog, network, logger),
    Ethereum: EVMChain(Ethereum, network, logger),
    Fantom: EVMChain(Fantom, network, logger),
    // Goerli: EVMChain(Goerli, network, logger),
    Polygon: EVMChain(Polygon, network, logger),

    // Solana
    Solana: SolanaChain(Solana, network, logger),
});

export type Chains = ReturnType<typeof initializeChains>;
