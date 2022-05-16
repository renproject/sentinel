export const NULL_BYTES32 =
    "0x0000000000000000000000000000000000000000000000000000000000000000";

export const SECONDS = 1000;
export const MINUTES = 60 * SECONDS;

export const sleep = async (ms: number) =>
    // tslint:disable-next-line: no-string-based-set-timeout
    new Promise((resolve) => setTimeout(resolve, ms));

// Run a promise with a timeout so it doesn't hang forever.
export const withTimeout = <T>(x: Promise<T>, timeout: number): Promise<T> =>
    Promise.race([
        x,
        new Promise<T>((_, reject) =>
            setTimeout(
                () =>
                    reject(
                        new Error(
                            "Timed-out while waiting for promise to complete.",
                        ),
                    ),
                timeout,
            ),
        ),
    ]);
