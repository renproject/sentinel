import winston from "winston";

const format = winston.format.printf(({ message }) => {
    return `${message}`;
});
export const LOG_FILE_NAME = "./combined.log";

export const createLogger = () => {
    return winston.createLogger({
        defaultMeta: { service: "user-service" },
        level: "info",
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    format,
                ),
            }),
            new winston.transports.File({ filename: LOG_FILE_NAME, format }),
        ],
    });
};
