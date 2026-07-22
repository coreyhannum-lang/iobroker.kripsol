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
    await this.writeState(
      `${poolRoot}.name`,
      "Pool name",
      pool.name
    );
    stateCount++;
    await this.writeState(
      `${poolRoot}.cloudId`,
      "Cloud pool ID",
      pool.id
    );
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
          await this.ensureChannel(childPath, key);
          count += await this.writeValue(childPath, childValue);
          continue;
        }
        if (Array.isArray(childValue)) {
          await this.writeState(
            childPath,
            key,
            JSON.stringify(childValue),
            "json"
          );
          count++;
          continue;
        }
        await this.writeState(childPath, key, childValue);
        count++;
      }
      return count;
    }
    await this.writeState(path, this.getLastPathPart(path), value);
    return 1;
  }
  async ensureChannel(id, name) {
    await this.adapter.extendObjectAsync(id, {
      type: "channel",
      common: {
        name
      },
      native: {}
    });
  }
  async writeState(id, name, value, forcedRole) {
    const definition = this.getStateDefinition(value, forcedRole);
    await this.adapter.extendObjectAsync(id, {
      type: "state",
      common: {
        name,
        type: definition.type,
        role: definition.role,
        read: true,
        write: false
      },
      native: {}
    });
    await this.adapter.setStateAsync(id, definition.value, true);
  }
  getStateDefinition(value, forcedRole) {
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
        role: "value",
        value
      };
    }
    if (typeof value === "number") {
      return {
        type: "number",
        role: "value",
        value
      };
    }
    if (typeof value === "string") {
      return {
        type: "string",
        role: "text",
        value
      };
    }
    if (value === null || value === void 0) {
      return {
        type: "string",
        role: "json",
        value: JSON.stringify(value != null ? value : null)
      };
    }
    return {
      type: "string",
      role: "json",
      value: JSON.stringify(value)
    };
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
