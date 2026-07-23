import type * as utils from "@iobroker/adapter-core";
import type { KripsolPool } from "./kripsolCloud";

type JsonRecord = Record<string, unknown>;

interface StateDefinition {
    type: ioBroker.CommonType;
    role: string;
    value: string | number | boolean;
    unit?: string;
    write: boolean;
}

interface MetadataRule {
    pattern: RegExp;
    name: string;
    role: string;
    unit?: string;
    write?: boolean;
    category: string;
}

const METADATA_RULES: MetadataRule[] = [
    { pattern: /(water|pool).*(temp|temperature)|(temp|temperature).*(water|pool)/i, name: "Water temperature", role: "value.temperature", unit: "°C", category: "sensors" },
    { pattern: /(air|ambient).*(temp|temperature)|(temp|temperature).*(air|ambient)/i, name: "Air temperature", role: "value.temperature", unit: "°C", category: "sensors" },
    { pattern: /(^|\.)(temp|temperature)(\.|$)/i, name: "Temperature", role: "value.temperature", unit: "°C", category: "sensors" },
    { pattern: /(^|\.)(ph|phvalue|ph_value)(\.|$)/i, name: "pH value", role: "value", unit: "pH", category: "waterQuality" },
    { pattern: /(^|\.)(orp|redox|rx)(\.|$)/i, name: "Redox potential", role: "value", unit: "mV", category: "waterQuality" },
    { pattern: /(salinity|salt|saltlevel|salt_level)/i, name: "Salinity", role: "value", unit: "g/l", category: "waterQuality" },
    { pattern: /(conductivity|(^|\.)ec(\.|$))/i, name: "Conductivity", role: "value", unit: "µS/cm", category: "waterQuality" },
    { pattern: /(flow|flowrate|flow_rate)/i, name: "Flow rate", role: "value", unit: "l/min", category: "hydraulics" },
    { pattern: /pressure/i, name: "Pressure", role: "value.pressure", unit: "bar", category: "hydraulics" },
    { pattern: /(runtime|duration|timer|minutes)/i, name: "Runtime", role: "value.interval", unit: "min", category: "timers" },
    { pattern: /(^|\.)(speed|rpm)(\.|$)/i, name: "Speed", role: "level", unit: "rpm", write: true, category: "controls" },
    { pattern: /(percentage|percent|output|setpoint|target)/i, name: "Set value", role: "level", unit: "%", write: true, category: "controls" },
    { pattern: /(light|lights|lighting)/i, name: "Pool light", role: "switch", write: true, category: "controls" },
    { pattern: /(filtration|filter|pump)/i, name: "Filtration", role: "switch", write: true, category: "controls" },
    { pattern: /backwash/i, name: "Backwash", role: "switch", write: true, category: "controls" },
    { pattern: /(heating|heater|heatpump|heat_pump)/i, name: "Heating", role: "switch", write: true, category: "controls" },
    { pattern: /(enabled|enable|active|running|manual|automatic|auto|mode)/i, name: "Operating state", role: "switch", write: true, category: "controls" },
    { pattern: /(alarm|error|fault|warning)/i, name: "Error", role: "indicator.alarm", category: "diagnostics" },
    { pattern: /(online|connected|connection|status)/i, name: "Status", role: "indicator", category: "diagnostics" },
];

