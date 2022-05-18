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

    @Column("varchar")
    synced_state!: string;

    @Column()
    @CreateDateColumn()
    created_at!: Date;

    @Column()
    @UpdateDateColumn()
    updated_at!: Date;

    constructor(params: { chain: string; synced_state: string }) {
        if (!params) {
            return;
        }
        this.chain = params.chain;
        this.synced_state = params.synced_state;
    }
}
