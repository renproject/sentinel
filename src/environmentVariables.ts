import { config } from "dotenv";

const result = config();
if (result.error) {
    console.error(result.error);
}

const parsed = { ...process.env, ...(result.parsed || {}) };

if (!parsed.INFURA_KEY) {
    console.error("Must set Infura key in INFURA_KEY environment variable.");
}

if (!parsed.DATABASE_URL) {
    console.error(
        "Must set database url in DATABASE_URL environment variable.",
    );
}

export const { INFURA_KEY, DATABASE_URL, PORT, SENTRY_DSN } = parsed;
