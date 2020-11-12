import RenJS from "@renproject/ren";
import BigNumber from "bignumber.js";
import { Map } from "immutable";
import Web3 from "web3";
import { sha3 } from "web3-utils";
import { Logger } from "winston";

import { Burn, Network, Token } from "../types/types";

let web3s = Map<string, Web3>();

const getWeb3 = (network: string) => {
    const infuraURL = `https://${network}.infura.io/v3/${process.env.INFURA_KEY}`;

    if (web3s.has(infuraURL)) {
        return web3s.get(infuraURL);
    }

    const web3 = new Web3(infuraURL);
    web3s = web3s.set(infuraURL, web3);
    return web3;
};

export class ContractReader {
    public web3: Web3 | undefined;
    public sdk: RenJS | undefined;

    constructor(_logger: Logger) {
        // this.logger = logger;
    }

    public readonly connect = async (
        network: Network,
    ): Promise<ContractReader> => {
        this.sdk = new RenJS(network.toLowerCase());
        this.web3 = getWeb3(this.sdk.network.isTestnet ? "kovan" : "mainnet");
        return this;
    };

    public readonly stop = () => {
        try {
            if (!this.web3) {
                throw new Error("Web3 not defined");
            }
            if (this.web3.currentProvider) {
                try {
                    ((this.web3.currentProvider as unknown) as {
                        readonly engine: { readonly stop: () => void };
                    }).engine.stop();
                } catch (error) {
                    // Ignore error
                }
            }
        } catch (error) {
            // Ignore error
        }
    };

    public getShifter = (network: Network, token: Token): string => {
        switch (network) {
            case Network.Mainnet:
                switch (token) {
                    case Token.BTC:
                        return "0xe4b679400F0f267212D5D812B95f58C83243EE71";
                    case Token.ZEC:
                        return "0xc3BbD5aDb611dd74eCa6123F05B18acc886e122D";
                    case Token.BCH:
                        return "0xCc4FF5b8A4A7adb35F00ff0CBf53784e07c3C52F";
                }
            case Network.Testnet:
                switch (token) {
                    case Token.BTC:
                        return "0x55363c0dBf97Ff9C0e31dAfe0fC99d3e9ce50b8A";
                    case Token.ZEC:
                        return "0xAACbB1e7bA99F2Ed6bd02eC96C2F9a52013Efe2d";
                    case Token.BCH:
                        return "0x9827c8a66a2259fd926E7Fd92EA8DF7ed1D813b1";
                }
        }
        throw new Error(
            `Unknown network (${network}) and token (${token}) combination.`,
        );
    };

    public readonly getNewLogs = async (
        network: Network,
        token: Token,
        blockNumber: BigNumber | string,
    ) => {
        if (!this.web3) {
            throw new Error("Web3 not defined");
        }

        console.log(`Getting new logs from ${blockNumber.toString()}`);

        const currentBlock = new BigNumber(
            await this.web3.eth.getBlockNumber(),
        ).minus(1);

        const events = await this.web3.eth.getPastLogs({
            address: this.getShifter(network, token),
            fromBlock: blockNumber.toString(),
            toBlock: currentBlock.toString(),
            topics: [sha3("LogBurn(bytes,uint256,uint256,bytes)")],
        });
        if (events.length > 0) {
            console.log(
                `[${network}][${token}] Got ${events.length} events. Getting timestamps...`,
            );
        }

        // const events = [{
        //     address: '0x1258d7FF385d1d81017d4a3d464c02f74C61902a',
        //     blockHash: '0x30eb35bb07064f07982a5fd0cbf5ecce69b77f1dbc0ba98e62eb08e5907a2241',
        //     blockNumber: 9064433,
        //     data: '0x00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000019b700000000000000000000000000000000000000000000000000000000000000022333339707a416554455a343172685255417164416a52656f73645576655650534c47000000000000000000000000000000000000000000000000000000000000',
        //     logIndex: 132,
        //     removed: false,
        //     topics: [],
        //     transactionHash: '0x518f781312eb6d3c082bd99944ef12f2d32cf85672026e3a84db74f357157765',
        //     transactionIndex: 151,
        //     id: 'log_0x7662a5baaf039f096a5d3992a6cdd284ef407def1966b2899f2092afe9141d74'
        // }];

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
                    `[${network}][${token}] Got timestamp ${i}/${events.length}...`,
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
                timestamp,
                sentried: false,
                ignored: false,
            };
            // return burn;
            burns.push(burn);
        }

        return { burns, currentBlock };
    };

    // Submit burn to RenVM.
    submitBurn = async (
        sendToken: "BTC" | "ZEC" | "BCH",
        burnReference: number,
    ): Promise<void> => {
        if (!this.web3) {
            throw new Error("Web3 not defined");
        }

        let renVMHash = "";
        await new RenJS()
            .burnAndRelease({
                web3Provider: this.web3.currentProvider,
                sendToken,
                burnReference,
            })
            .submit()
            .on("txHash", (txHash) => {
                console.log("txHash:", txHash);
                renVMHash = txHash;
            })
            .on("status", (status) =>
                console.log(`[${renVMHash}] status:`, status),
            );
    };
}
