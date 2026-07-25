const FIRESTORE_PROJECT = "hayward-europe";
const FIRESTORE_BASE =
    `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}` +
    "/databases/(default)/documents";

const COMMAND_ENDPOINT =
    "https://europe-west1-hayward-europe.cloudfunctions.net/sendPoolCommand";
const COMMAND_TIMEOUT_MS = 20_000;

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

interface CommandErrorResponse {
    error?: string | { message?: string };
    message?: string;
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
    private readonly poolDataCache = new Map<
        string,
        Record<string, unknown>
    >();

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

            this.poolDataCache.set(poolId, poolDocument);

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
        const data = await this.getDocument(
            `pools/${encodeURIComponent(poolId)}`,
        );

        this.poolDataCache.set(poolId, data);
        return data;
    }

    public async updatePoolField(
        poolId: string,
        fieldPath: string[],
        value: ioBroker.StateValue,
    ): Promise<void> {
        if (fieldPath.length === 0) {
            throw new KripsolCloudError("Cloud field path is empty.");
        }

        let poolData = this.poolDataCache.get(poolId);

        if (!poolData) {
            poolData = await this.fetchPoolData(poolId);
        }

        const gateway = this.readGatewayId(poolData, poolId);
        const changes = this.createCommandChanges(
            poolData,
            fieldPath,
            value,
        );
        const tokens = await this.auth.getValidTokens();
        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            COMMAND_TIMEOUT_MS,
        );

        let response: Response;

        try {
            response = await fetch(COMMAND_ENDPOINT, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${tokens.idToken}`,
                    Accept: "application/json",
                    "Content-Type": "application/json; charset=UTF-8",
                },
                body: JSON.stringify({
                    gateway,
                    poolId,
                    operation: "WRP",
                    changes: JSON.stringify(changes),
                    source: "web",
                }),
                signal: controller.signal,
            });
        } catch (error) {
            if ((error as Error).name === "AbortError") {
                throw new KripsolCloudError(
                    `Cloud command timed out after ${COMMAND_TIMEOUT_MS / 1000} seconds.`,
                );
            }

            throw new KripsolCloudError(
                `Cloud command transport error: ${(error as Error).message}`,
            );
        } finally {
            clearTimeout(timeout);
        }

        const responseText = await response.text();

        if (!response.ok) {
            throw new KripsolCloudError(
                `Cloud command failed for ${fieldPath.join(".")} ` +
                    `(HTTP ${response.status}): ` +
                    `${this.readCommandError(responseText)}`,
            );
        }

        this.setNestedValue(poolData, fieldPath, value);
    }

    private readGatewayId(
        poolData: Record<string, unknown>,
        poolId: string,
    ): string | number {
        const candidates = [
            poolData.wifi,
            poolData.gateway,
            poolData.gatewayId,
        ];

        for (const candidate of candidates) {
            if (
                (typeof candidate === "string" &&
                    candidate.trim().length > 0) ||
                typeof candidate === "number"
            ) {
                return candidate;
            }
        }

        throw new KripsolCloudError(
            `Pool ${poolId} does not contain a valid gateway ID.`,
        );
    }

    private createCommandChanges(
        poolData: Record<string, unknown>,
        fieldPath: string[],
        value: ioBroker.StateValue,
    ): Record<string, unknown> {
        const rootKey = fieldPath[0];

        if (!rootKey) {
            throw new KripsolCloudError("Cloud field path is empty.");
        }

        const currentRoot = poolData[rootKey];
        const changes: Record<string, unknown> = {
            [rootKey]: this.cloneJsonValue(currentRoot ?? {}),
        };

        this.setNestedValue(changes, fieldPath, value);
        return changes;
    }

    private setNestedValue(
        target: Record<string, unknown>,
        fieldPath: string[],
        value: ioBroker.StateValue,
    ): void {
        let current = target;

        for (const key of fieldPath.slice(0, -1)) {
            const existing = this.asRecord(current[key]);

            if (existing) {
                current = existing;
                continue;
            }

            const created: Record<string, unknown> = {};
            current[key] = created;
            current = created;
        }

        const leaf = fieldPath[fieldPath.length - 1];

        if (!leaf) {
            throw new KripsolCloudError("Cloud field path is empty.");
        }

        current[leaf] = value;
    }

    private cloneJsonValue(value: unknown): unknown {
        if (value === undefined) {
            return {};
        }

        return JSON.parse(JSON.stringify(value)) as unknown;
    }

    private readCommandError(responseText: string): string {
        if (!responseText) {
            return "Unknown error";
        }

        try {
            const payload = JSON.parse(
                responseText,
            ) as CommandErrorResponse;

            if (typeof payload.error === "string") {
                return payload.error;
            }

            return (
                payload.error?.message ??
                payload.message ??
                responseText
            );
        } catch {
            return responseText;
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
