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
    await this.adapter.setStateAsync("info.pollingActive", true, true);
    await this.adapter.setStateAsync("info.lastError", "", true);
    await this.poll();
  }
  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    void this.adapter.setStateAsync("info.pollingActive", false, true);
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
    await this.adapter.setStateAsync("info.lastPoll", Date.now(), true);
    try {
      if (this.pools.length === 0) {
        this.pools = await this.cloud.getPools();
        if (this.pools.length === 0) {
          throw new Error(
            "Authentication succeeded, but no pools are assigned to this account."
          );
        }
      }
      for (const pool of this.pools) {
        const poolData = await this.cloud.fetchPoolData(pool.id);
        const changedStateCount = await this.stateWriter.writePool(pool, poolData);
        this.adapter.log.debug(
          `Polling completed for pool "${pool.name}". ${changedStateCount} changed state(s).`
        );
      }
      this.consecutiveErrors = 0;
      await this.adapter.setStateAsync("info.connection", true, true);
      await this.adapter.setStateAsync(
        "info.lastSuccessfulPoll",
        Date.now(),
        true
      );
      await this.adapter.setStateAsync("info.lastError", "", true);
      this.scheduleNext(this.intervalMs);
    } catch (error) {
      this.consecutiveErrors++;
      this.pools = [];
      const message = error instanceof Error ? error.message : String(error);
      await this.adapter.setStateAsync("info.connection", false, true);
      await this.adapter.setStateAsync(
        "info.lastError",
        message,
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
