import type * as utils from "@iobroker/adapter-core";
import type { KripsolCloud, KripsolPool } from "./kripsolCloud";
import type { PoolStateWriter } from "./poolStateWriter";

export class PollingService {
    private timer: NodeJS.Timeout | null = null;
    private running = false;

    public constructor(
        private readonly adapter: utils.AdapterInstance,
        private readonly cloud: KripsolCloud,
        private readonly stateWriter: PoolStateWriter,
        private readonly pools: KripsolPool[],
        private readonly intervalMs: number,
    ) {}

    public async start(): Promise<void> {
        if (this.timer) {
            return;
        }

        await this.adapter.setStateAsync("info.pollingActive", true, true);
        await this.adapter.setStateAsync("info.lastError", "", true);

        await this.poll();

        this.timer = setInterval(() => {
            void this.poll();
        }, this.intervalMs);

        this.adapter.log.info(
            `Polling started with an interval of ${this.intervalMs / 1000} seconds.`,
        );
    }

    public stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        void this.adapter.setStateAsync("info.pollingActive", false, true);

        this.adapter.log.info("Polling stopped.");
    }

    private async poll(): Promise<void> {
        if (this.running) {
            this.adapter.log.warn(
                "Skipping polling cycle because the previous cycle is still running.",
            );
            return;
        }

        this.running = true;
        const pollTimestamp = Date.now();

        await this.adapter.setStateAsync("info.lastPoll", pollTimestamp, true);

        try {
            for (const pool of this.pools) {
                const poolData = await this.cloud.fetchPoolData(pool.id);
                const changedStateCount = await this.stateWriter.writePool(
                    pool,
                    poolData,
                );

                this.adapter.log.debug(
                    `Polling completed for pool "${pool.name}". ` +
                        `${changedStateCount} changed state(s).`,
                );
            }

            await this.adapter.setStateAsync("info.connection", true, true);
            await this.adapter.setStateAsync(
                "info.lastSuccessfulPoll",
                Date.now(),
                true,
            );
            await this.adapter.setStateAsync("info.lastError", "", true);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);

            await this.adapter.setStateAsync("info.connection", false, true);
            await this.adapter.setStateAsync(
                "info.lastError",
                errorMessage,
                true,
            );

            this.adapter.log.error(`Polling failed: ${errorMessage}`);
        } finally {
            this.running = false;
        }
    }
}
