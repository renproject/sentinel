const Sentry = require("@sentry/node");

export const reportError = (message: string): boolean => {
    console.error(message);
    Sentry.captureMessage(message);
    // Error was only reported correctly if SENTRY_DSN is set.
    return !!process.env.SENTRY_DSN;
};
