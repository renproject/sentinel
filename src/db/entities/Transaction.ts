import "reflect-metadata";

import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from "typeorm";

@Entity("transactions")
export class Transaction {
    @PrimaryGeneratedColumn()
    id!: number;

    // Transaction data

    @Column({ nullable: false })
    asset!: string;

    @Column({ nullable: false })
    fromTxHash!: string;

    @Column({ nullable: false, type: "bigint" })
    fromTxIndex!: string;

    @Column({ nullable: false, type: "bigint" })
    fromTxTimestamp!: string;

    @Column({ nullable: false })
    nonce!: string;

    @Column({ nullable: false, type: "bigint" })
    amount!: string;

    @Column({ nullable: false })
    toRecipient!: string;

    @Column({ nullable: false })
    fromChain!: string;

    @Column({ nullable: true, type: "varchar" })
    toChain!: string | null;

    @Column({ nullable: true, type: "varchar" })
    toPayload!: string | null;

    @Column({ nullable: true, type: "varchar" })
    toTxHash!: string | null;

    @Column({ nullable: true, type: "varchar" })
    renVmHash!: string | null;

    @Column()
    done!: boolean;

    @Column()
    sentried!: boolean;

    @Column()
    ignored!: boolean;

    // Timestamps

    @Column()
    @CreateDateColumn()
    created_at!: Date;

    @Column()
    @UpdateDateColumn()
    updated_at!: Date;

    constructor(params: {
        asset: string;
        fromTxHash: string;
        fromTxIndex: string;
        fromTxTimestamp: string;
        nonce: string;
        amount: string;
        toRecipient: string;
        fromChain: string;
        toChain: string | null;
        toPayload: string | null;
        toTxHash: string | null;
        renVmHash: string | null;
        done: boolean;
        sentried: boolean;
        ignored: boolean;
    }) {
        if (!params) {
            return;
        }
        this.asset = params.asset;
        this.fromTxHash = params.fromTxHash;
        this.fromTxIndex = params.fromTxIndex;
        this.fromTxTimestamp = params.fromTxTimestamp;
        this.nonce = params.nonce;
        this.amount = params.amount;
        this.toRecipient = params.toRecipient;
        this.fromChain = params.fromChain;
        this.toChain = params.toChain;
        this.toPayload = params.toPayload;
        this.toTxHash = params.toTxHash;
        this.renVmHash = params.renVmHash;
        this.done = params.done;
        this.sentried = params.sentried;
        this.ignored = params.ignored;
    }
}
