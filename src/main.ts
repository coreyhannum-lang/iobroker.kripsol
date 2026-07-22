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
    type KripsolPool,
} from "./lib/kripsolCloud";

class Kripsol extends utils.Adapter {
    private auth: KripsolAuth | null = null;
    private cloud: KripsolCloud | null = null;

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
        await this.setStateAsync("info.connection", false, true);

        const username = this.config.username?.trim();
        const password = this.config.password;

        if (!username || !password) {
            this.log.error(
                "Kripsol cloud username and password must be configured.",
            );
            return;
        }

        this.auth = new KripsolAuth(username, password);
        this.cloud = new KripsolCloud(this.auth);

        try {
            const tokens = await this.auth.authenticate();

            this.log.info(
                `Successfully authenticated with the Kripsol cloud. User ID: ${tokens.userId}`,
            );

            const pools = await this.cloud.getPools();

            if (pools.length === 0) {
                this.log.warn(
                    "Authentication succeeded, but no pools are assigned to this account.",
                );
                return;
            }

            for (const pool of pools) {
                await this.readAndLogPoolData(pool);
            }

            await this.setStateAsync("info.connection", true, true);
            this.log.info(
                `Pool data retrieval completed for ${pools.length} pool(s).`,
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

    private async readAndLogPoolData(pool: KripsolPool): Promise<void> {
        if (!this.cloud) {
            throw new KripsolCloudError(
                "Kripsol cloud client is not initialized.",
            );
        }

        this.log.info(`Reading data for pool "${pool.name}" (${pool.id}) ...`);

        const poolData = await this.cloud.fetchPoolData(pool.id);
        const topLevelKeys = Object.keys(poolData).sort();

        this.log.info(
            `Received pool data for "${pool.name}": ` +
                `${topLevelKeys.length} top-level field(s): ${topLevelKeys.join(", ")}`,
        );

        this.log.debug(
            `Complete pool data for "${pool.name}" (${pool.id}): ` +
                JSON.stringify(poolData),
        );
    }

    private onStateChange(
        id: string,
        state: ioBroker.State | null | undefined,
    ): void {
        if (state && !state.ack) {
            this.log.debug(`Ignoring unsupported command for ${id}.`);
        }
    }

    private onUnload(callback: () => void): void {
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
