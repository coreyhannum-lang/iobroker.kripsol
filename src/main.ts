/*
 * Created with @iobroker/create-adapter v3.1.5
 */

import * as utils from "@iobroker/adapter-core";
import {
    KripsolAuth,
    KripsolAuthenticationError,
} from "./lib/kripsolAuth";

class Kripsol extends utils.Adapter {
    private auth: KripsolAuth | null = null;

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

        try {
            const tokens = await this.auth.authenticate();

            await this.setStateAsync("info.connection", true, true);
            this.log.info(
                `Successfully authenticated with the Kripsol cloud. User ID: ${tokens.userId}`,
            );
        } catch (error) {
            await this.setStateAsync("info.connection", false, true);

            if (error instanceof KripsolAuthenticationError) {
                this.log.error(error.message);
            } else {
                this.log.error(
                    `Unexpected error during cloud login: ${(error as Error).message}`,
                );
            }
        }
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
