import { config } from "dotenv";
import { List, Map } from "immutable";
import { Logger } from "winston";

import { Database } from "./adapters/database";
import { createLogger } from "./adapters/logger";
// import { setupApp } from "./adapters/server";
import { MINUTES, sleep, withTimeout } from "./lib/misc";
import { ContractReader } from "./network/subzero";
import { Network, networks } from "./types/types";
import { verifyBurn } from "./verify";

const Sentry = require("@sentry/node");

// LOOP_INTERVAL defines how long the bot sleeps for in between checking for
// trade opportunities.
const minute = 60 * 1000;
const LOOP_INTERVAL = 1 * minute;

const result = config();
if (result.error) {
    console.error(result.error);
}

const tick = async (
    network: Network,
    contractReader: ContractReader,
    logger: Logger,
    database: Database,
    onlyNotSentried: boolean,
) => {
    if (!contractReader.renJS) {
        return;
    }

    // for (const token of network.tokens) {
    //     const tokenTick = async () => {
    //         const previousBlock = await database.getLatestBlock(network, token);

    //         const { burns, currentBlock } = await withTimeout(
    //             contractReader.getNewLogs(network, token, previousBlock),
    //             5 * MINUTES,
    //         );
    //         // if (network === Network.Testnet && token === Token.ZEC) {
    //         //     await database.setLatestBlock(network, token, currentBlock);
    //         //     continue;
    //         // }

    //         logger.info(
    //             `[${network.name}][${token.symbol}] Got ${
    //                 burns.length
    //             } burns from block #${previousBlock.toString()} until block #${currentBlock.toString()} (${currentBlock
    //                 .minus(previousBlock)
    //                 .toString()} blocks)`,
    //         );

    //         // TODO: Batch database requests.
    //         for (let i = 0; i < burns.length; i++) {
    //             if (burns.length > 50 && i > 0 && i % 50 === 0) {
    //                 console.log(
    //                     `[${network.name}][${token.symbol}] Updated ${i}/${burns.length} in database...`,
    //                 );
    //             }
    //             const burn = burns[i];
    //             await database.updateBurn(burn);
    //         }
    //         await database.setLatestBlock(network, token, currentBlock);
    //     };
    //     await withTimeout(tokenTick(), 30 * MINUTES).catch(console.error);
    // }

    for (const token of network.tokens) {
        const items = List(
            await database.getBurns(network, token, onlyNotSentried),
        ).sortBy((i) => i.ref.toNumber());
        logger.info(
            `[${network.name}][${token.symbol}] ${items.size} burns to check...`,
        );
        for (const item of items.values()) {
            await withTimeout(
                verifyBurn(
                    contractReader,
                    logger,
                    database,
                    network,
                    token,
                    item,
                ),
                10 * MINUTES,
            ).catch(console.error);
        }
    }
};

export const main = async (_args: readonly string[]) => {
    // Logger
    const logger = createLogger();

    // UI server
    // setupApp(logger);

    // Set up sentry
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        integrations: ((integrations: Array<{ name: string }>) => {
            // integrations will be all default integrations
            return integrations.filter((integration) => {
                return (
                    integration.name !== "OnUncaughtException" &&
                    integration.name !== "OnUnhandledRejection" &&
                    integration.name !== "Http"
                );
            });
        }) as any, // tslint:disable-line: no-any
    });

    // Database
    const database = new Database();
    await database.connect();

    let contractReaders = Map<string, ContractReader>();

    let iteration = 0;

    // Run tactic every 30 seconds
    while (true) {
        for (const network of networks) {
            try {
                let contractReader = contractReaders.get(network.name);
                if (!contractReader) {
                    contractReader = await new ContractReader(logger).connect(
                        network,
                    );
                    contractReaders = contractReaders.set(
                        network.name,
                        contractReader,
                    );
                }
                await withTimeout(
                    tick(
                        network,
                        contractReader,
                        logger,
                        database,
                        iteration % 10 === 0,
                    ),
                    30 * MINUTES,
                );
            } catch (error) {
                console.error(error);
                logger.error(error.message);
            }
        }
        logger.info(`\nSleeping for ${LOOP_INTERVAL / minute} minutes...`);
        await sleep(LOOP_INTERVAL);
        iteration += 1;
    }

    // await client.end();
    // dex.stop();
};

main(process.argv.slice(2)).catch(console.error);
