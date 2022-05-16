import { Ethereum } from "@renproject/chains";
import { LogLevel } from "@renproject/interfaces";
import RenJS from "@renproject/ren";
import BigNumber from "bignumber.js";
import chalk from "chalk";
import { Map } from "immutable";
import Web3 from "web3";
import { Log } from "web3-core";
import { sha3 } from "web3-utils";
import { Logger } from "winston";

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
    public logger: Logger;

    public alreadySubmitting: Map<Token, Map<number, boolean>>;

    constructor(logger: Logger) {
        this.logger = logger;
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
            release: fees.fixedFee,
            burn: fees.variableFee,
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
                logger: {
                    error: (...m: unknown[]) =>
                        this.logger.error(chalk.gray(m)),
                    warn: (...m: unknown[]) => this.logger.warn(chalk.gray(m)),
                    log: (...m: unknown[]) => this.logger.info(chalk.gray(m)),
                    info: (...m: unknown[]) => this.logger.info(chalk.gray(m)),
                    debug: (...m: unknown[]) =>
                        this.logger.debug(chalk.gray(m)),
                    trace: (...m: unknown[]) =>
                        this.logger.debug(chalk.gray(m)),
                },
            }).gateway({
                asset: sendToken.symbol,
                from: this.network.chain,
                to: {
                    ...sendToken.chain,
                    addressToBytes: (address) => {
                        return Buffer.from(address);
                    },
                },
                burnNonce: burnReference,
                transaction: burnHash ? burnHash : undefined,
            });

            await burnAndRelease.burn();

            // await burnAndRelease.burn();

            await burnAndRelease
                .release()
                .on("txHash", (txHash) => {
                    this.logger.info(chalk.gray("txHash:", txHash));
                    renVMHash = txHash;
                })
                .on("status", (status) => {
                    this.logger.info(
                        chalk.gray(`[${renVMHash}] status:`, status),
                    );
                });
        } catch (error) {
            this.alreadySubmitting = this.alreadySubmitting.setIn(
                [sendToken, burnReference],
                false,
            );

            throw error;
        }
    };
}
