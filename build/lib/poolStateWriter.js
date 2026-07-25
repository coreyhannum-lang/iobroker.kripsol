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
var import_fieldDefinitions = require("./fieldDefinitions");
class PoolStateWriter {
  constructor(adapter) {
    this.adapter = adapter;
  }
  async writePool(pool, poolData) {
    const poolId = this.sanitizeIdPart(pool.id);
    const poolRoot = `pools.${poolId}`;
    await this.ensureChannel("pools", "Pools");
    await this.ensureDevice(poolRoot, pool.name);
    await this.ensureChannel(`${poolRoot}.Allgemein`, "Allgemein");
    await this.ensureChannel(`${poolRoot}.Filtration`, "Filtration");
    await this.ensureChannel(`${poolRoot}.Wasserwerte`, "Wasserwerte");
    await this.ensureChannel(`${poolRoot}.Heizung`, "Heizung");
    await this.ensureChannel(`${poolRoot}.Beleuchtung`, "Beleuchtung");
    await this.ensureChannel(`${poolRoot}.Relais`, "Relais");
    await this.ensureChannel(`${poolRoot}.Zeitprogramme`, "Zeitprogramme");
    await this.ensureChannel(`${poolRoot}.Alarme`, "Alarme");
    await this.ensureChannel(`${poolRoot}.Wartung`, "Wartung");
    await this.ensureChannel(`${poolRoot}.Info`, "Info");
    await this.ensureChannel(`${poolRoot}.Unbenutzt`, "Unbenutzt");
    let changedStateCount = 0;
    changedStateCount += await this.writeState(
      `${poolRoot}.Allgemein.name`,
      "Poolname",
      pool.name,
      pool.id,
      ["name"],
      {
        ioPath: "Allgemein.name",
        name: "Poolname",
        type: "string",
        role: "text",
        write: false
      }
    );
    changedStateCount += await this.writeState(
      `${poolRoot}.Allgemein.cloudId`,
      "Cloud Pool ID",
      pool.id,
      pool.id,
      ["cloudId"],
      {
        ioPath: "Allgemein.cloudId",
        name: "Cloud Pool ID",
        type: "string",
        role: "text",
        write: false
      }
    );
    changedStateCount += await this.writeRecord(
      poolRoot,
      pool.id,
      poolData,
      []
    );
    return changedStateCount;
  }
  async ensurePoolInfoObjects(pool) {
    const poolRoot = `pools.${this.sanitizeIdPart(pool.id)}`;
    const infoRoot = `${poolRoot}.Info`;
    await this.ensureChannel("pools", "Pools");
    await this.ensureDevice(poolRoot, pool.name);
    await this.ensureChannel(infoRoot, "Info");
    await this.ensureInfoState(
      `${infoRoot}.pollingActive`,
      "Polling aktiv",
      "boolean",
      "indicator",
      false
    );
    await this.ensureInfoState(
      `${infoRoot}.lastPoll`,
      "Letztes Polling",
      "number",
      "value.time",
      0
    );
    await this.ensureInfoState(
      `${infoRoot}.lastSuccessfulPoll`,
      "Letztes erfolgreiches Polling",
      "number",
      "value.time",
      0
    );
    await this.ensureInfoState(
      `${infoRoot}.lastError`,
      "Letzter Polling-Fehler",
      "string",
      "text",
      ""
    );
    await this.ensureInfoState(
      `${infoRoot}.pollDuration`,
      "Pollingdauer",
      "number",
      "value.interval",
      0,
      "ms"
    );
  }
  async writeRecord(poolRoot, poolId, record, cloudPath) {
    var _a;
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
      const definition = (0, import_fieldDefinitions.getFieldDefinition)(nextCloudPath);
      const target = definition ? definition.ioPath : `Unbenutzt.${nextCloudPath.map((part) => this.sanitizeIdPart(part)).join(".")}`;
      const stateId = `${poolRoot}.${target}`;
      const fallbackName = (_a = definition == null ? void 0 : definition.name) != null ? _a : this.humanizeKey(key);
      changedStateCount += await this.writeState(
        stateId,
        fallbackName,
        Array.isArray(value) ? JSON.stringify(value) : value,
        poolId,
        nextCloudPath,
        definition,
        Array.isArray(value) ? "json" : void 0
      );
    }
    return changedStateCount;
  }
  async writeState(id, fallbackName, value, poolId, cloudPath, fieldDefinition, forcedRole) {
    var _a, _b;
    await this.ensureParentChannels(id);
    const definition = this.getStateDefinition(
      value,
      fieldDefinition,
      forcedRole
    );
    await this.adapter.extendObjectAsync(id, {
      type: "state",
      common: {
        name: (_a = fieldDefinition == null ? void 0 : fieldDefinition.name) != null ? _a : fallbackName,
        type: definition.type,
        role: definition.role,
        unit: definition.unit,
        states: definition.states,
        read: true,
        write: definition.write
      },
      native: {
        poolId,
        cloudPath,
        originalName: (_b = cloudPath[cloudPath.length - 1]) != null ? _b : ""
      }
    });
    const currentState = await this.adapter.getStateAsync(id);
    if ((currentState == null ? void 0 : currentState.val) === definition.value) {
      return 0;
    }
    await this.adapter.setStateAsync(id, definition.value, true);
    return 1;
  }
  getStateDefinition(value, fieldDefinition, forcedRole) {
    var _a;
    if (forcedRole === "json") {
      return {
        type: "string",
        role: "json",
        value: typeof value === "string" ? value : JSON.stringify(value),
        write: false
      };
    }
    if (fieldDefinition) {
      let convertedValue;
      if (fieldDefinition.booleanNumeric) {
        convertedValue = value === true || value === 1 || value === "1";
      } else if (fieldDefinition.type === "number") {
        const numericValue = Number(value);
        convertedValue = numericValue * ((_a = fieldDefinition.factor) != null ? _a : 1);
      } else if (fieldDefinition.type === "boolean") {
        convertedValue = Boolean(value);
      } else {
        convertedValue = typeof value === "string" ? value : JSON.stringify(value);
      }
      return {
        type: fieldDefinition.type,
        role: fieldDefinition.role,
        value: convertedValue,
        write: fieldDefinition.write,
        unit: fieldDefinition.unit,
        states: fieldDefinition.states
      };
    }
    if (typeof value === "boolean") {
      return {
        type: "boolean",
        role: "indicator",
        value,
        write: false
      };
    }
    if (typeof value === "number") {
      return {
        type: "number",
        role: "value",
        value,
        write: false
      };
    }
    if (typeof value === "string") {
      return {
        type: "string",
        role: "text",
        value,
        write: false
      };
    }
    return {
      type: "string",
      role: "json",
      value: JSON.stringify(value != null ? value : null),
      write: false
    };
  }
  async ensureInfoState(id, name, type, role, def, unit) {
    await this.adapter.extendObjectAsync(id, {
      type: "state",
      common: {
        name,
        type,
        role,
        read: true,
        write: false,
        def,
        unit
      },
      native: {}
    });
  }
  async ensureParentChannels(id) {
    const parts = id.split(".");
    for (let index = 1; index < parts.length - 1; index++) {
      const channelId = parts.slice(0, index + 1).join(".");
      await this.ensureChannel(
        channelId,
        this.humanizeKey(parts[index])
      );
    }
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
  humanizeKey(key) {
    const result = key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
    return result ? result.charAt(0).toUpperCase() + result.slice(1) : "Unbenannt";
  }
  sanitizeIdPart(value) {
    const sanitized = value.trim().replace(/[.\s*,;'"`<>\\?[\]{}=+~!#$%^&()|/]+/g, "_").replace(/^_+|_+$/g, "");
    return sanitized || "unbenannt";
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
