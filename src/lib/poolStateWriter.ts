import type * as utils from "@iobroker/adapter-core";
import type { KripsolPool } from "./kripsolCloud";
import {
    getFieldDefinition,
    type FieldDefinition,
} from "./fieldDefinitions";

type JsonRecord = Record<string, unknown>;

interface StateDefinition {
    type: ioBroker.CommonType;
    role: string;
    value: string | number | boolean;
    write: boolean;
    unit?: string;
    states?: Record<string, string>;
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
        await this.ensureDevice(poolRoot, pool.name);
        await this.ensureChannel(`${poolRoot}.Allgemein`, "Allgemein");
        await this.ensureChannel(`${poolRoot}.Filtration`, "Filtration");
        await this.ensureChannel(`${poolRoot}.Wasserwerte`, "Wasserwerte");
        await this.ensureChannel(`${poolRoot}.Heizung`, "Heizung");
        await this.ensureChannel(`${poolRoot}.Beleuchtung`, "Beleuchtung");
        await this.ensureChannel(`${poolRoot}.Relais`, "Relais");
        await this.ensureChannel(`${poolRoot}.Zeitprogramme`, "Zeitprogramme");
        await this.ensureChannel(`${poolRoot}.Alarme`, "Alarme");
        await this.ensureChannel(`${poolRoot}.Wartung`, "Wartung");
        await this.ensureChannel(`${poolRoot}.Info`, "Info");
        await this.ensureChannel(`${poolRoot}.Unbenutzt`, "Unbenutzt");

        let changedStateCount = 0;

        changedStateCount += await this.writeState(
            `${poolRoot}.Allgemein.name`,
            "Poolname",
            pool.name,
            pool.id,
            ["name"],
            {
                ioPath: "Allgemein.name",
                name: "Poolname",
                type: "string",
                role: "text",
                write: false,
            },
        );

        changedStateCount += await this.writeState(
            `${poolRoot}.Allgemein.cloudId`,
            "Cloud Pool ID",
            pool.id,
            pool.id,
            ["cloudId"],
            {
                ioPath: "Allgemein.cloudId",
                name: "Cloud Pool ID",
                type: "string",
                role: "text",
                write: false,
            },
        );

        changedStateCount += await this.writeRecord(
            poolRoot,
            pool.id,
            poolData,
            [],
        );

