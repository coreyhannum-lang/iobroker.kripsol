const FIRESTORE_PROJECT = "hayward-europe";
const FIRESTORE_BASE =
    `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}` +
    "/databases/(default)/documents";

type FirestoreValue = {
    nullValue?: null;
    booleanValue?: boolean;
    integerValue?: string;
    doubleValue?: number;
    timestampValue?: string;
    stringValue?: string;
    bytesValue?: string;
    referenceValue?: string;
    geoPointValue?: {
        latitude?: number;
        longitude?: number;
    };
    arrayValue?: {
        values?: FirestoreValue[];
    };
    mapValue?: {
        fields?: Record<string, FirestoreValue>;
    };
};

interface FirestoreDocument {
    name?: string;
    fields?: Record<string, FirestoreValue>;
    createTime?: string;
    updateTime?: string;
}

interface FirestoreErrorResponse {
    error?: {
        code?: number;
        message?: string;
        status?: string;
    };
}

export interface KripsolPool {
    id: string;
    name: string;
}

export class KripsolCloudError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "KripsolCloudError";
    }
}

export interface KripsolTokenProvider {
    getValidTokens(): Promise<{
        idToken: string;
        userId: string;
    }>;
}

export class KripsolCloud {
    public constructor(private readonly auth: KripsolTokenProvider) {}

    public async getPools(): Promise<KripsolPool[]> {
        const tokens = await this.auth.getValidTokens();
        const user = await this.getDocument(
            `users/${encodeURIComponent(tokens.userId)}`,
        );
        const poolIds = this.readStringArray(user, "pools");
        const pools: KripsolPool[] = [];

        for (const poolId of poolIds) {
            const poolDocument = await this.getDocument(
                `pools/${encodeURIComponent(poolId)}`,
            );

            pools.push({
                id: poolId,
                name: this.getPoolName(poolDocument),
            });
        }

        return pools;
    }

    public async fetchPoolData(
        poolId: string,
    ): Promise<Record<string, unknown>> {
        return this.getDocument(`pools/${encodeURIComponent(poolId)}`);
    }

