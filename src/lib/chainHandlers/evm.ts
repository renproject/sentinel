import { EthereumBaseChain } from "@renproject/chains-ethereum/build/main/base";
import { getGatewayRegistryInstance } from "@renproject/chains-ethereum/build/main/contracts";
import { RenNetwork, utils } from "@renproject/utils";
import BigNumber from "bignumber.js";
import { Interface, LogDescription } from "ethers/lib/utils";
import { Logger } from "winston";

import { Transaction } from "../../db/entities/Transaction";
import GatewayABI from "../ABIs/Gateway.json";
import { printChain } from "../logger";
import { reportError } from "../sentry";

const gatewaysMemoized: {
    [network: string]: { [chain: string]: { [gateway: string]: string } };
} = {};
const getGateways = async <C extends EthereumBaseChain>(
    network: RenNetwork,
    chain: C,
): Promise<{ [gateway: string]: string }> => {
    if (gatewaysMemoized[network] && gatewaysMemoized[network][chain.chain]) {
        return gatewaysMemoized[network][chain.chain];
    }

    const gatewayRegistry = await getGatewayRegistryInstance(
        chain.provider,
        chain.network.addresses.GatewayRegistry,
    );
    const mintAssets: string[] = await gatewayRegistry.getMintGatewaySymbols(
        0,
        0,
    );
    const mintGateways = await Promise.all(
        mintAssets.map((asset) =>
            gatewayRegistry.getMintGatewayBySymbol(asset),
        ),
    );

    const lockAssets: string[] = await gatewayRegistry.getLockGatewaySymbols(
        0,
        0,
    );
    const lockGateways = await Promise.all(
        lockAssets.map((asset) =>
            gatewayRegistry.getLockGatewayBySymbol(asset),
        ),
    );

    gatewaysMemoized[network] = gatewaysMemoized[network] || {};
    gatewaysMemoized[network][chain.chain] = {
        ...mintGateways.reduce(
            (acc, gateway, i) => ({
                ...acc,
                [gateway]: mintAssets[i],
            }),
            {},
        ),
        ...lockGateways.reduce(
            (acc, gateway, i) => ({
                ...acc,
                [gateway]: lockAssets[i],
            }),
            {},
        ),
    };
    return gatewaysMemoized[network][chain.chain];
};

// To avoid having to handle block shuffles, we ignore the latest 5 blocks when
// syncing events.
const LATEST_BLOCK_OFFSET = 5;

const LOG_BURN = "LogBurn(bytes,uint256,uint256,bytes)";
const LOG_BURN_TO_CHAIN =
    "LogBurnToChain(string,string,bytes,uint256,uint256,string,string)";
const LOG_LOCK_TO_CHAIN =
    "LogLockToChain(string,string,bytes,uint256,uint256,string,string)";

