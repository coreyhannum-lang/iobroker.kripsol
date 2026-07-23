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
var poolStateWriter_exports = {};
__export(poolStateWriter_exports, {
  PoolStateWriter: () => PoolStateWriter
});
module.exports = __toCommonJS(poolStateWriter_exports);
const METADATA_RULES = [
  { pattern: /(water|pool).*(temp|temperature)|(temp|temperature).*(water|pool)/i, name: "Water temperature", role: "value.temperature", unit: "\xB0C", category: "sensors" },
  { pattern: /(air|ambient).*(temp|temperature)|(temp|temperature).*(air|ambient)/i, name: "Air temperature", role: "value.temperature", unit: "\xB0C", category: "sensors" },
  { pattern: /(^|\.)(temp|temperature)(\.|$)/i, name: "Temperature", role: "value.temperature", unit: "\xB0C", category: "sensors" },
  { pattern: /(^|\.)(ph|phvalue|ph_value)(\.|$)/i, name: "pH value", role: "value", unit: "pH", category: "waterQuality" },
  { pattern: /(^|\.)(orp|redox|rx)(\.|$)/i, name: "Redox potential", role: "value", unit: "mV", category: "waterQuality" },
  { pattern: /(salinity|salt|saltlevel|salt_level)/i, name: "Salinity", role: "value", unit: "g/l", category: "waterQuality" },
  { pattern: /(conductivity|(^|\.)ec(\.|$))/i, name: "Conductivity", role: "value", unit: "\xB5S/cm", category: "waterQuality" },
  { pattern: /(flow|flowrate|flow_rate)/i, name: "Flow rate", role: "value", unit: "l/min", category: "hydraulics" },
  { pattern: /pressure/i, name: "Pressure", role: "value.pressure", unit: "bar", category: "hydraulics" },
  { pattern: /(runtime|duration|timer|minutes)/i, name: "Runtime", role: "value.interval", unit: "min", category: "timers" },
  { pattern: /(^|\.)(speed|rpm)(\.|$)/i, name: "Speed", role: "level", unit: "rpm", write: true, category: "controls" },
  { pattern: /(percentage|percent|output|setpoint|target)/i, name: "Set value", role: "level", unit: "%", write: true, category: "controls" },
  { pattern: /(light|lights|lighting)/i, name: "Pool light", role: "switch", write: true, category: "controls" },
  { pattern: /(filtration|filter|pump)/i, name: "Filtration", role: "switch", write: true, category: "controls" },
  { pattern: /backwash/i, name: "Backwash", role: "switch", write: true, category: "controls" },
  { pattern: /(heating|heater|heatpump|heat_pump)/i, name: "Heating", role: "switch", write: true, category: "controls" },
  { pattern: /(enabled|enable|active|running|manual|automatic|auto|mode)/i, name: "Operating state", role: "switch", write: true, category: "controls" },
  { pattern: /(alarm|error|fault|warning)/i, name: "Error", role: "indicator.alarm", category: "diagnostics" },
  { pattern: /(online|connected|connection|status)/i, name: "Status", role: "indicator", category: "diagnostics" }
];
const CATEGORY_NAMES = {
  controls: "Controls",
  sensors: "Sensors",
  waterQuality: "Water quality",
  hydraulics: "Hydraulics",
  timers: "Timers",
  diagnostics: "Diagnostics",
  information: "Information",
  other: "Other"
};
class PoolStateWriter {
  constructor(adapter) {
    this.adapter = adapter;
  }
  async writePool(pool, poolData) {
    const poolId = this.sanitizeIdPart(pool.id);
    const poolRoot = `pools.${poolId}`;
    await this.ensureChannel("pools", "Pools");
    await this.ensureDevice(poolRoot, pool.name);
    let changedStateCount = 0;
    const informationRoot = `${poolRoot}.information`;
    await this.ensureChannel(informationRoot, "Information");
    changedStateCount += await this.writeState(
      `${informationRoot}.name`,
      "Pool name",
      pool.name,
      pool.id,
      ["name"],
      false
    );
    changedStateCount += await this.writeState(
      `${informationRoot}.cloudId`,
      "Cloud pool ID",
      pool.id,
      pool.id,
      ["cloudId"],
      false
    );
    changedStateCount += await this.writeRecord(
      poolRoot,
      pool.id,
      poolData,
      []
    );
    return changedStateCount;
  }
  async writeRecord(poolRoot, poolId, record, cloudPath) {
    var _a, _b, _c, _d;
    let changedStateCount = 0;
    for (const [key, value] of Object.entries(record)) {
      const nextCloudPath = [...cloudPath, key];
      if (this.isRecord(value)) {
        changedStateCount += await this.writeRecord(
          poolRoot,
          poolId,
          value,
          nextCloudPath
        );
        continue;
      }
      const metadata = this.findMetadata(nextCloudPath);
      const category = (_a = metadata == null ? void 0 : metadata.category) != null ? _a : "other";
      const categoryRoot = `${poolRoot}.${category}`;
      await this.ensureChannel(
        categoryRoot,
        (_b = CATEGORY_NAMES[category]) != null ? _b : this.humanizeKey(category)
      );
      const relativeId = nextCloudPath.map((part) => this.sanitizeIdPart(part)).join("_");
      const stateId = `${categoryRoot}.${relativeId}`;
      if (Array.isArray(value)) {
        changedStateCount += await this.writeState(
          stateId,
          (_c = metadata == null ? void 0 : metadata.name) != null ? _c : this.humanizeKey(key),
          JSON.stringify(value),
          poolId,
          nextCloudPath,
          false,
          "json"
        );
        continue;
      }
      changedStateCount += await this.writeState(
        stateId,
        (_d = metadata == null ? void 0 : metadata.name) != null ? _d : this.humanizeKey(key),
        value,
        poolId,
        nextCloudPath,
        (metadata == null ? void 0 : metadata.write) === true
      );
    }
    return changedStateCount;
  }
  async ensureDevice(id, name) {
    await this.adapter.extendObjectAsync(id, {
      type: "device",
      common: { name },
      native: {}
    });
  }
  async ensureChannel(id, name) {
    await this.adapter.extendObjectAsync(id, {
      type: "channel",
      common: { name },
      native: {}
    });
  }
  async writeState(id, fallbackName, value, poolId, cloudPath, requestedWrite, forcedRole) {
    var _a, _b, _c;
    const metadata = this.findMetadata(cloudPath);
    const definition = this.getStateDefinition(
      value,
      requestedWrite,
      forcedRole
    );
    await this.adapter.extendObjectAsync(id, {
      type: "state",
      common: {
        name: (_a = metadata == null ? void 0 : metadata.name) != null ? _a : fallbackName,
        type: definition.type,
        role: (_b = metadata == null ? void 0 : metadata.role) != null ? _b : definition.role,
        unit: (_c = metadata == null ? void 0 : metadata.unit) != null ? _c : definition.unit,
        read: true,
        write: definition.write
      },
      native: {
        poolId,
        cloudPath
      }
    });
    const currentState = await this.adapter.getStateAsync(id);
    if (currentState && currentState.val === definition.value) {
      return 0;
    }
    await this.adapter.setStateAsync(id, definition.value, true);
    return 1;
  }
  getStateDefinition(value, requestedWrite, forcedRole) {
    if (forcedRole === "json") {
      return {
        type: "string",
        role: "json",
        value: typeof value === "string" ? value : JSON.stringify(value),
        write: false
      };
    }
    if (typeof value === "boolean") {
      return {
        type: "boolean",
        role: requestedWrite ? "switch" : "indicator",
        value,
        write: requestedWrite
      };
    }
    if (typeof value === "number") {
      return {
        type: "number",
        role: requestedWrite ? "level" : "value",
        value,
        write: requestedWrite
      };
    }
    if (typeof value === "string") {
      return {
        type: "string",
        role: "text",
        value,
        write: requestedWrite
      };
    }
    if (value === null || value === void 0) {
      return {
        type: "string",
        role: "json",
        value: "null",
        write: false
      };
    }
    return {
      type: "string",
      role: "json",
      value: JSON.stringify(value),
      write: false
    };
  }
  findMetadata(cloudPath) {
    const normalized = cloudPath.join(".");
    return METADATA_RULES.find(
      (rule) => rule.pattern.test(normalized)
    );
  }
  humanizeKey(key) {
    const result = key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
    return result ? result.charAt(0).toUpperCase() + result.slice(1) : "Unnamed";
  }
  sanitizeIdPart(value) {
    const sanitized = value.trim().replace(/[.\s*,;'"`<>\\?[\]{}=+~!#$%^&()|/]+/g, "_").replace(/^_+|_+$/g, "");
    return sanitized || "unnamed";
  }
  isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PoolStateWriter
});
//# sourceMappingURL=poolStateWriter.js.map
