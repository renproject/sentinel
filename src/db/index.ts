import { RenNetwork } from "@renproject/utils";
import chalk from "chalk";
import { Connection, createConnection, getConnectionManager } from "typeorm";
import { Logger } from "winston";

import config from "./config/ormconfig";
import { Chain } from "./entities/Chain";

export const createChains = async (
    connection: Connection,
    _network: RenNetwork,
) => {
    const chainRepository = connection.getRepository(Chain);

    const arbitrum = new Chain({
        chain: "Arbitrum",
        synced_state: "205834",
    });
    const avalanche = new Chain({
        chain: "Avalanche",
        synced_state: "2177304",
    });
    const bsc = new Chain({
        chain: "BinanceSmartChain",
        synced_state: "1929336",
    });
    const ethereum = new Chain({
        chain: "Ethereum",
        synced_state: "9736758",
    });
    const fantom = new Chain({ chain: "Fantom", synced_state: "7496306" });
    // const goerli = new Chain({ chain: "Goerli", synced_state: null });
    const polygon = new Chain({
        chain: "Polygon",
        synced_state: "14937138",
    });
    const solana = new Chain({
        chain: "Solana",
        synced_state: "{}",
    });
    await chainRepository.save([
        ethereum,
        arbitrum,
        avalanche,
        bsc,
        fantom,
        // goerli,
        polygon,
        solana,
    ]);
};

export const connectDatabase = async (
    logger: Logger,
    network: RenNetwork,
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

    const RESET = false;
    if (RESET) {
        logger.info(`Resetting database...`);
        await connection.dropDatabase();
    }
    await connection.showMigrations();
    await connection.runMigrations();
    await connection.synchronize();

    if (RESET) {
        logger.info(`Populating database...`);
        await createChains(connection, network);
    }

    return connection;
};
