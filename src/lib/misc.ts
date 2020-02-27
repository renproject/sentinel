export const NULL_BYTES32 =
    "0x0000000000000000000000000000000000000000000000000000000000000000";

export const sleep = async (ms: number) =>
    // tslint:disable-next-line: no-string-based-set-timeout
    new Promise(resolve => setTimeout(resolve, ms));
