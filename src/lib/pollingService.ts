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
        await this.poll();
    }

    public stop(): void {
        this.stopped = true;

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        for (const pool of this.pools) {
            void this.setPoolInfo(pool, "pollingActive", false);
        }

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

        try {
            if (this.pools.length === 0) {
                this.pools = await this.cloud.getPools();

                if (this.pools.length === 0) {
                    throw new Error(
                        "Authentication succeeded, but no pools are assigned to this account.",
                    );
                }

                for (const pool of this.pools) {
                    await this.stateWriter.ensurePoolInfoObjects(pool);
                    await this.setPoolInfo(pool, "pollingActive", true);
                    await this.setPoolInfo(pool, "lastError", "");
                }
            }

            let successfulPools = 0;

            for (const pool of this.pools) {
                const startTime = Date.now();
                await this.setPoolInfo(pool, "lastPoll", startTime);

                try {
                    const poolData = await this.cloud.fetchPoolData(pool.id);
                    const changedStateCount =
                        await this.stateWriter.writePool(pool, poolData);
                    const duration = Date.now() - startTime;

                    await this.setPoolInfo(
                        pool,
                        "lastSuccessfulPoll",
                        Date.now(),
                    );
                    await this.setPoolInfo(pool, "lastError", "");
                    await this.setPoolInfo(pool, "pollDuration", duration);
                    await this.setPoolInfo(pool, "pollingActive", true);

                    successfulPools++;

                    this.adapter.log.debug(
                        `Polling completed for pool "${pool.name}" in ${duration} ms. ` +
                            `${changedStateCount} changed state(s).`,
                    );
                } catch (error) {
                    const duration = Date.now() - startTime;
                    const message =
                        error instanceof Error
                            ? error.message
                            : String(error);

                    await this.setPoolInfo(pool, "lastError", message);
                    await this.setPoolInfo(pool, "pollDuration", duration);
                    await this.setPoolInfo(pool, "pollingActive", true);

                    this.adapter.log.error(
                        `Polling failed for pool "${pool.name}": ${message}`,
                    );
                }
            }

            if (successfulPools > 0) {
                this.consecutiveErrors = 0;
                await this.adapter.setStateAsync(
                    "info.connection",
                    true,
                    true,
                );
                this.scheduleNext(this.intervalMs);
            } else {
                throw new Error("Polling failed for all configured pools.");
            }
        } catch (error) {
            this.consecutiveErrors++;
            this.pools = [];

            const message =
                error instanceof Error ? error.message : String(error);

            await this.adapter.setStateAsync(
                "info.connection",
                false,
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
                this.intervalMs *
                    2 ** Math.min(this.consecutiveErrors - 1, 5),
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

    private async setPoolInfo(
        pool: KripsolPool,
        name: string,
        value: string | number | boolean,
    ): Promise<void> {
        const poolId = this.sanitizeIdPart(pool.id);

        await this.adapter.setStateAsync(
            `pools.${poolId}.Info.${name}`,
            value,
            true,
        );
    }

    private sanitizeIdPart(value: string): string {
        const sanitized = value
            .trim()
            .replace(/[.\s*,;'"`<>\\?[\]{}=+~!#$%^&()|/]+/g, "_")
            .replace(/^_+|_+$/g, "");

        return sanitized || "unbenannt";
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
