/*
 * Created with @iobroker/create-adapter v3.1.5
 */

import * as utils from "@iobroker/adapter-core";
import {
    KripsolAuth,
    KripsolAuthenticationError,
} from "./lib/kripsolAuth";
import {
    KripsolCloud,
    KripsolCloudError,
} from "./lib/kripsolCloud";
import { PoolStateWriter } from "./lib/poolStateWriter";
import { PollingService } from "./lib/pollingService";

const DEFAULT_POLLING_INTERVAL_SECONDS = 30;
const MIN_POLLING_INTERVAL_SECONDS = 10;
const MAX_POLLING_INTERVAL_SECONDS = 3600;

class Kripsol extends utils.Adapter {
    private auth: KripsolAuth | null = null;
    private cloud: KripsolCloud | null = null;
    private stateWriter: PoolStateWriter | null = null;
    private pollingService: PollingService | null = null;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: "kripsol",
        });

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    private async onReady(): Promise<void> {
        await this.createInfoObjects();

        await this.setStateAsync("info.connection", false, true);
        await this.setStateAsync("info.pollingActive", false, true);
        await this.setStateAsync("info.lastError", "", true);

        const username = this.config.username?.trim();
        const password = this.config.password;

        if (!username || !password) {
            this.log.error(
                "Kripsol cloud username and password must be configured.",
            );
            return;
        }

        const pollingIntervalSeconds = this.getPollingIntervalSeconds();
        const pollingIntervalMs = pollingIntervalSeconds * 1000;

        this.auth = new KripsolAuth(username, password);
        this.cloud = new KripsolCloud(this.auth);
        this.stateWriter = new PoolStateWriter(this);

        try {
            const tokens = await this.auth.authenticate();

            this.log.info(
                `Successfully authenticated with the Kripsol cloud. User ID: ${tokens.userId}`,
            );

            await this.subscribeStatesAsync("pools.*");

            this.pollingService = new PollingService(
                this,
                this.auth,
                this.cloud,
                this.stateWriter,
                pollingIntervalMs,
            );

            await this.pollingService.start();

            this.log.info(
                `Continuous pool-data polling is active with an interval of ${pollingIntervalSeconds} seconds.`,
            );
        } catch (error) {
            await this.setStateAsync("info.connection", false, true);

            if (
                error instanceof KripsolAuthenticationError ||
                error instanceof KripsolCloudError
            ) {
                this.log.error(error.message);
            } else {
                this.log.error(
                    `Unexpected error during cloud initialization: ${(error as Error).message}`,
                );
            }
        }
    }

    private async createInfoObjects(): Promise<void> {
        await this.extendObjectAsync("info", {
            type: "channel",
            common: {
                name: {
                    en: "Information",
                    de: "Information",
                },
            },
            native: {},
        });

        await this.extendObjectAsync("info.connection", {
            type: "state",
            common: {
                name: {
                    en: "Cloud connection",
                    de: "Cloud-Verbindung",
                },
                type: "boolean",
                role: "indicator.connected",
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });

        await this.extendObjectAsync("info.pollingActive", {
            type: "state",
            common: {
                name: {
                    en: "Polling active",
                    de: "Polling aktiv",
                },
                type: "boolean",
                role: "indicator",
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });

        await this.extendObjectAsync("info.lastPoll", {
            type: "state",
            common: {
                name: {
                    en: "Last polling attempt",
                    de: "Letzter Polling-Versuch",
                },
                type: "number",
                role: "value.time",
                read: true,
                write: false,
                def: 0,
            },
            native: {},
        });

        await this.extendObjectAsync("info.lastSuccessfulPoll", {
            type: "state",
            common: {
                name: {
                    en: "Last successful polling",
                    de: "Letztes erfolgreiches Polling",
                },
                type: "number",
                role: "value.time",
                read: true,
                write: false,
                def: 0,
            },
            native: {},
        });

        await this.extendObjectAsync("info.lastError", {
            type: "state",
            common: {
                name: {
                    en: "Last polling error",
                    de: "Letzter Polling-Fehler",
                },
                type: "string",
                role: "text",
                read: true,
                write: false,
                def: "",
            },
            native: {},
        });
    }

    private async onStateChange(
        id: string,
        state: ioBroker.State | null | undefined,
    ): Promise<void> {
        if (!state || state.ack || !this.cloud) {
            return;
        }

        try {
            const object = await this.getObjectAsync(id);

            if (
                object?.type !== "state" ||
                object.common.write !== true ||
                typeof object.native?.poolId !== "string" ||
                !Array.isArray(object.native?.cloudPath)
            ) {
                this.log.warn(`Ignoring unsupported write request for ${id}.`);
                return;
            }

            const cloudPath = object.native.cloudPath.filter(
                (part: unknown): part is string => typeof part === "string",
            );

            await this.cloud.updatePoolField(
                object.native.poolId,
                cloudPath,
                state.val,
            );

            await this.setStateAsync(id, state.val, true);

            this.log.info(
                `Cloud value updated: ${id} = ${JSON.stringify(state.val)}`,
            );

            await this.pollingService?.pollNow();
        } catch (error) {
            this.log.error(
                `Could not write ${id}: ${(error as Error).message}`,
            );
        }
    }

    private getPollingIntervalSeconds(): number {
        const configured = Number(this.config.pollingInterval);

        if (!Number.isFinite(configured)) {
            return DEFAULT_POLLING_INTERVAL_SECONDS;
        }

        return Math.min(
            MAX_POLLING_INTERVAL_SECONDS,
            Math.max(MIN_POLLING_INTERVAL_SECONDS, Math.round(configured)),
        );
    }

    private onUnload(callback: () => void): void {
        this.pollingService?.stop();
        this.pollingService = null;
        this.stateWriter = null;
        this.cloud = null;
        this.auth = null;

        this.setState("info.connection", false, true, () => callback());
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) =>
        new Kripsol(options);
} else {
    (() => new Kripsol())();
}