        return changedStateCount;
    }

    public async ensurePoolInfoObjects(pool: KripsolPool): Promise<void> {
        const poolRoot = `pools.${this.sanitizeIdPart(pool.id)}`;
        const infoRoot = `${poolRoot}.Info`;

        await this.ensureChannel("pools", "Pools");
        await this.ensureDevice(poolRoot, pool.name);
        await this.ensureChannel(infoRoot, "Info");

        await this.ensureInfoState(
            `${infoRoot}.pollingActive`,
            "Polling aktiv",
            "boolean",
            "indicator",
            false,
        );
        await this.ensureInfoState(
            `${infoRoot}.lastPoll`,
            "Letztes Polling",
            "number",
            "value.time",
            0,
        );
        await this.ensureInfoState(
            `${infoRoot}.lastSuccessfulPoll`,
            "Letztes erfolgreiches Polling",
            "number",
            "value.time",
            0,
        );
        await this.ensureInfoState(
            `${infoRoot}.lastError`,
            "Letzter Polling-Fehler",
            "string",
            "text",
            "",
        );
        await this.ensureInfoState(
            `${infoRoot}.pollDuration`,
            "Pollingdauer",
            "number",
            "value.interval",
            0,
            "ms",
        );
    }

    private async writeRecord(
        poolRoot: string,
        poolId: string,
        record: JsonRecord,
        cloudPath: string[],
    ): Promise<number> {
        let changedStateCount = 0;

        for (const [key, value] of Object.entries(record)) {
            const nextCloudPath = [...cloudPath, key];

            if (this.isRecord(value)) {
                changedStateCount += await this.writeRecord(
                    poolRoot,
                    poolId,
                    value,
                    nextCloudPath,
                );
                continue;
            }

            const definition = getFieldDefinition(nextCloudPath);
            const target = definition
                ? definition.ioPath
                : `Unbenutzt.${nextCloudPath
                      .map((part) => this.sanitizeIdPart(part))
                      .join(".")}`;
            const stateId = `${poolRoot}.${target}`;
            const fallbackName = definition?.name ?? this.humanizeKey(key);

            changedStateCount += await this.writeState(
                stateId,
                fallbackName,
                Array.isArray(value) ? JSON.stringify(value) : value,
                poolId,
                nextCloudPath,
                definition,
                Array.isArray(value) ? "json" : undefined,
            );
        }

        return changedStateCount;
    }

    private async writeState(
        id: string,
        fallbackName: string,
        value: unknown,
        poolId: string,
        cloudPath: string[],
        fieldDefinition?: FieldDefinition,
        forcedRole?: string,
    ): Promise<number> {
        await this.ensureParentChannels(id);

        const definition = this.getStateDefinition(
            value,
            fieldDefinition,
            forcedRole,
        );

        await this.adapter.extendObjectAsync(id, {
            type: "state",
            common: {
                name: fieldDefinition?.name ?? fallbackName,
                type: definition.type,
                role: definition.role,
                unit: definition.unit,
                states: definition.states,
                read: true,
                write: definition.write,
            },
            native: {
                poolId,
                cloudPath,
                originalName: cloudPath[cloudPath.length - 1] ?? "",
            },
        });

        const currentState = await this.adapter.getStateAsync(id);

        if (currentState?.val === definition.value) {
            return 0;
        }

        await this.adapter.setStateAsync(id, definition.value, true);
        return 1;
    }

    private getStateDefinition(
        value: unknown,
        fieldDefinition?: FieldDefinition,
        forcedRole?: string,
    ): StateDefinition {
        if (forcedRole === "json") {
            return {
                type: "string",
                role: "json",
                value:
                    typeof value === "string"
                        ? value
                        : JSON.stringify(value),
                write: false,
            };
        }

        if (fieldDefinition) {
            let convertedValue: string | number | boolean;

            if (fieldDefinition.booleanNumeric) {
                convertedValue =
                    value === true || value === 1 || value === "1";
            } else if (fieldDefinition.type === "number") {
                convertedValue = Number(value);
            } else if (fieldDefinition.type === "boolean") {
                convertedValue = Boolean(value);
            } else {
                convertedValue =
                    typeof value === "string"
                        ? value
                        : JSON.stringify(value);
            }

            return {
                type: fieldDefinition.type,
                role: fieldDefinition.role,
                value: convertedValue,
                write: fieldDefinition.write,
                unit: fieldDefinition.unit,
                states: fieldDefinition.states,
            };
        }

        if (typeof value === "boolean") {
            return {
                type: "boolean",
                role: "indicator",
                value,
                write: false,
            };
        }

        if (typeof value === "number") {
            return {
                type: "number",
                role: "value",
                value,
                write: false,
            };
        }

        if (typeof value === "string") {
            return {
                type: "string",
                role: "text",
                value,
                write: false,
            };
        }

        return {
            type: "string",
            role: "json",
            value: JSON.stringify(value ?? null),
            write: false,
        };
    }

    private async ensureInfoState(
        id: string,
        name: string,
        type: ioBroker.CommonType,
        role: string,
        def: string | number | boolean,
        unit?: string,
    ): Promise<void> {
        await this.adapter.extendObjectAsync(id, {
            type: "state",
            common: {
                name,
                type,
                role,
                read: true,
                write: false,
                def,
                unit,
            },
            native: {},
        });
    }

    private async ensureParentChannels(id: string): Promise<void> {
        const parts = id.split(".");

        for (let index = 1; index < parts.length - 1; index++) {
            const channelId = parts.slice(0, index + 1).join(".");
            await this.ensureChannel(
                channelId,
                this.humanizeKey(parts[index]),
            );
        }
    }

    private async ensureDevice(id: string, name: string): Promise<void> {
        await this.adapter.extendObjectAsync(id, {
            type: "device",
            common: { name },
            native: {},
        });
    }

    private async ensureChannel(id: string, name: string): Promise<void> {
        await this.adapter.extendObjectAsync(id, {
            type: "channel",
            common: { name },
            native: {},
        });
    }

    private humanizeKey(key: string): string {
        const result = key
            .replace(/[_-]+/g, " ")
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .trim();

        return result
            ? result.charAt(0).toUpperCase() + result.slice(1)
            : "Unbenannt";
    }

    private sanitizeIdPart(value: string): string {
        const sanitized = value
            .trim()
            .replace(/[.\s*,;'"`<>\\?[\]{}=+~!#$%^&()|/]+/g, "_")
            .replace(/^_+|_+$/g, "");

        return sanitized || "unbenannt";
    }

    private isRecord(value: unknown): value is JsonRecord {
        return (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
        );
    }
}
