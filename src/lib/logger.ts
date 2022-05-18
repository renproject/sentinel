import chalk from "chalk";
import winston from "winston";

import { DEBUG_LOG_FILE, ERROR_LOG_FILE, LOG_DIR } from "../config";

export const createLogger = () => {
    return winston.createLogger({
        level: "debug",
        defaultMeta: {},
        transports: [
            // Write debug and up logs to the console and the debug log file.
            new winston.transports.Console({
                level: "debug",
                format: winston.format.combine(
                    winston.format.cli(),
                    winston.format.simple(),
                ),
            }),
            new winston.transports.File({
                filename: DEBUG_LOG_FILE,
                dirname: LOG_DIR,
                level: "debug",
                format: winston.format.combine(
                    winston.format.uncolorize(),
                    winston.format.simple(),
                ),
            }),

            // Write error and up logs to the error log file.
            new winston.transports.File({
                filename: ERROR_LOG_FILE,
                dirname: LOG_DIR,
                level: "error",
                format: winston.format.combine(
                    winston.format.uncolorize(),
                    winston.format.simple(),
                ),
            }),
        ],
    });
};

const color =
    (colorEscapeCode: string) =>
    (...params: any[]) =>
        `${colorEscapeCode}${params.map(String).join(" ")}\x1b[0m`;

export const colors = chalk;

/**
 * Print the name of a chain in a color associated with the chain (e.g. )
 */
export const printChain = (chain: string, { pad } = { pad: true }): string => {
    const color: chalk.Chalk =
        chain === "Ethereum"
            ? chalk.hex("#627eea")
            : chain === "Solana"
            ? chalk.hex("#14f195")
            : chain === "BinanceSmartChain"
            ? chalk.hex("#f9b72d")
            : chain === "Fantom"
            ? chalk.hex("#1969ff")
            : chain === "Polygon"
            ? chalk.hex("#8247e5")
            : chain === "Avalanche"
            ? chalk.hex("#e84142")
            : chain === "Goerli"
            ? chalk.keyword("paleturquoise")
            : chain === "Bitcoin"
            ? chalk.hex("#f7931a")
            : chalk.cyan;
    if (chain === "BinanceSmartChain") {
        chain = "BSC";
    }
    if (pad) {
        if (chain.length > 8) {
            chain = chain.slice(0, 7) + "…";
        }
        if (chain.length < 8) {
            const difference = 8 - chain.length;
            const left = Math.floor(difference / 2);
            const right = Math.ceil(difference / 2);
            chain = " ".repeat(left) + chain + " ".repeat(right);
        }
    }
    return color(chain);
};
