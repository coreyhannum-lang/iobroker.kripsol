const FIRESTORE_PROJECT = "hayward-europe";
const FIRESTORE_BASE =
    `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents`;

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
        const user = await this.getDocument(`users/${encodeURIComponent(tokens.userId)}`);

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

    public async fetchPoolData(poolId: string): Promise<Record<string, unknown>> {
        return this.getDocument(`pools/${encodeURIComponent(poolId)}`);
    }

    private async getDocument(path: string): Promise<Record<string, unknown>> {
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
            return (value.arrayValue?.values ?? []).map(item =>
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

        return value.filter((item): item is string => typeof item === "string");
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

            if (typeof localizedName === "string" && localizedName.trim()) {
                return localizedName.trim();
            }
        }

        if (typeof form.name === "string" && form.name.trim()) {
            return form.name.trim();
        }

        return "Unknown";
    }

    private asRecord(value: unknown): Record<string, unknown> | null {
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
