const Sentry = require("@sentry/node");
import chalk from "chalk";
import { SENTRY_DSN } from "../environmentVariables";

// tslint:disable-next-line: no-any
export const reportError = (message: string, extra?: any): boolean => {
    console.error(chalk.red(message));

    if (!SENTRY_DSN) {
        return false;
    }

    // tslint:disable-next-line: no-any
    Sentry.withScope((scope: any) => {
        if (extra.network) {
            scope.setTag("network", extra.network);
        }

        if (extra.token) {
            scope.setTag("token", extra.token);
        }

        for (const key of Object.keys(extra)) {
            scope.setExtra(key, extra[key]);
        }

        Sentry.captureMessage(message);
    });
    // Error was only reported correctly if SENTRY_DSN is set.
    return true;
};