const CATEGORY_NAMES: Record<string, string> = {
    controls: "Controls",
    sensors: "Sensors",
    waterQuality: "Water quality",
    hydraulics: "Hydraulics",
    timers: "Timers",
    diagnostics: "Diagnostics",
    information: "Information",
    other: "Other",
};

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

        let changedStateCount = 0;

        const informationRoot = `${poolRoot}.information`;
        await this.ensureChannel(informationRoot, "Information");

        changedStateCount += await this.writeState(
            `${informationRoot}.name`,
            "Pool name",
            pool.name,
            pool.id,
            ["name"],
            false,
        );

        changedStateCount += await this.writeState(
            `${informationRoot}.cloudId`,
            "Cloud pool ID",
            pool.id,
            pool.id,
            ["cloudId"],
            false,
        );

        changedStateCount += await this.writeRecord(
            poolRoot,
            pool.id,
            poolData,
            [],
        );

        return changedStateCount;
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

            const metadata = this.findMetadata(nextCloudPath);
            const category = metadata?.category ?? "other";
            const categoryRoot = `${poolRoot}.${category}`;

            await this.ensureChannel(
                categoryRoot,
                CATEGORY_NAMES[category] ?? this.humanizeKey(category),
            );

            const relativeId = nextCloudPath
                .map((part) => this.sanitizeIdPart(part))
                .join("_");

            const stateId = `${categoryRoot}.${relativeId}`;

            if (Array.isArray(value)) {
                changedStateCount += await this.writeState(
                    stateId,
                    metadata?.name ?? this.humanizeKey(key),
                    JSON.stringify(value),
                    poolId,
                    nextCloudPath,
                    false,
                    "json",
                );
                continue;
            }

            changedStateCount += await this.writeState(
                stateId,
                metadata?.name ?? this.humanizeKey(key),
                value,
                poolId,
                nextCloudPath,
                metadata?.write === true,
            );
        }

        return changedStateCount;
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

    private async writeState(
        id: string,
        fallbackName: string,
        value: unknown,
        poolId: string,
        cloudPath: string[],
        requestedWrite: boolean,
        forcedRole?: string,
    ): Promise<number> {
        const metadata = this.findMetadata(cloudPath);
        const definition = this.getStateDefinition(
            value,
            requestedWrite,
            forcedRole,
        );

        await this.adapter.extendObjectAsync(id, {
            type: "state",
            common: {
                name: metadata?.name ?? fallbackName,
                type: definition.type,
                role: metadata?.role ?? definition.role,
                unit: metadata?.unit ?? definition.unit,
                read: true,
                write: definition.write,
            },
            native: {
                poolId,
                cloudPath,
            },
        });

        const currentState = await this.adapter.getStateAsync(id);

        if (
            currentState &&
            currentState.val === definition.value
        ) {
            return 0;
        }

        await this.adapter.setStateAsync(id, definition.value, true);
        return 1;
    }

    private getStateDefinition(
        value: unknown,
        requestedWrite: boolean,
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

        if (typeof value === "boolean") {
            return {
                type: "boolean",
                role: requestedWrite ? "switch" : "indicator",
                value,
                write: requestedWrite,
            };
        }

        if (typeof value === "number") {
            return {
                type: "number",
                role: requestedWrite ? "level" : "value",
                value,
                write: requestedWrite,
            };
        }

        if (typeof value === "string") {
            return {
                type: "string",
                role: "text",
                value,
                write: requestedWrite,
            };
        }

        if (value === null || value === undefined) {
            return {
                type: "string",
                role: "json",
                value: "null",
                write: false,
            };
        }

        return {
            type: "string",
            role: "json",
            value: JSON.stringify(value),
            write: false,
        };
    }

    private findMetadata(
        cloudPath: string[],
    ): MetadataRule | undefined {
        const normalized = cloudPath.join(".");
        return METADATA_RULES.find((rule) =>
            rule.pattern.test(normalized),
        );
    }

    private humanizeKey(key: string): string {
        const result = key
            .replace(/[_-]+/g, " ")
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .trim();

        return result
            ? result.charAt(0).toUpperCase() + result.slice(1)
            : "Unnamed";
    }

    private sanitizeIdPart(value: string): string {
        const sanitized = value
            .trim()
            .replace(/[.\s*,;'"`<>\\?[\]{}=+~!#$%^&()|/]+/g, "_")
            .replace(/^_+|_+$/g, "");

        return sanitized || "unnamed";
    }

    private isRecord(value: unknown): value is JsonRecord {
        return (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
        );
    }
}
