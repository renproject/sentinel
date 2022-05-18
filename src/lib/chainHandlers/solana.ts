import { Solana } from "@renproject/chains";
import {
    GatewayLayout,
    GatewayStateKey,
} from "@renproject/chains-solana/build/main/layouts";
import { getBurnFromNonce } from "@renproject/chains-solana/build/main/utils";
import { InputChainTransaction, RenNetwork, utils } from "@renproject/utils";
import { PublicKey } from "@solana/web3.js";
import BigNumber from "bignumber.js";
import chalk from "chalk";
import { Logger } from "winston";

import { Transaction } from "../../db/entities/Transaction";
import { Chains } from "../chains";
import { printChain } from "../logger";
import { SECONDS, withTimeout } from "../misc";
import pLimit from "./pLimit";

const throttle = pLimit(3);

const gatewaysMemoized: {
    [network: string]: { [chain: string]: { [gateway: string]: string } };
} = {};
const getGateways = async <C extends Solana>(
    network: RenNetwork,
    chains: Chains,
    chain: C,
): Promise<{ [gateway: string]: string }> => {
    if (gatewaysMemoized[network] && gatewaysMemoized[network][chain.chain]) {
        return gatewaysMemoized[network][chain.chain];
    }

    const assets = Object.values(chains).reduce(
        (acc, chain) => [...acc, ...Object.values(chain.chain.assets)],
        [] as string[],
    );
    // const assets = ["BTC", "DOGE", "LUNA"];

    const mintGateways = (
        await Promise.allSettled(
            assets.map(async (asset) => [
                asset,
                await chain.getMintGateway(asset),
            ]),
        )
    ).reduce((acc, result) => {
        if (result.status === "rejected") {
            if (/Unsupported asset/.exec(utils.extractError(result.reason))) {
                return acc;
            } else {
                throw new Error(result.reason);
            }
        }
        return {
            ...acc,
            [result.value[0]]: result.value[1],
        };
    }, {} as { [gateway: string]: string });

    gatewaysMemoized[network] = gatewaysMemoized[network] || {};
    gatewaysMemoized[network][chain.chain] = mintGateways;
    return gatewaysMemoized[network][chain.chain];
};

export const getSolanaLogs = async <C extends Solana>(
    chain: C,
    network: RenNetwork,
    syncedState: string,
    chains: Chains,
    logger: Logger,
): Promise<{ transactions: Transaction[]; newState: string }> => {
    let state = JSON.parse(syncedState || "{}");

    const gateways = await getGateways(network, chains, chain);

    const transactions = [];

    const assets = Object.keys(gateways);
    const assetStates = await Promise.all(
        assets.map(
            async (
                asset,
            ): Promise<{
                transaction: Transaction;
                nextNonce: number;
            } | null> => {
                let nextNonce: number = utils.isDefined(state[asset])
                    ? state[asset] + 1
                    : 1;

                const burn = await throttle<InputChainTransaction | undefined>(
                    () =>
                        withTimeout(
                            getBurnFromNonce(
                                chain.provider,
                                chain.chain,
                                asset,
                                new PublicKey(gateways[asset]),
                                nextNonce,
                            ),
                            10 * SECONDS,
                        ),
                );

                if (burn) {
                    logger.info(
                        `[${printChain(
                            chain.chain,
                        )}] New ${asset} transaction with nonce ${chalk.yellow(
                            nextNonce,
                        )}.`,
                    );

                    const transaction = new Transaction({
                        asset: asset.replace(/^ren/, ""),
                        fromTxHash: burn.txHash,
                        fromTxIndex: burn.txindex,
                        nonce: utils.toURLBase64(
                            utils.toNBytes(
                                new BigNumber(nextNonce.toString()),
                                32,
                            ),
                        ),
                        amount: burn.amount,
                        toRecipient: utils.toURLBase64(
                            Buffer.from(burn.toRecipient || ""),
                        ),
                        fromChain: chain.chain,
                        toChain: null,
                        toPayload: null,
                        toTxHash: null,
                        renVmHash: null,
                    });

                    return { transaction, nextNonce };
                }
                return null;
            },
        ),
    );

    for (let i = 0; i < assets.length; i++) {
        const assetState = assetStates[i];
        if (assetState) {
            transactions.push(assetState.transaction);
            state[assets[i]] = assetState.nextNonce;
        }
    }

    return { transactions, newState: JSON.stringify(state) };
};
