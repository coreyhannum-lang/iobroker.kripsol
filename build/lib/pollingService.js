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
class PollingService {
  constructor(adapter, cloud, stateWriter, pools, intervalMs) {
    this.adapter = adapter;
    this.cloud = cloud;
    this.stateWriter = stateWriter;
    this.pools = pools;
    this.intervalMs = intervalMs;
  }
  timer = null;
  running = false;
  async start() {
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
      `Polling started with an interval of ${this.intervalMs / 1e3} seconds.`
    );
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    void this.adapter.setStateAsync("info.pollingActive", false, true);
    this.adapter.log.info("Polling stopped.");
  }
  async poll() {
    if (this.running) {
      this.adapter.log.warn(
        "Skipping polling cycle because the previous cycle is still running."
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
          poolData
        );
        this.adapter.log.debug(
          `Polling completed for pool "${pool.name}". ${changedStateCount} changed state(s).`
        );
      }
      await this.adapter.setStateAsync("info.connection", true, true);
      await this.adapter.setStateAsync(
        "info.lastSuccessfulPoll",
        Date.now(),
        true
      );
      await this.adapter.setStateAsync("info.lastError", "", true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.adapter.setStateAsync("info.connection", false, true);
      await this.adapter.setStateAsync(
        "info.lastError",
        errorMessage,
        true
      );
      this.adapter.log.error(`Polling failed: ${errorMessage}`);
    } finally {
      this.running = false;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PollingService
});
//# sourceMappingURL=pollingService.js.map
