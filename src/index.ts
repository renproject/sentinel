import { config } from "dotenv";
import { List } from "immutable";
import { Logger } from "winston";

import { Database } from "./adapters/database";
import { createLogger } from "./adapters/logger";
import { setupApp } from "./adapters/server";
import { btcVerifyBurn } from "./apis/btc";
import { ContractReader } from "./chaosdex";
import { sleep } from "./lib/misc";
import { Network, networks, Token, tokens } from "./types/types";

const Sentry = require("@sentry/node");

// LOOP_INTERVAL defines how long the bot sleeps for in between checking for
// trade opportunities.
const minute = 60 * 1000;
const LOOP_INTERVAL = 5 * minute;

const result = config();
if (result.error) {
    console.error(result.error);
}

const tick = async (contractReader: ContractReader, logger: Logger, database: Database) => {
    if (!contractReader.sdk) {
        return;
    }

    for (const network of networks) {
        for (const token of tokens) {
            // console.log(`[${network}][${token}]`, (await database.getTXs(network, token)).toJS());

            const previousBlock = await database.getLatestBlock(Network.Chaosnet, token);

            const { burns, currentBlock } = await contractReader.getNewLogs(network, token, previousBlock);

            logger.info(`[${network}][${token}] Got ${burns.length} burns from block #${previousBlock.toString()} until block #${currentBlock.toString()}`);

            for (const burn of burns) {
                await database.updateBurn(burn);
            }
            await database.setLatestBlock(network, token, currentBlock);
        }
    }

    for (const network of networks) {
        for (const token of tokens) {
            const items = List(await database.getBurns(network, token, true)).sortBy(i => i.ref.toNumber());
            logger.info(`[${network}][${token}] ${items.size} burns to check...`);
            for (const item of items.values()) {
                if (token === Token.BTC || token === Token.BCH) {
                    await btcVerifyBurn(contractReader, logger, database, network, token, item);
                } else {
                    // Can't verify zcash
                }
            }
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

    // ChaosDEX handler
    const contractReader = await new ContractReader(logger).connect();

    // UI server
    setupApp(logger);

    // Run tactic every 30 seconds
    while (true) {
        try {
            await tick(contractReader, logger, database);
        } catch (error) {
            console.error(error);
            logger.error(error.message);
            Sentry.captureException(error);
        }
        logger.info("\n");
        await sleep(LOOP_INTERVAL);
    }

    // await client.end();
    // dex.stop();
};

main(process.argv.slice(2)).catch(console.error);
