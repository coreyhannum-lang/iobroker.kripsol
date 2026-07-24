"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_kripsolAuth = require("./lib/kripsolAuth");
var import_kripsolCloud = require("./lib/kripsolCloud");
var import_poolStateWriter = require("./lib/poolStateWriter");
var import_pollingService = require("./lib/pollingService");
const DEFAULT_POLLING_INTERVAL_SECONDS = 30;
const MIN_POLLING_INTERVAL_SECONDS = 10;
const MAX_POLLING_INTERVAL_SECONDS = 3600;
class Kripsol extends utils.Adapter {
  auth = null;
  cloud = null;
  stateWriter = null;
  pollingService = null;
  constructor(options = {}) {
    super({
      ...options,
      name: "kripsol"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    var _a;
    await this.createInfoObjects();
    await this.setStateAsync("info.connection", false, true);
    await this.setStateAsync("info.pollingActive", false, true);
    await this.setStateAsync("info.lastError", "", true);
    const username = (_a = this.config.username) == null ? void 0 : _a.trim();
    const password = this.config.password;
    if (!username || !password) {
      this.log.error(
        "Kripsol cloud username and password must be configured."
      );
      return;
    }
    const pollingIntervalSeconds = this.getPollingIntervalSeconds();
    const pollingIntervalMs = pollingIntervalSeconds * 1e3;
    this.auth = new import_kripsolAuth.KripsolAuth(username, password);
    this.cloud = new import_kripsolCloud.KripsolCloud(this.auth);
    this.stateWriter = new import_poolStateWriter.PoolStateWriter(this);
    try {
      const tokens = await this.auth.authenticate();
      this.log.info(
        `Successfully authenticated with the Kripsol cloud. User ID: ${tokens.userId}`
      );
      await this.subscribeStatesAsync("pools.*");
      this.pollingService = new import_pollingService.PollingService(
        this,
        this.auth,
        this.cloud,
        this.stateWriter,
        pollingIntervalMs
      );
      await this.pollingService.start();
      this.log.info(
        `Continuous pool-data polling is active with an interval of ${pollingIntervalSeconds} seconds.`
      );
    } catch (error) {
      await this.setStateAsync("info.connection", false, true);
      if (error instanceof import_kripsolAuth.KripsolAuthenticationError || error instanceof import_kripsolCloud.KripsolCloudError) {
        this.log.error(error.message);
      } else {
        this.log.error(
          `Unexpected error during cloud initialization: ${error.message}`
        );
      }
    }
  }
  async createInfoObjects() {
    await this.extendObjectAsync("info", {
      type: "channel",
      common: {
        name: {
          en: "Information",
          de: "Information"
        }
      },
      native: {}
    });
    await this.extendObjectAsync("info.connection", {
      type: "state",
      common: {
        name: {
          en: "Cloud connection",
          de: "Cloud-Verbindung"
        },
        type: "boolean",
        role: "indicator.connected",
        read: true,
        write: false,
        def: false
      },
      native: {}
    });
    await this.extendObjectAsync("info.pollingActive", {
      type: "state",
      common: {
        name: {
          en: "Polling active",
          de: "Polling aktiv"
        },
        type: "boolean",
        role: "indicator",
        read: true,
        write: false,
        def: false
      },
      native: {}
    });
    await this.extendObjectAsync("info.lastPoll", {
      type: "state",
      common: {
        name: {
          en: "Last polling attempt",
          de: "Letzter Polling-Versuch"
        },
        type: "number",
        role: "value.time",
        read: true,
        write: false,
        def: 0
      },
      native: {}
    });
    await this.extendObjectAsync("info.lastSuccessfulPoll", {
      type: "state",
      common: {
        name: {
          en: "Last successful polling",
          de: "Letztes erfolgreiches Polling"
        },
        type: "number",
        role: "value.time",
        read: true,
        write: false,
        def: 0
      },
      native: {}
    });
    await this.extendObjectAsync("info.lastError", {
      type: "state",
      common: {
        name: {
          en: "Last polling error",
          de: "Letzter Polling-Fehler"
        },
        type: "string",
        role: "text",
        read: true,
        write: false,
        def: ""
      },
      native: {}
    });
  }
  async onStateChange(id, state) {
    var _a, _b, _c;
    if (!state || state.ack || !this.cloud) {
      return;
    }
    try {
      const object = await this.getObjectAsync(id);
      if ((object == null ? void 0 : object.type) !== "state" || object.common.write !== true || typeof ((_a = object.native) == null ? void 0 : _a.poolId) !== "string" || !Array.isArray((_b = object.native) == null ? void 0 : _b.cloudPath)) {
        this.log.warn(`Ignoring unsupported write request for ${id}.`);
        return;
      }
      const cloudPath = object.native.cloudPath.filter(
        (part) => typeof part === "string"
      );
      await this.cloud.updatePoolField(
        object.native.poolId,
        cloudPath,
        state.val
      );
      await this.setStateAsync(id, state.val, true);
      this.log.info(
        `Cloud value updated: ${id} = ${JSON.stringify(state.val)}`
      );
      await ((_c = this.pollingService) == null ? void 0 : _c.pollNow());
    } catch (error) {
      this.log.error(
        `Could not write ${id}: ${error.message}`
      );
    }
  }
  getPollingIntervalSeconds() {
    const configured = Number(this.config.pollingInterval);
    if (!Number.isFinite(configured)) {
      return DEFAULT_POLLING_INTERVAL_SECONDS;
    }
    return Math.min(
      MAX_POLLING_INTERVAL_SECONDS,
      Math.max(MIN_POLLING_INTERVAL_SECONDS, Math.round(configured))
    );
  }
  onUnload(callback) {
    var _a;
    (_a = this.pollingService) == null ? void 0 : _a.stop();
    this.pollingService = null;
    this.stateWriter = null;
    this.cloud = null;
    this.auth = null;
    this.setState("info.connection", false, true, () => callback());
  }
}
if (require.main !== module) {
  module.exports = (options) => new Kripsol(options);
} else {
  (() => new Kripsol())();
}
//# sourceMappingURL=main.js.map
