"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var pollingService_exports = {};
__export(pollingService_exports, {
  PollingService: () => PollingService
});
module.exports = __toCommonJS(pollingService_exports);
const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1e3;
class PollingService {
  constructor(adapter, auth, cloud, stateWriter, intervalMs) {
    this.adapter = adapter;
    this.auth = auth;
    this.cloud = cloud;
    this.stateWriter = stateWriter;
    this.intervalMs = intervalMs;
  }
  timer = null;
  running = false;
  stopped = false;
  consecutiveErrors = 0;
  pools = [];
  async start() {
    if (this.timer || this.running) {
      return;
    }
    this.stopped = false;
    await this.poll();
  }
  stop() {
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
  async pollNow() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.poll();
  }
  async poll() {
    if (this.stopped) {
      return;
    }
    if (this.running) {
      this.adapter.log.warn(
        "Skipping polling cycle because the previous cycle is still running."
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
            "Authentication succeeded, but no pools are assigned to this account."
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
          const changedStateCount = await this.stateWriter.writePool(pool, poolData);
          const duration = Date.now() - startTime;
          await this.setPoolInfo(
            pool,
            "lastSuccessfulPoll",
            Date.now()
          );
          await this.setPoolInfo(pool, "lastError", "");
          await this.setPoolInfo(pool, "pollDuration", duration);
          await this.setPoolInfo(pool, "pollingActive", true);
          successfulPools++;
          this.adapter.log.debug(
            `Polling completed for pool "${pool.name}" in ${duration} ms. ${changedStateCount} changed state(s).`
          );
        } catch (error) {
          const duration = Date.now() - startTime;
          const message = error instanceof Error ? error.message : String(error);
          await this.setPoolInfo(pool, "lastError", message);
          await this.setPoolInfo(pool, "pollDuration", duration);
          await this.setPoolInfo(pool, "pollingActive", true);
          this.adapter.log.error(
            `Polling failed for pool "${pool.name}": ${message}`
          );
        }
      }
      if (successfulPools > 0) {
        this.consecutiveErrors = 0;
        await this.adapter.setStateAsync(
          "info.connection",
          true,
          true
        );
        this.scheduleNext(this.intervalMs);
      } else {
        throw new Error("Polling failed for all configured pools.");
      }
    } catch (error) {
      this.consecutiveErrors++;
      this.pools = [];
      const message = error instanceof Error ? error.message : String(error);
      await this.adapter.setStateAsync(
        "info.connection",
        false,
        true
      );
      this.adapter.log.error(`Polling failed: ${message}`);
      try {
        await this.auth.reconnect();
        this.adapter.log.info(
          "Cloud authentication was re-established."
        );
      } catch (reconnectError) {
        this.adapter.log.warn(
          `Cloud reconnect failed: ${reconnectError.message}`
        );
      }
      const reconnectDelay = Math.min(
        this.intervalMs * 2 ** Math.min(this.consecutiveErrors - 1, 5),
        MAX_RECONNECT_DELAY_MS
      );
      this.adapter.log.info(
        `Next reconnect attempt in ${Math.round(reconnectDelay / 1e3)} seconds.`
      );
      this.scheduleNext(reconnectDelay);
    } finally {
      this.running = false;
    }
  }
  async setPoolInfo(pool, name, value) {
    const poolId = this.sanitizeIdPart(pool.id);
    await this.adapter.setStateAsync(
      `pools.${poolId}.Info.${name}`,
      value,
      true
    );
  }
  sanitizeIdPart(value) {
    const sanitized = value.trim().replace(/[.\s*,;'"`<>\\?[\]{}=+~!#$%^&()|/]+/g, "_").replace(/^_+|_+$/g, "");
    return sanitized || "unbenannt";
  }
  scheduleNext(delayMs) {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PollingService
});
//# sourceMappingURL=pollingService.js.map
