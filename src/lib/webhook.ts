import { Chain, RenNetwork } from "@renproject/utils";
import Axios from "axios";
import BigNumber from "bignumber.js";

import { WEBHOOK } from "../config";

const icons = {
    avatar: "https://raw.githubusercontent.com/renproject/sentinel/master/public/webhook/avatar.png",
    error: "https://raw.githubusercontent.com/renproject/sentinel/master/public/webhook/error.png",
    resolved:
        "https://raw.githubusercontent.com/renproject/sentinel/master/public/webhook/resolved.png",
    asset: "https://raw.githubusercontent.com/renproject/sentinel/master/public/webhook/icons/", // renASSET.png
};

const colors = {
    error: 0xed694a,
    resolved: 0x4caf50,
};

export const callTransactionWebhook = async ({
    status,
    network,
    asset,
    amount,

    fromTxHash,
    renVMHash,
    toTxHash,

    fromChain,
    toChain,
}: {
    status: "error" | "resolved";

    network: RenNetwork;
    asset: string;
    amount: BigNumber;

    fromTxHash: string;
    renVMHash?: string;
    toTxHash?: string;

    fromChain?: Chain;
    toChain?: Chain;
}) => {
    if (!WEBHOOK) {
        console.log(`No webhook configured.`);
        return;
    }
    await Axios.post(WEBHOOK, {
        username: `Sentinel ${
            network.slice(0, 1).toUpperCase() + network.slice(1)
        }`,
        avatar_url: icons.avatar,
        embeds: [
            {
                author: {
                    name: `${amount.toFixed(4)} ${asset}`,
                    icon_url: `${icons.asset}ren${asset}.png`,
                },
                description: `Bridging ${asset}${
                    fromChain ? ` from ${fromChain.chain}` : ""
                }${toChain ? ` from ${toChain.chain}` : ""}`,
                color: colors[status],
                fields: [
                    {
                        name: `${fromChain?.chain || "From"} Hash`,
                        value: fromTxHash
                            ? fromChain
                                ? `[${fromTxHash.slice(
                                      0,
                                      8,
                                  )}...](${fromChain.transactionExplorerLink({
                                      txHash: fromTxHash,
                                  })})`
                                : fromTxHash
                            : "-",
                        inline: true,
                    },
                    {
                        name: "RenVM Hash",
                        value: renVMHash
                            ? `[${renVMHash.slice(0, 8)}...](https://explorer${
                                  network === RenNetwork.Mainnet
                                      ? ""
                                      : `-${network}`
                              }.renproject.io/tx/${renVMHash})`
                            : "-",
                        inline: true,
                    },
                    {
                        name: `${toChain?.chain || "To"} Hash`,
                        value: toTxHash
                            ? toChain
                                ? `[${toTxHash.slice(
                                      0,
                                      8,
                                  )}...](${toChain.transactionExplorerLink({
                                      txHash: toTxHash,
                                  })})`
                                : toTxHash
                            : "-",
                        inline: true,
                    },
                ],
                thumbnail: {
                    url: icons[status],
                },
            },
        ],
    });
};
