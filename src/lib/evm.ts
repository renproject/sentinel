import { EthereumBaseChain } from "@renproject/chains-ethereum/build/main/base";
import { getGatewayRegistryInstance } from "@renproject/chains-ethereum/build/main/contracts";
import { RenNetwork, utils } from "@renproject/utils";
import BigNumber from "bignumber.js";
import { Interface, LogDescription } from "ethers/lib/utils";
import { Logger } from "winston";

import { Transaction } from "../db/entities/Transaction";
import { Burn } from "../types/types";
import GatewayABI from "./ABIs/Gateway.json";
import { printChain } from "./logger";

export const getEVMPayload = async <C extends EthereumBaseChain>(
    chain: C,
    txHash: string,
) => {
    return chain.Transaction({
        txidFormatted: txHash,
    });
};

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

export const getEVMLogs = async <C extends EthereumBaseChain>(
    chain: C,
    network: RenNetwork,
    fromBlock: BigNumber | null,
    logger: Logger,
): Promise<{ burns: Transaction[]; currentBlock: BigNumber }> => {
    let latestBlock = new BigNumber(
        await chain.provider.getBlockNumber(),
    ).minus(LATEST_BLOCK_OFFSET);

    fromBlock = fromBlock || latestBlock.minus(1000);

    if (fromBlock.isGreaterThan(latestBlock)) {
        return { burns: [], currentBlock: fromBlock };
    }
    const gateways = await getGateways(network, chain);

    // const toBlock = chain.network.logRequestLimit
    //     ? BigNumber.min(
    //           latestBlock,
    //           fromBlock.plus(chain.network.logRequestLimit),
    //       )
    //     : latestBlock;
    const toBlock = BigNumber.min(
        latestBlock,
        fromBlock.plus(chain.network.logRequestLimit || 100000),
    );

    const blocksBeingFetched = toBlock.minus(fromBlock);
    const totalRemainingBlocks = latestBlock.minus(fromBlock);

    logger.info(
        `[${printChain(
            chain.chain,
        )}] Getting new logs from ${fromBlock.toString()} to ${toBlock.toString()} (${blocksBeingFetched.toString()} of ${totalRemainingBlocks.toString()})`,
    );

    const gatewayABI = new Interface(GatewayABI);
    gatewayABI.events;

    const [burnEvents, burnToChainEvents, lockToChainEvents] =
        await Promise.all([
            chain.provider.getLogs({
                fromBlock: fromBlock.toNumber(),
                toBlock: toBlock.toNumber(),
                topics: [
                    utils.Ox(
                        utils.keccak256(
                            Buffer.from("LogBurn(bytes,uint256,uint256,bytes)"),
                        ),
                    ),
                ],
            }),
            chain.provider.getLogs({
                fromBlock: fromBlock.toNumber(),
                toBlock: toBlock.toNumber(),
                topics: [
                    utils.Ox(
                        utils.keccak256(
                            Buffer.from(
                                "LogBurnToChain(string,string,bytes,uint256,uint256,string,string)",
                            ),
                        ),
                    ),
                ],
            }),
            chain.provider.getLogs({
                fromBlock: fromBlock.toNumber(),
                toBlock: toBlock.toNumber(),
                topics: [
                    utils.Ox(
                        utils.keccak256(
                            Buffer.from(
                                "LogLockToChain(string,string,bytes,uint256,uint256,string,string)",
                            ),
                        ),
                    ),
                ],
            }),
        ]);

    const burns: Transaction[] = [];

    for (const burnEvent of burnEvents) {
        const decoded = gatewayABI.parseLog(burnEvent) as unknown as Omit<
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

        const blocknumber = burnEvent.blockNumber;
        const timestamp = new BigNumber(
            (await chain.provider.getBlock(blocknumber)).timestamp,
        ).toFixed();

        const burn = new Transaction({
            asset: gateways[burnEvent.address].replace(/^ren/, ""),
            fromTxHash: chain.txidFormattedToTxid(burnEvent.transactionHash),
            fromTxIndex: "0",
            fromTxTimestamp: timestamp,
            nonce: utils.toBase64(
                utils.toNBytes(new BigNumber(burnNonce.toString()), 32),
            ),
            amount: amount.toString(),
            toRecipient: utils.toUTF8String(utils.fromHex(to)),
            fromChain: chain.chain,
            toChain: null,
            toPayload: null,
            toTxHash: null,
            renVmHash: null,
            done: false,
            sentried: false,
            ignored: false,
        });
        burns.push(burn);
    }

    for (const burnToChainEvent of burnToChainEvents) {
        const decoded = gatewayABI.parseLog(burnToChainEvent) as unknown as {
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

        const blocknumber = burnToChainEvent.blockNumber;
        const timestamp = new BigNumber(
            (await chain.provider.getBlock(blocknumber)).timestamp,
        ).toFixed();

        const burn = new Transaction({
            asset: gateways[burnToChainEvent.address].replace(/^ren/, ""),
            fromTxHash: chain.txidFormattedToTxid(
                burnToChainEvent.transactionHash,
            ),
            fromTxIndex: "0",
            fromTxTimestamp: timestamp,
            nonce: burnNonce.toString(),
            amount: amount.toString(),
            toRecipient: utils.toUTF8String(utils.fromHex(recipientAddress)),
            fromChain: chain.chain,
            toChain: recipientChain || null,
            toPayload: utils.toBase64(utils.fromHex(recipientPayload)) || null,
            toTxHash: null,
            renVmHash: null,
            done: false,
            sentried: false,
            ignored: false,
        });
        burns.push(burn);
    }

    for (const burnToChainEvent of lockToChainEvents) {
        const decoded = gatewayABI.parseLog(burnToChainEvent) as unknown as {
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

        const blocknumber = burnToChainEvent.blockNumber;
        const timestamp = new BigNumber(
            (await chain.provider.getBlock(blocknumber)).timestamp,
        ).toFixed();

        const burn = new Transaction({
            asset: gateways[burnToChainEvent.address].replace(/^ren/, ""),
            fromTxHash: chain.txidFormattedToTxid(
                burnToChainEvent.transactionHash,
            ),
            fromTxIndex: "0",
            fromTxTimestamp: timestamp,
            nonce: lockNonce.toString(),
            amount: amount.toString(),
            toRecipient: utils.toUTF8String(utils.fromHex(recipientAddress)),
            fromChain: chain.chain,
            toChain: recipientChain || null,
            toPayload: utils.toBase64(utils.fromHex(recipientPayload)) || null,
            toTxHash: null,
            renVmHash: null,
            done: false,
            sentried: false,
            ignored: false,
        });
        burns.push(burn);
    }

    return { burns, currentBlock: toBlock };
};