    public async updatePoolField(
        poolId: string,
        fieldPath: string[],
        value: ioBroker.StateValue,
    ): Promise<void> {
        if (fieldPath.length === 0) {
            throw new KripsolCloudError("Cloud field path is empty.");
        }

        const tokens = await this.auth.getValidTokens();
        const firestorePath = fieldPath
            .map((part) => this.escapeFieldPathPart(part))
            .join(".");

        const query = new URLSearchParams();
        query.append("updateMask.fieldPaths", firestorePath);

        const nestedFields = this.buildNestedFields(
            fieldPath,
            this.encodeValue(value),
        );

        const response = await fetch(
            `${FIRESTORE_BASE}/pools/${encodeURIComponent(poolId)}?${query.toString()}`,
            {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${tokens.idToken}`,
                    Accept: "application/json",
                    "Content-Type": "application/json; charset=UTF-8",
                },
                body: JSON.stringify({
                    fields: nestedFields,
                }),
            },
        );

        if (!response.ok) {
            const text = await response.text();
            let message = text;

            try {
                const payload = JSON.parse(text) as FirestoreErrorResponse;
                message =
                    payload.error?.message ??
                    payload.error?.status ??
                    text;
            } catch {
                // Keep raw response text.
            }

            throw new KripsolCloudError(
                `Cloud write failed for ${firestorePath} ` +
                    `(HTTP ${response.status}): ${message || "Unknown error"}`,
            );
        }
    }

    private async getDocument(
        path: string,
    ): Promise<Record<string, unknown>> {
        const tokens = await this.auth.getValidTokens();

        const response = await fetch(`${FIRESTORE_BASE}/${path}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${tokens.idToken}`,
                Accept: "application/json",
            },
        });

        const text = await response.text();
        let payload: FirestoreDocument | FirestoreErrorResponse;

        try {
            payload = text ? JSON.parse(text) : {};
        } catch {
            throw new KripsolCloudError(
                `Firestore returned invalid JSON for ${path} (HTTP ${response.status}).`,
            );
        }

        if (!response.ok) {
            const error = (payload as FirestoreErrorResponse).error;

            throw new KripsolCloudError(
                `Firestore request failed for ${path} ` +
                    `(HTTP ${response.status}, ${error?.status ?? "UNKNOWN"}): ` +
                    `${error?.message ?? "Unknown error"}`,
            );
        }

        const document = payload as FirestoreDocument;
        return this.decodeFields(document.fields ?? {});
    }

    private buildNestedFields(
        path: string[],
        leafValue: FirestoreValue,
    ): Record<string, FirestoreValue> {
        const [head, ...tail] = path;

        if (!head) {
            return {};
        }

        if (tail.length === 0) {
            return {
                [head]: leafValue,
            };
        }

        return {
            [head]: {
                mapValue: {
                    fields: this.buildNestedFields(tail, leafValue),
                },
            },
        };
    }

    private encodeValue(value: ioBroker.StateValue): FirestoreValue {
        if (value === null) {
            return { nullValue: null };
        }

        if (typeof value === "boolean") {
            return { booleanValue: value };
        }

        if (typeof value === "number") {
            if (Number.isInteger(value)) {
                return { integerValue: String(value) };
            }

            return { doubleValue: value };
        }

        if (typeof value === "string") {
            return { stringValue: value };
        }

        throw new KripsolCloudError(
            `Unsupported cloud value type: ${typeof value}`,
        );
    }

    private escapeFieldPathPart(part: string): string {
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) {
            return part;
        }

        return `\`${part.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
    }

    private decodeFields(
        fields: Record<string, FirestoreValue>,
    ): Record<string, unknown> {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(fields)) {
            result[key] = this.decodeValue(value);
        }

        return result;
    }

    private decodeValue(value: FirestoreValue): unknown {
        if ("nullValue" in value) {
            return null;
        }

        if ("booleanValue" in value) {
            return value.booleanValue;
        }

        if ("integerValue" in value) {
            return Number(value.integerValue);
        }

        if ("doubleValue" in value) {
            return value.doubleValue;
        }

        if ("timestampValue" in value) {
            return value.timestampValue;
        }

        if ("stringValue" in value) {
            return value.stringValue;
        }

        if ("bytesValue" in value) {
            return value.bytesValue;
        }

        if ("referenceValue" in value) {
            return value.referenceValue;
        }

        if ("geoPointValue" in value) {
            return {
                latitude: value.geoPointValue?.latitude ?? 0,
                longitude: value.geoPointValue?.longitude ?? 0,
            };
        }

        if ("arrayValue" in value) {
            return (value.arrayValue?.values ?? []).map((item) =>
                this.decodeValue(item),
            );
        }

        if ("mapValue" in value) {
            return this.decodeFields(value.mapValue?.fields ?? {});
        }

        return null;
    }

    private readStringArray(
        source: Record<string, unknown>,
        key: string,
    ): string[] {
        const value = source[key];

        if (!Array.isArray(value)) {
            return [];
        }

        return value.filter(
            (item): item is string => typeof item === "string",
        );
    }

    private getPoolName(pool: Record<string, unknown>): string {
        const form = this.asRecord(pool.form);

        if (!form) {
            return "Unknown";
        }

        const names = form.names;

        if (Array.isArray(names) && names.length > 0) {
            const firstName = this.asRecord(names[0]);
            const localizedName = firstName?.name;

            if (
                typeof localizedName === "string" &&
                localizedName.trim()
            ) {
                return localizedName.trim();
            }
        }

        if (
            typeof form.name === "string" &&
            form.name.trim()
        ) {
            return form.name.trim();
        }

        return "Unknown";
    }

    private asRecord(
        value: unknown,
    ): Record<string, unknown> | null {
        if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
        ) {
            return value as Record<string, unknown>;
        }

        return null;
    }
}
