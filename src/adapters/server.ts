import cors from "cors";
import express from "express";
import { List } from "immutable";
import { Logger } from "winston";

import { networks, networkTokens } from "../types/types";
import { Database } from "./database";

const app = express();
app.use(cors());

const port = process.env.PORT || 3000;

export const setupApp = (
    database: Database,
    logger: Logger,
) => {
    app.get("/", async (_req, res) => {

        // tslint:disable-next-line: no-any
        const json: any = {};

        for (const network of networks) {
            json[network.toLowerCase()] = json[network.toLowerCase()] || {};
            const tokens = networkTokens.get(network);
            if (!tokens) {
                continue;
            }
            for (const token of tokens) {
                const burns = List(await database.getBurns(network, token, true)).sortBy(burn => burn.ref).toArray();
                json[network.toLowerCase()][token.toLowerCase()] = burns;
            }
        }

        res.json(json);
    });

    app.listen(port, () =>
        logger.info(`Trading bot listening on port ${port}!`),
    );
};
