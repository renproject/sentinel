import { RenNetwork } from "@renproject/utils";
import chalk from "chalk";
import { Connection, createConnection, getConnectionManager } from "typeorm";
import { Logger } from "winston";
import { Chains } from "../lib/chains";
import { printChain } from "../lib/logger";

import config from "./config/ormconfig";
import { Chain } from "./entities/Chain";

export const connectDatabase = async (
    logger: Logger,
    network: RenNetwork,
    chains: Chains,
): Promise<Connection> => {
    let connection: Connection;

    try {
        connection = await createConnection(config);
        logger.info(
            `${chalk.green("Database connected")}. (database: ${chalk.yellow(
                connection.options.database,
            )})`,
        );
    } catch (err: any) {
        logger.error("err!", err);
        if (err.name === "AlreadyHasActiveConnectionError") {
            connection = getConnectionManager().get(config.name);
        } else {
            throw new Error(
                `Unable to establish database connection: ${err.message}`,
            );
        }
    }

    if (process.env.RESET_DB) {
        logger.info(`Resetting database...`);
        await connection.dropDatabase();
    }
    await connection.showMigrations();
    await connection.runMigrations();
    await connection.synchronize();

    const chainRepository = connection.getRepository(Chain);

    for (const chain of Object.keys(chains)) {
        const details = chains[chain];
        if (details.defaultSyncedState) {
            console.log(
                `Checking that ${printChain(
                    details.chain.chain,
                )} exists in database...`,
            );
            if (
                !(await chainRepository.findOneBy({
                    chain: details.chain.chain,
                }))
            ) {
                console.log(
                    `Adding ${details.chain.chain} to database with default state: ${details.defaultSyncedState}`,
                );
                await chainRepository.save(
                    new Chain({
                        chain: details.chain.chain,
                        synced_state: details.defaultSyncedState,
                    }),
                );
            }
        }
    }

    return connection;
};
