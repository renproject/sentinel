import { config } from "dotenv";

const result = config();
// Ignore result.error

const parsed = { ...process.env, ...(result.parsed || {}) };

if (!parsed.INFURA_KEY) {
    console.error("Must set Infura key in INFURA_KEY environment variable.");
}

if (!parsed.DATABASE_URL) {
    console.error(
        "Must set database url in DATABASE_URL environment variable.",
    );
}

export const LIGHTNODE_URL =
    process.env.LIGHTNODE_URL || "https://rpc.renproject.io";

// Logger config.
export const LOG_DIR = "./log/";
export const ERROR_LOG_FILE = "error.log";
export const DEBUG_LOG_FILE = "debug.log";

export const { INFURA_KEY, DATABASE_URL, PORT, SENTRY_DSN, WEBHOOK } = parsed;
