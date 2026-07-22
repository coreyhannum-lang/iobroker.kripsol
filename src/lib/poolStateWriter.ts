import type * as utils from "@iobroker/adapter-core";
import type { KripsolPool } from "./kripsolCloud";

type JsonRecord = Record<string, unknown>;

interface StateDefinition {
    type: ioBroker.CommonType;
    role: string;
    value: string | number | boolean;
}

export class PoolStateWriter {
    public constructor(private readonly adapter: utils.AdapterInstance) {}

    public async writePool(
        pool: KripsolPool,
        poolData: JsonRecord,
    ): Promise<number> {
        const poolId = this.sanitizeIdPart(pool.id);
        const poolRoot = `pools.${poolId}`;

        await this.ensureChannel("pools", "Pools");
        await this.ensureChannel(poolRoot, pool.name);

        let stateCount = 0;

        await this.writeState(
            `${poolRoot}.name`,
            "Pool name",
            pool.name,
        );
        stateCount++;

        await this.writeState(
            `${poolRoot}.cloudId`,
            "Cloud pool ID",
            pool.id,
        );
        stateCount++;

        const dataRoot = `${poolRoot}.data`;
        await this.ensureChannel(dataRoot, "Cloud data");

        stateCount += await this.writeValue(dataRoot, poolData);

        return stateCount;
    }

    private async writeValue(path: string, value: unknown): Promise<number> {
        if (this.isRecord(value)) {
            let count = 0;

            for (const [key, childValue] of Object.entries(value)) {
                const childId = this.sanitizeIdPart(key);
                const childPath = `${path}.${childId}`;

                if (this.isRecord(childValue)) {
                    await this.ensureChannel(childPath, key);
                    count += await this.writeValue(childPath, childValue);
                    continue;
                }

                if (Array.isArray(childValue)) {
                    await this.writeState(
                        childPath,
                        key,
                        JSON.stringify(childValue),
                        "json",
                    );
                    count++;
                    continue;
                }

                await this.writeState(childPath, key, childValue);
                count++;
            }

            return count;
        }

        await this.writeState(path, this.getLastPathPart(path), value);
        return 1;
    }

    private async ensureChannel(id: string, name: string): Promise<void> {
        await this.adapter.extendObjectAsync(id, {
            type: "channel",
            common: {
                name,
            },
            native: {},
        });
    }

    private async writeState(
        id: string,
        name: string,
        value: unknown,
        forcedRole?: string,
    ): Promise<void> {
        const definition = this.getStateDefinition(value, forcedRole);

        await this.adapter.extendObjectAsync(id, {
            type: "state",
            common: {
                name,
                type: definition.type,
                role: definition.role,
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setStateAsync(id, definition.value, true);
    }

    private getStateDefinition(
        value: unknown,
        forcedRole?: string,
    ): StateDefinition {
        if (forcedRole === "json") {
            return {
                type: "string",
                role: "json",
                value: typeof value === "string" ? value : JSON.stringify(value),
            };
        }

        if (typeof value === "boolean") {
            return {
                type: "boolean",
                role: "value",
                value,
            };
        }

        if (typeof value === "number") {
            return {
                type: "number",
                role: "value",
                value,
            };
        }

        if (typeof value === "string") {
            return {
                type: "string",
                role: "text",
                value,
            };
        }

        if (value === null || value === undefined) {
            return {
                type: "string",
                role: "json",
                value: JSON.stringify(value ?? null),
            };
        }

        return {
            type: "string",
            role: "json",
            value: JSON.stringify(value),
        };
    }

    private sanitizeIdPart(value: string): string {
        const sanitized = value
            .trim()
            .replace(/[.\s*,;'"`<>\\?[\]{}=+~!#$%^&()|/]+/g, "_")
            .replace(/^_+|_+$/g, "");

        return sanitized || "unnamed";
    }

    private getLastPathPart(path: string): string {
        return path.split(".").at(-1) ?? path;
    }

    private isRecord(value: unknown): value is JsonRecord {
        return (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
        );
    }
}