export const getEVMLogs = async <C extends EthereumBaseChain>(
    chain: C,
    network: RenNetwork,
    syncedState: string,
    maximumConfirmations: number,
    logger: Logger,
): Promise<{ transactions: Transaction[]; newState: string }> => {
    const transactions: Transaction[] = [];

    let latestBlock = new BigNumber(
        await chain.provider.getBlockNumber(),
    ).minus(LATEST_BLOCK_OFFSET);

    const gateways = await getGateways(network, chain);

    const fromBlock = BigNumber.max(
        syncedState ? new BigNumber(syncedState).plus(1) : new BigNumber(0),
        latestBlock.minus(maximumConfirmations),
    );

    // No blocks to fetch.
    if (fromBlock.isGreaterThan(latestBlock)) {
        return { transactions, newState: syncedState };
    }

    const toBlock = BigNumber.min(
        latestBlock,
        fromBlock.plus(chain.network.logRequestLimit || 100000),
    );

    const blocksBeingFetched = toBlock.minus(fromBlock).plus(1);
    const totalRemainingBlocks = latestBlock.minus(fromBlock).plus(1);

    logger.info(
        `[${printChain(
            chain.chain,
        )}] Getting new logs from ${fromBlock.toString()} to ${toBlock.toString()} (${blocksBeingFetched.toString()} of ${totalRemainingBlocks.toString()}, ${blocksBeingFetched
            .dividedBy(totalRemainingBlocks)
            .times(100)
            .decimalPlaces(2)
            .toFixed()}%)`,
    );

    const gatewayABI = new Interface(GatewayABI);
    gatewayABI.events;

    // Fetch burn and lock events.
    const logFilter = {
        fromBlock: fromBlock.toNumber(),
        toBlock: toBlock.toNumber(),
    };
    const [burnEvents, burnToChainEvents, lockToChainEvents] =
        await Promise.all([
            chain.provider.getLogs({
                ...logFilter,
                topics: [utils.Ox(utils.keccak256(Buffer.from(LOG_BURN)))],
            }),
            chain.provider.getLogs({
                ...logFilter,
                topics: [
                    utils.Ox(utils.keccak256(Buffer.from(LOG_BURN_TO_CHAIN))),
                ],
            }),
            chain.provider.getLogs({
                ...logFilter,
                topics: [
                    utils.Ox(utils.keccak256(Buffer.from(LOG_LOCK_TO_CHAIN))),
                ],
            }),
        ]);

    for (const event of burnEvents) {
        try {
            const decoded = gatewayABI.parseLog(event) as unknown as Omit<
                LogDescription,
                "args"
            > & {
                args: [
                    /* to: */ string,
                    /* amount: */ { toString(): string },
                    /* burnNonce: */ { toString(): string },
                    /* indexedTo: */ string,
                ];
            };
            const [to, amount, burnNonce] = decoded.args;

            const asset = gateways[event.address];
            if (!asset) {
                logger.error(
                    `Event from an invalid contract: ${event.address}, ${event.transactionHash}`,
                );
                continue;
            }

            const burn = new Transaction({
                asset: asset.replace(/^ren/, ""),
                fromTxHash: event.transactionHash,
                fromTxIndex: "0",
                nonce: utils.toURLBase64(
                    utils.toNBytes(new BigNumber(burnNonce.toString()), 32),
                ),
                amount: amount.toString(),
                toRecipient: utils.toURLBase64(utils.fromHex(to)),
                fromChain: chain.chain,
                toChain: null,
                toPayload: null,
                toTxHash: null,
                renVmHash: null,
            });
            transactions.push(burn);
        } catch (error) {
            reportError(
                `[burn-sentry][internal] Skipping ${chain.chain} log ${
                    event.transactionHash
                }: ${utils.extractError(error)}`,
            );
        }
    }

    for (const event of burnToChainEvents) {
        try {
            const decoded = gatewayABI.parseLog(event) as unknown as {
                args: [
                    /* recipientAddress: */ string,
                    /* recipientChain: */ string,
                    /* recipientPayload: */ string,
                    /* amount: */ { toString(): string },
                    /* burnNonce: */ { toString(): string },
                ];
            } & Omit<LogDescription, "args">;
            const [
                recipientAddress,
                recipientChain,
                recipientPayload,
                amount,
                burnNonce,
            ] = decoded.args;

            const asset = gateways[event.address];
            if (!asset) {
                logger.error(
                    `Event from an invalid contract: ${event.address}, ${event.transactionHash}`,
                );
                continue;
            }

            const burn = new Transaction({
                asset: asset.replace(/^ren/, ""),
                fromTxHash: event.transactionHash,
                fromTxIndex: "0",
                nonce: utils.toURLBase64(
                    utils.toNBytes(new BigNumber(burnNonce.toString()), 32),
                ),
                amount: amount.toString(),
                toRecipient: utils.toURLBase64(Buffer.from(recipientAddress)),
                fromChain: chain.chain,
                toChain: recipientChain || null,
                toPayload: utils.toURLBase64(utils.fromHex(recipientPayload)),
                toTxHash: null,
                renVmHash: null,
            });
            transactions.push(burn);
        } catch (error: any) {
            reportError(
                `[burn-sentry][internal] Skipping ${chain.chain} log ${
                    event.transactionHash
                }: ${utils.extractError(error)}`,
            );
        }
    }

    for (const event of lockToChainEvents) {
        try {
            const decoded = gatewayABI.parseLog(event) as unknown as {
                args: [
                    /* recipientAddress: */ string,
                    /* recipientChain: */ string,
                    /* recipientPayload: */ string,
                    /* amount: */ { toString(): string },
                    /* lockNonce: */ { toString(): string },
                ];
            } & Omit<LogDescription, "args">;
            const [
                recipientAddress,
                recipientChain,
                recipientPayload,
                amount,
                lockNonce,
            ] = decoded.args;

            const asset = gateways[event.address];
            if (!asset) {
                logger.error(
                    `Event from an invalid contract: ${event.address}, ${event.transactionHash}`,
                );
                continue;
            }

            const burn = new Transaction({
                asset: asset.replace(/^ren/, ""),
                fromTxHash: event.transactionHash,
                fromTxIndex: "0",
                nonce: utils.toURLBase64(
                    utils.toNBytes(new BigNumber(lockNonce.toString()), 32),
                ),
                amount: amount.toString(),
                toRecipient: utils.toURLBase64(Buffer.from(recipientAddress)),
                fromChain: chain.chain,
                toChain: recipientChain || null,
                toPayload: utils.toURLBase64(utils.fromHex(recipientPayload)),
                toTxHash: null,
                renVmHash: null,
            });
            transactions.push(burn);
        } catch (error: any) {
            reportError(
                `[burn-sentry][internal] Skipping ${chain.chain} log ${
                    event.transactionHash
                }: ${utils.extractError(error)}`,
            );
        }
    }

    logger.info(
        `[${printChain(chain.chain)}] Got ${
            transactions.length
        } events from block #${fromBlock.toFixed()} to ${toBlock.toFixed()} (${blocksBeingFetched.toFixed()} blocks)`,
    );

    return { transactions, newState: toBlock.toFixed() };
};
