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
