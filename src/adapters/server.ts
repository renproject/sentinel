import cors from "cors";
import express from "express";
// import { List } from "immutable";
import { Logger } from "winston";

// import { Network, networks, Token } from "../types/types";
// import { Database } from "./database";

const app = express();
app.use(cors());

const port = process.env.PORT || 3000;

export const setupApp = (logger: Logger) => {
    // app.get("/", async (_req, res) => {
    //     console.log(`Handling '/'`);

    //     // tslint:disable-next-line: no-any
    //     const json: any = {};

    //     for (const network of networks) {
    //         json[network.name.toLowerCase()] =
    //             json[network.name.toLowerCase()] || {};
    //         const tokens = network.tokens;
    //         if (!tokens) {
    //             continue;
    //         }
    //         for (const token of tokens) {
    //             const burns = List(await database.getBurns(network, token))
    //                 .sortBy((burn) => burn.ref)
    //                 .toArray();
    //             json[network.name.toLowerCase()][
    //                 token.symbol.toLowerCase()
    //             ] = burns;
    //         }
    //     }

    //     res.json(json);
    // });

    // app.get("/:network/:token/:burnRef", async (req, res) => {
    //     const network = req.params.network.toUpperCase() as Network;
    //     const token = req.params.token.toUpperCase() as Token;
    //     const burnRefString = req.params.burnRef;

    //     console.log(`Handling '/${network.name}/${token.symbol}/${burnRefString}'`);

    //     if (!networks.includes(network)) {
    //         throw new Error(`Invalid network ${network.name}`);
    //     }
    //     const tokens = networkTokens.get(network);
    //     if (!tokens || !tokens.includes(token)) {
    //         throw new Error(`Invalid token ${token.symbol}`);
    //     }
    //     let burnRef;
    //     try {
    //         burnRef = parseInt(burnRefString, 10);
    //     } catch (error) {
    //         throw new Error(`Unable to decode burn reference number`);
    //     }

    //     const burn = await database.getBurn(network, token, burnRef);
    //     res.json(burn);
    // });

    app.listen(port, () => logger.info(`Listening on port ${port}!`));
};
