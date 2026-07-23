import type * as utils from "@iobroker/adapter-core";
import type { KripsolPool } from "./kripsolCloud";

type JsonRecord = Record<string, unknown>;

interface StateDefinition {
    type: ioBroker.CommonType;
    role: string;
    value: string | number | boolean;
    unit?: string;
}

interface MetadataRule {
    pattern: RegExp;
    name: string;
    role: string;
    unit?: string;
}

const METADATA_RULES: MetadataRule[] = [
    { pattern: /(^|\.)(water|pool).*(temp|temperature)$|(^|\.)(temp|temperature).*(water|pool)$/i, name: "Water temperature", role: "value.temperature", unit: "°C" },
    { pattern: /(^|\.)(air|ambient).*(temp|temperature)$|(^|\.)(temp|temperature).*(air|ambient)$/i, name: "Air temperature", role: "value.temperature", unit: "°C" },
    { pattern: /(^|\.)(temp|temperature)$/i, name: "Temperature", role: "value.temperature", unit: "°C" },
    { pattern: /(^|\.)(ph|phvalue|ph_value)$/i, name: "pH value", role: "value", unit: "pH" },
    { pattern: /(^|\.)(orp|redox|rx)$/i, name: "Redox potential", role: "value", unit: "mV" },
    { pattern: /(^|\.)(salinity|salt|saltlevel|salt_level)$/i, name: "Salinity", role: "value", unit: "g/l" },
    { pattern: /(^|\.)(conductivity|ec)$/i, name: "Conductivity", role: "value", unit: "µS/cm" },
    { pattern: /(^|\.)(flow|flowrate|flow_rate)$/i, name: "Flow rate", role: "value", unit: "l/min" },
    { pattern: /(^|\.)(pressure)$/i, name: "Pressure", role: "value.pressure", unit: "bar" },
    { pattern: /(^|\.)(runtime|duration|time|timer|minutes|min)$/i, name: "Runtime", role: "value.interval", unit: "min" },
    { pattern: /(^|\.)(speed|rpm)$/i, name: "Speed", role: "value", unit: "rpm" },
    { pattern: /(^|\.)(percent|percentage|level|power)$/i, name: "Level", role: "value", unit: "%" },
    { pattern: /(^|\.)(enabled|active|running|present|online|connected)$/i, name: "Active", role: "indicator" },
    { pattern: /(^|\.)(alarm|error|fault)$/i, name: "Error", role: "indicator.alarm" },
    { pattern: /(^|\.)(light|lights)$/i, name: "Pool light", role: "switch" },
    { pattern: /(^|\.)(filtration|filter|pump)$/i, name: "Filtration", role: "switch" },
    { pattern: /(^|\.)(backwash)$/i, name: "Backwash", role: "switch" },
];

export class PoolStateWriter {
    public constructor(private readonly adapter: utils.AdapterInstance) {}

    public async writePool(pool: KripsolPool, poolData: JsonRecord): Promise<number> {
        const poolId = this.sanitizeIdPart(pool.id);
        const poolRoot = `pools.${poolId}`;

        await this.ensureChannel("pools", "Pools");
        await this.ensureChannel(poolRoot, pool.name);

        let stateCount = 0;

        await this.writeState(`${poolRoot}.name`, "Pool name", pool.name);
        stateCount++;

        await this.writeState(`${poolRoot}.cloudId`, "Cloud pool ID", pool.id);
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
                    await this.ensureChannel(childPath, this.humanizeKey(key));
                    count += await this.writeValue(childPath, childValue);
                    continue;
                }

                if (Array.isArray(childValue)) {
                    await this.writeState(childPath, this.humanizeKey(key), JSON.stringify(childValue), "json");
                    count++;
                    continue;
                }

                await this.writeState(childPath, this.humanizeKey(key), childValue);
                count++;
            }

            return count;
        }

        await this.writeState(path, this.humanizeKey(this.getLastPathPart(path)), value);
        return 1;
    }

    private async ensureChannel(id: string, name: string): Promise<void> {
        await this.adapter.extendObjectAsync(id, {
            type: "channel",
            common: { name },
            native: {},
        });
    }

    private async writeState(id: string, fallbackName: string, value: unknown, forcedRole?: string): Promise<void> {
        const definition = this.getStateDefinition(id, value, forcedRole);
        const metadata = this.findMetadata(id);

        await this.adapter.extendObjectAsync(id, {
            type: "state",
            common: {
                name: metadata?.name ?? fallbackName,
                type: definition.type,
                role: metadata?.role ?? definition.role,
                unit: metadata?.unit ?? definition.unit,
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setStateAsync(id, definition.value, true);
    }

    private getStateDefinition(id: string, value: unknown, forcedRole?: string): StateDefinition {
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
                role: this.findMetadata(id)?.role ?? "indicator",
                value,
            };
        }

        if (typeof value === "number") {
            return { type: "number", role: "value", value };
        }

        if (typeof value === "string") {
            return { type: "string", role: "text", value };
        }

        if (value === null || value === undefined) {
            return { type: "string", role: "json", value: "null" };
        }

        return { type: "string", role: "json", value: JSON.stringify(value) };
    }

    private findMetadata(id: string): MetadataRule | undefined {
        const normalized = id.replace(/^pools\.[^.]+\.data\./, "");
        return METADATA_RULES.find((rule) => rule.pattern.test(normalized));
    }

    private humanizeKey(key: string): string {
        const result = key
            .replace(/[_-]+/g, " ")
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .trim();

        return result ? result.charAt(0).toUpperCase() + result.slice(1) : "Unnamed";
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
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }
}
