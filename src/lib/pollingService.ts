import type * as utils from "@iobroker/adapter-core";
import type { KripsolAuth } from "./kripsolAuth";
import type { KripsolCloud, KripsolPool } from "./kripsolCloud";
import type { PoolStateWriter } from "./poolStateWriter";

const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000;

export class PollingService {
    private timer: NodeJS.Timeout | null = null;
    private running = false;
    private stopped = false;
    private consecutiveErrors = 0;
    private pools: KripsolPool[] = [];

    public constructor(
        private readonly adapter: utils.AdapterInstance,
        private readonly auth: KripsolAuth,
        private readonly cloud: KripsolCloud,
        private readonly stateWriter: PoolStateWriter,
        private readonly intervalMs: number,
    ) {}

    public async start(): Promise<void> {
        if (this.timer || this.running) {
            return;
        }

        this.stopped = false;
        await this.adapter.setStateAsync("info.pollingActive", true, true);
        await this.adapter.setStateAsync("info.lastError", "", true);

        await this.poll();
    }

    public stop(): void {
        this.stopped = true;

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        void this.adapter.setStateAsync("info.pollingActive", false, true);
        this.adapter.log.info("Polling stopped.");
    }

    public async pollNow(): Promise<void> {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        await this.poll();
    }

    private async poll(): Promise<void> {
        if (this.stopped) {
            return;
        }

        if (this.running) {
            this.adapter.log.warn(
                "Skipping polling cycle because the previous cycle is still running.",
            );
            this.scheduleNext(this.intervalMs);
            return;
        }

        this.running = true;
        await this.adapter.setStateAsync("info.lastPoll", Date.now(), true);

        try {
            if (this.pools.length === 0) {
                this.pools = await this.cloud.getPools();

                if (this.pools.length === 0) {
                    throw new Error(
                        "Authentication succeeded, but no pools are assigned to this account.",
                    );
                }
            }

            for (const pool of this.pools) {
                const poolData = await this.cloud.fetchPoolData(pool.id);
                const changedStateCount =
                    await this.stateWriter.writePool(pool, poolData);

                this.adapter.log.debug(
                    `Polling completed for pool "${pool.name}". ` +
                        `${changedStateCount} changed state(s).`,
                );
            }

            this.consecutiveErrors = 0;
            await this.adapter.setStateAsync("info.connection", true, true);
            await this.adapter.setStateAsync(
                "info.lastSuccessfulPoll",
                Date.now(),
                true,
            );
            await this.adapter.setStateAsync("info.lastError", "", true);

            this.scheduleNext(this.intervalMs);
        } catch (error) {
            this.consecutiveErrors++;
            this.pools = [];

            const message =
                error instanceof Error ? error.message : String(error);

            await this.adapter.setStateAsync("info.connection", false, true);
            await this.adapter.setStateAsync(
                "info.lastError",
                message,
                true,
            );

            this.adapter.log.error(`Polling failed: ${message}`);

            try {
                await this.auth.reconnect();
                this.adapter.log.info(
                    "Cloud authentication was re-established.",
                );
            } catch (reconnectError) {
                this.adapter.log.warn(
                    `Cloud reconnect failed: ${(reconnectError as Error).message}`,
                );
            }

            const reconnectDelay = Math.min(
                this.intervalMs * 2 ** Math.min(this.consecutiveErrors - 1, 5),
                MAX_RECONNECT_DELAY_MS,
            );

            this.adapter.log.info(
                `Next reconnect attempt in ${Math.round(reconnectDelay / 1000)} seconds.`,
            );
            this.scheduleNext(reconnectDelay);
        } finally {
            this.running = false;
        }
    }

    private scheduleNext(delayMs: number): void {
        if (this.stopped) {
            return;
        }

        if (this.timer) {
            clearTimeout(this.timer);
        }

        this.timer = setTimeout(() => {
            this.timer = null;
            void this.poll();
        }, delayMs);
    }
}
