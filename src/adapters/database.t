import BigNumber from "bignumber.js";
import chalk from "chalk";
import PGP from "pg-promise";
import pg from "pg-promise/typescript/pg-subset";

import { DATABASE_URL } from "../environmentVariables";
import { Burn, Network, networks, Token } from "../types/types";

const pgp = PGP();

export const NETWORK_PREFIX = "SUBZERO_";

export class Database {
    public connectionString = DATABASE_URL;
    private client: PGP.IDatabase<{}, pg.IClient> | undefined;

    public connect = async () => {
        if (!this.connectionString) {
            throw new Error(`No Database URL!`);
        } else {
            this.client = pgp({
                connectionString: this.connectionString,
                ssl: true,
            });

            await this.client.connect();
            await this.createTable({ drop: false });
        }
    };

    public createTable = async ({ drop }: { drop: boolean }) => {
        if (!this.client) {
            throw new Error(`No client setup, please call 'connect'`);
        }

        if (drop) {
            await this.client.query(`DROP TABLE synced;`);
        }
        await this.client.query(`
            CREATE TABLE IF NOT EXISTS synced (
                network CHAR(30) UNIQUE NOT NULL,
                block DECIMAL NOT NULL
            );`);

        for (const network of networks) {
            const tokens = network.tokens;
            for (const token of tokens) {
                if (drop) {
                    await this.client.query(
                        `DROP TABLE BURNS_${this.networkTokenID(
                            network,
                            token,
                        )};`,
                    );
                }
                console.log(
                    "Loading table",
                    chalk.green(this.networkTokenID(network, token)),
                );
                await this.client.query(`
                    CREATE TABLE IF NOT EXISTS BURNS_${this.networkTokenID(
                        network,
                        token,
                    )} (
                        ref DECIMAL UNIQUE NOT NULL,
                        amount DECIMAL NOT NULL,
                        address CHAR(200) NOT NULL,
                        received BOOLEAN,
                        txhash CHAR(200),
                        timestamp DECIMAL NOT NULL,
                        sentried BOOLEAN NOT NULL,
                        ignored BOOLEAN NOT NULL,
                        burnHash CHAR(200)
                    );`);
                // await this.client.query(`
                //     ALTER TABLE BURNS_${this.networkTokenID(network, token)}
                //     ADD COLUMN ignored BOOLEAN NOT NULL DEFAULT false;
                // `);
            }
        }
    };

    public getLatestBlock = async (
        network: Network,
        token: Token,
    ): Promise<BigNumber> => {
        if (!this.client) {
            throw new Error(`No client setup, please call 'connect'`);
        }

        const results = await this.client.query(
            `SELECT * FROM synced WHERE network=$1;`,
            [this.networkTokenID(network, token)],
        );
        if (results.length) {
            return new BigNumber(results[0].block || "0");
        }
        return new BigNumber(0);
    };

    public setLatestBlock = async (
        network: Network,
        token: Token,
        latestBlock: BigNumber,
    ): Promise<void> => {
        if (!this.client) {
            throw new Error(`No client setup, please call 'connect'`);
        }

        await this.client.query(
            `INSERT INTO synced VALUES ($1, $2) ON CONFLICT (network) DO UPDATE
                SET 
                block = $2
                ;`,

            [this.networkTokenID(network, token), latestBlock.toFixed()],
        );
    };

    public networkTokenID = (network: Network, token: Token): string =>
        `${NETWORK_PREFIX}${network.name}_${token.symbol}`;

    public unmarshalRow =
        (network: Network, token: Token) =>
        (row: {
            ref: number;
            amount: string;
            address: string;
            received: boolean;
            txhash: string;
            timestamp: number;
            sentried: boolean;
            ignored: boolean;
            burnhash: string | undefined;
        }) => {
            const ret: Burn = {
                ref: new BigNumber(row.ref),
                network,
                token,
                amount: new BigNumber(row.amount),
                address: row.address,
                received: row.received,
                txHash: row.txhash,
                timestamp: row.timestamp,
                sentried: row.sentried,
                ignored: row.ignored,
                burnHash: row.burnhash ? row.burnhash.trim() : row.burnhash,
            };
            return ret;
        };

    public getBurns = async (
        network: Network,
        token: Token,
        // onlyNotReceived: boolean,
        onlyNotSentried = false,
    ): Promise<readonly Burn[]> => {
        if (!this.client) {
            throw new Error(`No client setup, please call 'connect'`);
        }

        const query = await this.client.query(
            onlyNotSentried
                ? `SELECT * FROM BURNS_${this.networkTokenID(
                      network,
                      token,
                  )} WHERE received=false AND ignored=false AND sentried=false;`
                : // : `SELECT * FROM BURNS_${this.networkTokenID(network, token)};`,
                  `SELECT * FROM BURNS_${this.networkTokenID(
                      network,
                      token,
                  )} WHERE received=false AND ignored=false;`,
        );

        return query.map(this.unmarshalRow(network, token));
    };

    public getBurn = async (
        network: Network,
        token: Token,
        burnRef: number,
    ): Promise<Burn | undefined> => {
        if (!this.client) {
            throw new Error(`No client setup, please call 'connect'`);
        }

        const query = await this.client.query(
            `SELECT * FROM BURNS_${this.networkTokenID(
                network,
                token,
            )} WHERE ref=$1;`,
            [burnRef],
        );
        const burns = query.map(this.unmarshalRow(network, token));
        return burns.length === 0 ? undefined : burns[0];
    };

    public updateBurn = async (trade: Burn) => {
        if (!this.client) {
            throw new Error(`No client setup, please call 'connect'`);
        }

        await this.client.query(
            `INSERT INTO BURNS_${this.networkTokenID(
                trade.network,
                trade.token,
            )} VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (ref) DO UPDATE
                SET 
                amount = $2,
                address = $3,
                received = $4,
                txhash = $5,
                timestamp = $6,
                sentried = $7,
                ignored = $8,
                burnhash = $9,
                fromtxhash = $10
                ;`,

            [
                trade.ref.toFixed(),
                trade.amount.toFixed(),
                trade.address,
                trade.received,
                trade.txHash,
                trade.timestamp,
                trade.sentried,
                trade.ignored,
                trade.burnHash,
                "",
            ],
        );
    };

    public txIsFree = async (
        network: Network,
        token: Token,
        txHash: string,
    ): Promise<readonly Burn[]> => {
        if (!this.client) {
            throw new Error(`No client setup, please call 'connect'`);
        }

        const query = await this.client.query(
            `SELECT * FROM BURNS_${this.networkTokenID(
                network,
                token,
            )} WHERE received=true AND txhash=$1;`,
            [txHash],
        );
        return query.map(this.unmarshalRow(network, token));
    };
}
