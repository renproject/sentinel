import { captureMessage, withScope } from "@sentry/node";
import chalk from "chalk";

import { SENTRY_DSN } from "../config";

// tslint:disable-next-line: no-any
export const reportErrorMessage = (message: string, extra?: any): boolean => {
    console.error(chalk.red(message));

    if (!SENTRY_DSN) {
        return false;
    }

    // tslint:disable-next-line: no-any
    withScope((scope: any) => {
        if (extra) {
            if (extra.network) {
                scope.setTag("network", extra.network);
            }

            if (extra.token) {
                scope.setTag("token", extra.token);
            }

            for (const key of Object.keys(extra)) {
                scope.setExtra(key, extra[key]);
            }
        }

        captureMessage(message);
    });
    // Error was only reported correctly if SENTRY_DSN is set.
    return true;
};
