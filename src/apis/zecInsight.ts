// tslint:disable: no-any

export interface ScriptSig {
    hex: string;
    asm: string;
}

export interface Vin {
    txid: string;
    vout: number;
    sequence: any;
    n: number;
    scriptSig: ScriptSig;
    addr: string;
    valueSat: any;
    value: number;
    doubleSpentTxID?: any;
}

export interface ScriptPubKey {
    hex: string;
    asm: string;
    addresses: string[];
    type: string;
}

export interface Vout {
    value: string;
    n: number;
    scriptPubKey: ScriptPubKey;
    spentTxId: string;
    spentIndex?: number;
    spentHeight?: number;
}

export interface Item {
    txid: string;
    version: number;
    locktime: number;
    vin: Vin[];
    vout: Vout[];
    vjoinsplit: any[];
    blockhash: string;
    blockheight: number;
    confirmations: number;
    time: number;
    blocktime: number;
    valueOut: number;
    size: number;
    valueIn: number;
    fees: number;
    fOverwintered: boolean;
    nVersionGroupId: any;
    nExpiryHeight: number;
    valueBalance: number;
    spendDescs: any[];
    outputDescs: any[];
}

export interface ZecInsightAddress {
    totalItems: number;
    from: number;
    to: number;
    items: Item[];
}
