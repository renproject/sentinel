import { ConnectionOptions } from "typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";

import { DATABASE_URL } from "../../config";
import {
    PG_HOST,
    PG_PORT,
    POSTGRES_DB,
    POSTGRES_PASSWORD,
    POSTGRES_USER,
} from "../config";
import { Chain } from "../entities/Chain";
import { Transaction } from "../entities/Transaction";

const config: ConnectionOptions = {
    type: "postgres",
    name: "default",
    url: DATABASE_URL,
    synchronize: false,
    logging: false,
    ssl: true,
    extra: {
        ssl: {
            rejectUnauthorized: false,
        },
    },
    entities: [Chain, Transaction],
    namingStrategy: new SnakeNamingStrategy(),
};

export default config;
