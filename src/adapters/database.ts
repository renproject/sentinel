import BigNumber from "bignumber.js";
import { Set } from "immutable";
import PGP from "pg-promise";
import pg from "pg-promise/typescript/pg-subset";

import { Burn, Network, networks, networkTokens, Token } from "../types/types";

const pgp = PGP();

export class Database {
    public connectionString = process.env.DATABASE_URL;
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
            );`
        );

        for (const network of networks) {
            const tokens = networkTokens.get(network);
            if (!tokens) {
                continue;
            }
            for (const token of tokens) {
                if (drop) {
                    await this.client.query(`DROP TABLE BURNS_${this.networkTokenID(network, token)};`);
                }
                await this.client.query(`
                    CREATE TABLE IF NOT EXISTS BURNS_${this.networkTokenID(network, token)} (
                        ref DECIMAL UNIQUE NOT NULL,
                        amount DECIMAL NOT NULL,
                        address CHAR(200) NOT NULL,
                        received BOOLEAN,
                        txhash CHAR(200),
                        timestamp DECIMAL NOT NULL,
                        sentried BOOLEAN NOT NULL
                    );`,
                );
                // await this.client.query(`
                //     ALTER TABLE BURNS_${this.networkTokenID(network, token)}
                //     ADD COLUMN sentried BOOLEAN NOT NULL DEFAULT false;
                // `);
            }
        }
    };

    public getLatestBlock = async (network: Network, token: Token): Promise<BigNumber> => {
        if (!this.client) {
            throw new Error(`No client setup, please call 'connect'`);
        }

        const results = await this.client.query(`SELECT * FROM synced WHERE network=$1;`, [this.networkTokenID(network, token)]);
        if (results.length) {
            return new BigNumber(results[0].block || "0");
        }
        return new BigNumber(0);
    }

    public setLatestBlock = async (network: Network, token: Token, latestBlock: BigNumber): Promise<void> => {
        if (!this.client) {
            throw new Error(`No client setup, please call 'connect'`);
        }

        await this.client.query(
            `INSERT INTO synced VALUES ($1, $2) ON CONFLICT (network) DO UPDATE
                SET 
                block = $2
                ;`,

            [
                this.networkTokenID(network, token),
                latestBlock.toFixed(),
            ],
        );
    }

    public networkTokenID = (network: Network, token: Token): string => `${network}_${token}`;

    public getBurns = async (network: Network, token: Token, onlyNotReceived: boolean): Promise<readonly Burn[]> => {
        if (!this.client) {
            throw new Error(`No client setup, please call 'connect'`);
        }


        return (await this.client.query(onlyNotReceived ? `SELECT * FROM BURNS_${this.networkTokenID(network, token)} WHERE received=false;` : `SELECT * FROM BURNS_${this.networkTokenID(network, token)};`)).map(
            // tslint:disable-next-line: no-any
            (row: { ref: number, amount: string, address: string, received: boolean, txhash: string, timestamp: number, sentried: boolean }) => {
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
                };
                return ret;
            },
        );
    };

    public updateBurn = async (trade: Burn) => {
        if (!this.client) {
            throw new Error(`No client setup, please call 'connect'`);
        }

        await this.client.query(
            `INSERT INTO BURNS_${this.networkTokenID(trade.network, trade.token)} VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (ref) DO UPDATE
                SET 
                amount = $2,
                address = $3,
                received = $4,
                txhash = $5,
                timestamp = $6,
                sentried = $7
                ;`,

            [
                trade.ref.toFixed(),
                trade.amount.toFixed(),
                trade.address,
                trade.received,
                trade.txHash,
                trade.timestamp,
                trade.sentried,
            ],
        );
    };

    public txIsFree = async (network: Network, token: Token, txHash: string) => {
        if (!this.client) {
            throw new Error(`No client setup, please call 'connect'`);
        }

        return Set((await this.client.query(`SELECT * FROM BURNS_${this.networkTokenID(network, token)} WHERE received=true AND txhash=$1;`, [txHash])).map(
            // tslint:disable-next-line: no-any
            (row: { ref: number, amount: string, address: string, received: boolean, txhash: string }) => {
                return row.txhash;
            },
        )).size === 0;
    };
}
