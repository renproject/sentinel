import BigNumber from "bignumber.js";
import { Map } from "immutable";

export enum Network {
    Chaosnet = "CHAOSNET",
    Testnet = "TESTNET",
    Devnet = "DEVNET",
}
export const networks = [Network.Chaosnet, Network.Testnet];

export enum Token {
    BTC = "BTC",
    ZEC = "ZEC",
    BCH = "BCH",
}

export const networkTokens = Map<Network, Token[]>()
    .set(Network.Chaosnet, [Token.BTC, Token.ZEC, Token.BCH])
    .set(Network.Testnet, [Token.BTC])
    .set(Network.Devnet, [Token.BTC]);

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
