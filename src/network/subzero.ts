import { Ethereum } from "@renproject/chains";
import { LogLevel } from "@renproject/interfaces";
import RenJS from "@renproject/ren";
import BigNumber from "bignumber.js";
import { Map } from "immutable";
import Web3 from "web3";
import { Log } from "web3-core";
import { sha3 } from "web3-utils";
import { Logger } from "winston";

import { reportError } from "../lib/sentry";
import { Burn, Network, Token } from "../types/types";

let web3s = Map<string, Web3>();

const getWeb3 = (rpcUrl: string) => {
    if (web3s.has(rpcUrl)) {
        return web3s.get(rpcUrl);
    }

    const web3 = new Web3(rpcUrl);
    web3s = web3s.set(rpcUrl, web3);
    return web3;
};

export class ContractReader {
    public web3: Web3 | undefined;
    public network: Network | undefined;
    public renJS: RenJS | undefined;

    public alreadySubmitting: Map<Token, Map<number, boolean>>;

    constructor(_logger: Logger) {
        // this.logger = logger;
        this.alreadySubmitting = Map<Token, Map<number, boolean>>();
    }

    public readonly connect = async (
        network: Network,
    ): Promise<ContractReader> => {
        this.network = network;
        this.renJS = new RenJS(network.network);
        this.web3 = getWeb3(network.rpcUrl);
        return this;
    };

    public readonly stop = () => {
        try {
            if (!this.web3) {
                throw new Error("Web3 not defined");
            }
            if (this.web3.currentProvider) {
                try {
                    (
                        this.web3.currentProvider as unknown as {
                            readonly engine: { readonly stop: () => void };
                        }
                    ).engine.stop();
                } catch (error) {
                    // Ignore error
                }
            }
        } catch (error) {
            // Ignore error
        }
    };

    public readonly getNewLogs = async (
        network: Network,
        token: Token,
        blockNumberIn: BigNumber | string,
    ) => {
        if (!this.web3) {
            throw new Error("Web3 not defined");
        }

        let fromBlock = new BigNumber(blockNumberIn);

        let latestBlock = new BigNumber(
            await this.web3.eth.getBlockNumber(),
        ).minus(1);

        if (fromBlock.isGreaterThan(latestBlock)) {
            return { burns: [], currentBlock: fromBlock };
        }

        const gatewayAddress = await (
            network.chain as Ethereum
        ).getGatewayContractAddress(token.symbol);

        let events: Log[] = [];

        let batchesRemaining = 1;

        let toBlock;

        while (fromBlock.isLessThan(latestBlock) && batchesRemaining > 0) {
            toBlock = BigNumber.min(
                latestBlock,
                fromBlock.plus(network.blockLimit),
            );

            const blocksBeingFetched = toBlock.minus(fromBlock);
            const totalRemainingBlocks = latestBlock.minus(fromBlock);

            console.log(
                `Getting new logs from ${fromBlock.toString()} to ${toBlock.toString()} (${blocksBeingFetched.toString()} of ${totalRemainingBlocks.toString()})`,
            );

            const newEvents = await this.web3.eth.getPastLogs({
                address: gatewayAddress,
                fromBlock: fromBlock.toString(),
                toBlock: toBlock.toString(),
                topics: [sha3("LogBurn(bytes,uint256,uint256,bytes)")],
            });

            events = events.concat(...(newEvents as Log[]));

            fromBlock = toBlock.plus(1);
            batchesRemaining -= 1;
        }

        if (events.length > 0) {
            console.log(
                `[${network.name}][${token.symbol}] Got ${events.length} events. Getting timestamps...`,
            );
        }

        const burns: Burn[] = [];

        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if (!this.web3) {
                throw new Error("Web3 not defined");
            }

            const decoded = this.web3.eth.abi.decodeParameters(
                ["bytes", "uint256"],
                event.data,
            );

            if (i > 0 && i % 50 === 0) {
                console.log(
                    `[${network.name}][${token.symbol}] Got timestamp ${i}/${events.length}...`,
                );
            }

            const blocknumber = event.blockNumber;
            const timestamp = new BigNumber(
                (await this.web3.eth.getBlock(blocknumber)).timestamp,
            ).toNumber();

            const burn: Burn = {
                ref: new BigNumber(event.topics[1] as string, 16),
                network,
                token,
                amount: new BigNumber(decoded[1].toString()),
                address: decoded[0],
                received: false,
                txHash: "",
                fromTxHash: event.transactionHash,
                burnHash: event.transactionHash,
                timestamp,
                sentried: false,
                ignored: false,
            };
            // return burn;
            burns.push(burn);
        }

        return { burns, currentBlock: toBlock || fromBlock };
    };

    getReleaseFees = async (
        sendToken: Token,
    ): Promise<{ release: BigNumber | undefined; burn: number }> => {
        if (!this.renJS || !this.network) {
            throw new Error("Web3 not defined");
        }

        const fees = await this.renJS.getFees({
            asset: sendToken.symbol,
            from: this.network.chain,
            to: sendToken.chain,
        });

        return {
            release: fees.release,
            burn: fees.burn,
        };
    };

    // Submit burn to RenVM.
    submitBurn = async (
        sendToken: Token,
        burnReference: number,
        burnHash?: string,
    ): Promise<void> => {
        if (!this.web3 || !this.network) {
            throw new Error("Web3 not defined");
        }

        if (this.alreadySubmitting.getIn([sendToken, burnReference])) {
            return;
        }

        this.alreadySubmitting = this.alreadySubmitting.setIn(
            [sendToken, burnReference],
            true,
        );

        try {
            let renVMHash = "";
            const burnAndRelease = await new RenJS("mainnet", {
                logLevel: LogLevel.Log,
            }).burnAndRelease({
                asset: sendToken.symbol,
                from: this.network.chain,
                to: sendToken.chain,
                burnNonce: burnReference,
                transaction: burnHash ? burnHash : undefined,
                // transaction:
                // "0xcb504163f65322b8f8cd56a3ae1f2d4bd196e5f262b198608fdbe9740d5eda53",
            });

            await burnAndRelease.burn();

            // await burnAndRelease.burn();

            await burnAndRelease
                .release()
                .on("txHash", (txHash) => {
                    console.log("txHash:", txHash);
                    renVMHash = txHash;
                })
                .on("status", (status) =>
                    console.log(`[${renVMHash}] status:`, status),
                );
        } catch (error) {
            this.alreadySubmitting = this.alreadySubmitting.setIn(
                [sendToken, burnReference],
                false,
            );

            throw error;
        }
    };
}
