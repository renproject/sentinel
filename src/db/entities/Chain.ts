import "reflect-metadata";

import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from "typeorm";

@Entity("chain")
export class Chain {
    @PrimaryGeneratedColumn()
    id!: number;

    // Gateway data

    @Column({
        unique: true,
    })
    chain!: string;

    @Column({ type: "bigint", nullable: true })
    synced_height!: string | null;

    @Column()
    @CreateDateColumn()
    created_at!: Date;

    @Column()
    @UpdateDateColumn()
    updated_at!: Date;

    constructor(params: { chain: string; synced_height: string | null }) {
        if (!params) {
            return;
        }
        this.chain = params.chain;
        this.synced_height = params.synced_height;
    }
}
