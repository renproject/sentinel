import { RenNetwork } from "@renproject/utils";
import { Connection, createConnection, getConnectionManager } from "typeorm";
import { Logger } from "winston";

import { colors } from "../lib/logger";
import config from "./config/ormconfig";
import { Chain } from "./entities/Chain";

export const createChains = async (
    connection: Connection,
    _network: RenNetwork,
) => {
    const chainRepository = connection.getRepository(Chain);

    const arbitrum = new Chain({
        chain: "Arbitrum",
        synced_height: "205834",
    });
    const avalanche = new Chain({
        chain: "Avalanche",
        synced_height: "2177304",
    });
    const bsc = new Chain({
        chain: "BinanceSmartChain",
        synced_height: "1929336",
    });
    const ethereum = new Chain({
        chain: "Ethereum",
        synced_height: "9736758",
    });
    const fantom = new Chain({ chain: "Fantom", synced_height: "7496306" });
    // const goerli = new Chain({ chain: "Goerli", synced_height: null });
    const polygon = new Chain({
        chain: "Polygon",
        synced_height: "14937138",
    });

    await chainRepository.save([
        ethereum,
        arbitrum,
        avalanche,
        bsc,
        fantom,
        // goerli,
        polygon,
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
            `${colors.green("Database connected")}. (database: ${colors.yellow(
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
