import { ColumnCommonOptions } from "typeorm/decorator/options/ColumnCommonOptions";

export const JSONTransformer: ColumnCommonOptions = {
    transformer: {
        to: (data) => (data ? JSON.stringify(data) : "null"),
        from: (data) => (data ? JSON.parse(data) : undefined),
    },
};
