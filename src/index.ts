import { config } from "dotenv";
import { List, Map } from "immutable";
import { Logger } from "winston";

import { Database } from "./adapters/database";
import { createLogger } from "./adapters/logger";
import { setupApp } from "./adapters/server";
import { ContractReader } from "./chaosdex";
import { sleep } from "./lib/misc";
import { Network, networks, networkTokens } from "./types/types";
import { verifyBurn } from "./verify";

const Sentry = require("@sentry/node");

// LOOP_INTERVAL defines how long the bot sleeps for in between checking for
// trade opportunities.
const minute = 60 * 1000;
const LOOP_INTERVAL = 5 * minute;

const result = config();
if (result.error) {
    console.error(result.error);
}

const tick = async (network: Network, contractReader: ContractReader, logger: Logger, database: Database) => {

    if (!contractReader.sdk) {
        return;
    }

    const tokens = networkTokens.get(network);
    if (!tokens) {
        return;
    }
    for (const token of tokens) {
        const previousBlock = await database.getLatestBlock(network, token);

        const { burns, currentBlock } = await contractReader.getNewLogs(network, token, previousBlock);
        // if (network === Network.Testnet && token === Token.ZEC) {
        //     await database.setLatestBlock(network, token, currentBlock);
        //     continue;
        // }

        logger.info(`[${network}][${token}] Got ${burns.length} burns from block #${previousBlock.toString()} until block #${currentBlock.toString()}`);

        for (const burn of burns) {
            await database.updateBurn(burn);
        }
        await database.setLatestBlock(network, token, currentBlock);
    }

    for (const token of tokens) {
        const items = List(await database.getBurns(network, token, true)).sortBy(i => i.ref.toNumber());
        console.log("\n");
        logger.info(`[${network}][${token}] ${items.size} burns to check...`);
        for (const item of items.reverse().values()) {
            await verifyBurn(contractReader, logger, database, network, token, item);
        }
    }
};

export const main = async (_args: readonly string[]) => {

    // Set up sentry
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        integrations: ((integrations: Array<{ name: string }>) => {
            // integrations will be all default integrations
            return integrations.filter((integration) => {
                return integration.name !== "OnUncaughtException" && integration.name !== "OnUnhandledRejection" && integration.name !== "Http";
            });
        }) as any, // tslint:disable-line: no-any
    });

    // Logger
    const logger = createLogger();

    // Database
    const database = new Database();
    await database.connect();

    let contractReaders = Map<Network, ContractReader>();

    // UI server
    setupApp(database, logger);

    // Run tactic every 30 seconds
    while (true) {
        for (const network of networks) {
            try {
                let contractReader = contractReaders.get(network);
                if (!contractReader) {
                    contractReader = await new ContractReader(logger).connect(network);
                    contractReaders = contractReaders.set(network, contractReader);
                }
                await tick(network, contractReader, logger, database);
            } catch (error) {
                console.error(error);
                logger.error(error.message);
            }
        }
        logger.info("\n");
        await sleep(LOOP_INTERVAL);
    }

    // await client.end();
    // dex.stop();
};

main(process.argv.slice(2)).catch(console.error);
