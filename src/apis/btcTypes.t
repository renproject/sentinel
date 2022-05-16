// tslint:disable: no-any

export interface Address {
    type: string;
    script_hex: string;
    balance: number;
    balance_usd: number;
    received: number;
    received_usd: number;
    spent: number;
    spent_usd: number;
    output_count: number;
    unspent_output_count: number;
    first_seen_receiving: string;
    last_seen_receiving: string;
    first_seen_spending: string;
    last_seen_spending: string;
    transaction_count: number;
}

export interface Transaction {
    block_id: number;
    hash: string;
    time: string;
    balance_change: number;
}

export interface Utxo {
    block_id: number;
    transaction_hash: string;
    index: number;
    value: number;
}

export interface Address {
    address: Address;
    transactions: Transaction[];
    utxo: Utxo[];
}

export interface Data {
    [address: string]: Address;
}

export interface Cache {
    live: boolean;
    duration: number;
    since: string;
    until: string;
    time?: any;
}

export interface Api {
    version: string;
    last_major_update: string;
    next_major_update?: any;
    documentation: string;
    notice: string;
}

export interface Context {
    code: number;
    source: string;
    time: number;
    limit: string;
    offset: string;
    results: number;
    state: number;
    cache: Cache;
    api: Api;
    ftime: number;
    rtime: number;
}

export interface BlockChairAddress {
    data: Data;
    context: Context;
}
