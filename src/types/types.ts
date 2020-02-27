import BigNumber from "bignumber.js";
import { Map } from "immutable";

export enum Network {
    Chaosnet = "CHAOSNET",
}
export const networks = [Network.Chaosnet];

export enum Token {
    BTC = "BTC",
    ZEC = "ZEC",
    BCH = "BCH",
}
export const tokens = [Token.BTC, Token.ZEC, Token.BCH];

export const TokenDecimals = Map<Token, number>()
    .set(Token.BTC, 8)
    .set(Token.ZEC, 8)
    .set(Token.BCH, 8);

export interface Burn {
    // tslint:disable: readonly-keyword
    ref: BigNumber;
    network: Network;
    token: Token;
    address: string;
    amount: BigNumber;
    received: boolean;
    txHash: string | null;
    timestamp: number;
    sentried: boolean;
}
