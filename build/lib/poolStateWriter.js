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
  { pattern: /(^|\.)(water|pool).*(temp|temperature)$|(^|\.)(temp|temperature).*(water|pool)$/i, name: "Water temperature", role: "value.temperature", unit: "\xB0C" },
  { pattern: /(^|\.)(air|ambient).*(temp|temperature)$|(^|\.)(temp|temperature).*(air|ambient)$/i, name: "Air temperature", role: "value.temperature", unit: "\xB0C" },
  { pattern: /(^|\.)(temp|temperature)$/i, name: "Temperature", role: "value.temperature", unit: "\xB0C" },
  { pattern: /(^|\.)(ph|phvalue|ph_value)$/i, name: "pH value", role: "value", unit: "pH" },
  { pattern: /(^|\.)(orp|redox|rx)$/i, name: "Redox potential", role: "value", unit: "mV" },
  { pattern: /(^|\.)(salinity|salt|saltlevel|salt_level)$/i, name: "Salinity", role: "value", unit: "g/l" },
  { pattern: /(^|\.)(conductivity|ec)$/i, name: "Conductivity", role: "value", unit: "\xB5S/cm" },
  { pattern: /(^|\.)(flow|flowrate|flow_rate)$/i, name: "Flow rate", role: "value", unit: "l/min" },
  { pattern: /(^|\.)(pressure)$/i, name: "Pressure", role: "value.pressure", unit: "bar" },
  { pattern: /(^|\.)(runtime|duration|time|timer|minutes|min)$/i, name: "Runtime", role: "value.interval", unit: "min" },
  { pattern: /(^|\.)(speed|rpm)$/i, name: "Speed", role: "value", unit: "rpm" },
  { pattern: /(^|\.)(percent|percentage|level|power)$/i, name: "Level", role: "value", unit: "%" },
  { pattern: /(^|\.)(enabled|active|running|present|online|connected)$/i, name: "Active", role: "indicator" },
  { pattern: /(^|\.)(alarm|error|fault)$/i, name: "Error", role: "indicator.alarm" },
  { pattern: /(^|\.)(light|lights)$/i, name: "Pool light", role: "switch" },
  { pattern: /(^|\.)(filtration|filter|pump)$/i, name: "Filtration", role: "switch" },
  { pattern: /(^|\.)(backwash)$/i, name: "Backwash", role: "switch" }
];
class PoolStateWriter {
  constructor(adapter) {
    this.adapter = adapter;
  }
  async writePool(pool, poolData) {
    const poolId = this.sanitizeIdPart(pool.id);
    const poolRoot = `pools.${poolId}`;
    await this.ensureChannel("pools", "Pools");
    await this.ensureChannel(poolRoot, pool.name);
    let stateCount = 0;
    await this.writeState(`${poolRoot}.name`, "Pool name", pool.name);
    stateCount++;
    await this.writeState(`${poolRoot}.cloudId`, "Cloud pool ID", pool.id);
    stateCount++;
    const dataRoot = `${poolRoot}.data`;
    await this.ensureChannel(dataRoot, "Cloud data");
    stateCount += await this.writeValue(dataRoot, poolData);
    return stateCount;
  }
  async writeValue(path, value) {
    if (this.isRecord(value)) {
      let count = 0;
      for (const [key, childValue] of Object.entries(value)) {
        const childId = this.sanitizeIdPart(key);
        const childPath = `${path}.${childId}`;
        if (this.isRecord(childValue)) {
          await this.ensureChannel(childPath, this.humanizeKey(key));
          count += await this.writeValue(childPath, childValue);
          continue;
        }
        if (Array.isArray(childValue)) {
          await this.writeState(childPath, this.humanizeKey(key), JSON.stringify(childValue), "json");
          count++;
          continue;
        }
        await this.writeState(childPath, this.humanizeKey(key), childValue);
        count++;
      }
      return count;
    }
    await this.writeState(path, this.humanizeKey(this.getLastPathPart(path)), value);
    return 1;
  }
  async ensureChannel(id, name) {
    await this.adapter.extendObjectAsync(id, {
      type: "channel",
      common: { name },
      native: {}
    });
  }
  async writeState(id, fallbackName, value, forcedRole) {
    var _a, _b, _c;
    const definition = this.getStateDefinition(id, value, forcedRole);
    const metadata = this.findMetadata(id);
    await this.adapter.extendObjectAsync(id, {
      type: "state",
      common: {
        name: (_a = metadata == null ? void 0 : metadata.name) != null ? _a : fallbackName,
        type: definition.type,
        role: (_b = metadata == null ? void 0 : metadata.role) != null ? _b : definition.role,
        unit: (_c = metadata == null ? void 0 : metadata.unit) != null ? _c : definition.unit,
        read: true,
        write: false
      },
      native: {}
    });
    await this.adapter.setStateAsync(id, definition.value, true);
  }
  getStateDefinition(id, value, forcedRole) {
    var _a, _b;
    if (forcedRole === "json") {
      return {
        type: "string",
        role: "json",
        value: typeof value === "string" ? value : JSON.stringify(value)
      };
    }
    if (typeof value === "boolean") {
      return {
        type: "boolean",
        role: (_b = (_a = this.findMetadata(id)) == null ? void 0 : _a.role) != null ? _b : "indicator",
        value
      };
    }
    if (typeof value === "number") {
      return { type: "number", role: "value", value };
    }
    if (typeof value === "string") {
      return { type: "string", role: "text", value };
    }
    if (value === null || value === void 0) {
      return { type: "string", role: "json", value: "null" };
    }
    return { type: "string", role: "json", value: JSON.stringify(value) };
  }
  findMetadata(id) {
    const normalized = id.replace(/^pools\.[^.]+\.data\./, "");
    return METADATA_RULES.find((rule) => rule.pattern.test(normalized));
  }
  humanizeKey(key) {
    const result = key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
    return result ? result.charAt(0).toUpperCase() + result.slice(1) : "Unnamed";
  }
  sanitizeIdPart(value) {
    const sanitized = value.trim().replace(/[.\s*,;'"`<>\\?[\]{}=+~!#$%^&()|/]+/g, "_").replace(/^_+|_+$/g, "");
    return sanitized || "unnamed";
  }
  getLastPathPart(path) {
    var _a;
    return (_a = path.split(".").at(-1)) != null ? _a : path;
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
