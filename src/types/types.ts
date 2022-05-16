import BigNumber from "bignumber.js";

export interface Burn {
    // tslint:disable: readonly-keyword
    ref: BigNumber;
    network: string;
    asset: string;
    address: string;
    amount: BigNumber;
    received: boolean;
    txHash: string | null;
    timestamp: number;
    sentried: boolean;
    ignored: boolean;
    burnHash: string | undefined;
}
