import "reflect-metadata";

import { RenVMProvider } from "@renproject/provider";
import RenJS from "@renproject/ren";
import { RenNetwork, utils } from "@renproject/utils";
import * as Sentry from "@sentry/node";
import { install as loadSourceMaps } from "source-map-support";

import { LIGHTNODE_URL, SENTRY_DSN } from "./config";
import { connectDatabase } from "./db";
import { initializeChains } from "./lib/chains";
import { createLogger } from "./lib/logger";
import { blockchainSyncerService } from "./services/blockchainSyncer";

loadSourceMaps();

const main = async (_args: readonly string[]) => {
    // Logger
    const logger = createLogger();

    // Set up sentry
    Sentry.init({
        dsn: SENTRY_DSN,
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

    const provider = await new RenVMProvider(LIGHTNODE_URL);
    const network = (await utils.tryNTimes(
        () => provider.getNetwork(),
        5,
        10 * utils.sleep.SECONDS,
    )) as RenNetwork;
    console.log(`Network: ${network}.`);
    const chains = await initializeChains(network, logger);
    const renJS = new RenJS(network);

    // Database
    const database = await connectDatabase(logger, network, chains);

    // Set up Blockchain Syncer
    const blockchainSyncer = blockchainSyncerService(
        renJS,
        chains,
        database,
        logger,
    );

    // Start Blockchain Syncer
    blockchainSyncer.start().catch((error) => {
        console.error(error);
        process.exit(1);
    });
};

main(process.argv.slice(2)).catch((error) => console.error(error));
