// tslint:disable: no-any

export interface ScriptPubKey {
    addresses?: null | string[];
    asm: string;
    hex: string;
    reqSigs: number;
    type: string;
}

export interface RetrievedVout {
    n: number;
    scriptPubKey: ScriptPubKey;
    value: number;
    valueZat: number;
}

export interface ScriptSig {
    asm: string;
    hex: string;
}

export interface Vin {
    coinbase: string;
    retrievedVout: RetrievedVout;
    scriptSig: ScriptSig;
    sequence: any;
    txid: string;
    vout: number;
}

export interface Vout {
    n: number;
    scriptPubKey: ScriptPubKey;
    value: number;
    valueZat: number;
}

export interface Received {
    hash: string;
    mainChain: boolean;
    fee: number;
    type: string;
    shielded: boolean;
    index: number;
    blockHash: string;
    blockHeight: number;
    version: number;
    lockTime: number;
    timestamp: number;
    time: number;
    vin: Vin[];
    vout: Vout[];
    vjoinsplit: any[];
    vShieldedOutput: number;
    vShieldedSpend: number;
    valueBalance: number;
    value: number;
    outputValue: number;
    shieldedValue: number;
    overwintered: boolean;
}

export type ZChainAddress = Received[];
