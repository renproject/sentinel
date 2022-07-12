import { Chain } from "@renproject/chains";
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

const chainColors: { [chain in Chain]: string } = {
    [Chain.Arbitrum]: "#28A0F0",
    [Chain.Avalanche]: "#e84142",
    [Chain.BinanceSmartChain]: "#f9b72d",
    [Chain.Bitcoin]: "#f7931a",
    [Chain.BitcoinCash]: "#6CC64B",
    [Chain.Catalog]: "#2CC995",
    [Chain.DigiByte]: "#0063CF",
    [Chain.Dogecoin]: "#C2A633",
    [Chain.Ethereum]: "#627eea",
    [Chain.Fantom]: "#1969ff",
    [Chain.Filecoin]: "#0090FF",
    [Chain.Goerli]: "#afeeee",
    [Chain.Kava]: "#FF433E",
    [Chain.Moonbeam]: "#53CBC8",
    [Chain.Optimism]: "#FF0420",
    [Chain.Polygon]: "#8247e5",
    [Chain.Solana]: "#14f195",
    [Chain.Terra]: "#F9D85E",
    [Chain.Zcash]: "#F3B63B",
};

/**
 * Print the name of a chain in a color associated with the chain (e.g. )
 */
export const printChain = (chain: string, { pad } = { pad: true }): string => {
    const color = chalk.hex(chainColors[chain] || "#ffffff");

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
