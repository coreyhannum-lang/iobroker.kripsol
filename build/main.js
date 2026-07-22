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
class Kripsol extends utils.Adapter {
  auth = null;
  cloud = null;
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
    await this.setStateAsync("info.connection", false, true);
    const username = (_a = this.config.username) == null ? void 0 : _a.trim();
    const password = this.config.password;
    if (!username || !password) {
      this.log.error(
        "Kripsol cloud username and password must be configured."
      );
      return;
    }
    this.auth = new import_kripsolAuth.KripsolAuth(username, password);
    this.cloud = new import_kripsolCloud.KripsolCloud(this.auth);
    try {
      const tokens = await this.auth.authenticate();
      this.log.info(
        `Successfully authenticated with the Kripsol cloud. User ID: ${tokens.userId}`
      );
      const pools = await this.cloud.getPools();
      if (pools.length === 0) {
        await this.setStateAsync("info.connection", false, true);
        this.log.warn(
          "Authentication succeeded, but no pools are assigned to this account."
        );
        return;
      }
      for (const pool of pools) {
        this.log.info(`Found pool "${pool.name}" with ID ${pool.id}`);
      }
      await this.setStateAsync("info.connection", true, true);
      this.log.info(`Pool discovery completed. Found ${pools.length} pool(s).`);
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
  onStateChange(id, state) {
    if (state && !state.ack) {
      this.log.debug(`Ignoring unsupported command for ${id}.`);
    }
  }
  onUnload(callback) {
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
