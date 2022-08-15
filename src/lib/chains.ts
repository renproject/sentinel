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
    Kava,
    Moonbeam,
    Optimism,
    Polygon,
    resolveRpcEndpoints,
    Solana,
    Terra,
    Zcash,
} from "@renproject/chains";
import { EthereumBaseChain } from "@renproject/chains-ethereum/base";
import { ResponseQueryConfig } from "@renproject/provider";
import { Chain, ChainCommon, RenNetwork } from "@renproject/utils";
import BigNumber from "bignumber.js";
import { ethers } from "ethers";
import { Logger } from "winston";

import { INFURA_KEY } from "../config";
import { Transaction } from "../db/entities/Transaction";
import { getEVMLogs } from "./chainHandlers/evm";
import { getSolanaLogs } from "./chainHandlers/solana";

export interface ChainDetails<State = any> {
    chain: Chain;
    defaultSyncedState?: string;
    getLogs?: (
        synced_state: State,
        chains: Chains,
        renVMConfig: ResponseQueryConfig,
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
        case Kava.chain:
        case Moonbeam.chain:
        case Optimism.chain:
        case Polygon.chain: {
            const urls = resolveRpcEndpoints(
                (Chain as unknown as typeof Ethereum).configMap[network]!.config
                    .rpcUrls,
                {
                    INFURA_API_KEY: process.env.INFURA_KEY,
                },
            );

            const provider = new ethers.providers.JsonRpcProvider(urls[0]);
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

const EVMChain = <C extends typeof EthereumBaseChain>(
    chainClass: C,
    startingBlockNumber: string,
    network: RenNetwork,
    logger: Logger,
): ChainDetails<string> => {
    const chain: EthereumBaseChain = initializeChain(
        chainClass as typeof EthereumBaseChain,
        network,
        logger,
    );
    return {
        chain,
        defaultSyncedState: startingBlockNumber,
        getLogs: (syncedState: string, _, renVMConfig: ResponseQueryConfig) =>
            getEVMLogs(
                chain,
                network,
                syncedState,
                new BigNumber(
                    renVMConfig.maxConfirmations[chain.chain] || "0",
                ).toNumber() || undefined,
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
        defaultSyncedState: "{}",
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
    Arbitrum: EVMChain(Arbitrum, "0" /* 205834 */, network, logger),
    Avalanche: EVMChain(Avalanche, "0" /* 2177304 */, network, logger),
    BinanceSmartChain: EVMChain(
        BinanceSmartChain,
        "0" /* 1929336 */,
        network,
        logger,
    ),
    Catalog: EVMChain(Catalog, "0" /* */, network, logger),
    Ethereum: EVMChain(Ethereum, "0" /* 9736758 */, network, logger),
    Fantom: EVMChain(Fantom, "0" /* 7496306 */, network, logger),
    Optimism: EVMChain(Optimism, "0" /* 14250000 */, network, logger),
    Polygon: EVMChain(Polygon, "0" /* 14937138 */, network, logger),

    // Solana
    Solana: SolanaChain(Solana, network, logger),

    // Testnet only networks:
    ...(network === RenNetwork.Mainnet
        ? {}
        : {
              // EVM
              Kava: EVMChain(Kava, "0" /* */, network, logger),
              Moonbeam: EVMChain(Moonbeam, "0" /* */, network, logger),
              Goerli: EVMChain(Goerli, "0", network, logger),
          }),
});

export type Chains = ReturnType<typeof initializeChains>;
