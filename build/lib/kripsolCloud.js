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
var kripsolCloud_exports = {};
__export(kripsolCloud_exports, {
  KripsolCloud: () => KripsolCloud,
  KripsolCloudError: () => KripsolCloudError
});
module.exports = __toCommonJS(kripsolCloud_exports);
const FIRESTORE_PROJECT = "hayward-europe";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents`;
class KripsolCloudError extends Error {
  constructor(message) {
    super(message);
    this.name = "KripsolCloudError";
  }
}
class KripsolCloud {
  constructor(auth) {
    this.auth = auth;
  }
  async getPools() {
    const tokens = await this.auth.getValidTokens();
    const user = await this.getDocument(`users/${encodeURIComponent(tokens.userId)}`);
    const poolIds = this.readStringArray(user, "pools");
    const pools = [];
    for (const poolId of poolIds) {
      const poolDocument = await this.getDocument(
        `pools/${encodeURIComponent(poolId)}`
      );
      pools.push({
        id: poolId,
        name: this.getPoolName(poolDocument)
      });
    }
    return pools;
  }
  async fetchPoolData(poolId) {
    return this.getDocument(`pools/${encodeURIComponent(poolId)}`);
  }
  async getDocument(path) {
    var _a, _b, _c;
    const tokens = await this.auth.getValidTokens();
    const response = await fetch(`${FIRESTORE_BASE}/${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokens.idToken}`,
        Accept: "application/json"
      }
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new KripsolCloudError(
        `Firestore returned invalid JSON for ${path} (HTTP ${response.status}).`
      );
    }
    if (!response.ok) {
      const error = payload.error;
      throw new KripsolCloudError(
        `Firestore request failed for ${path} (HTTP ${response.status}, ${(_a = error == null ? void 0 : error.status) != null ? _a : "UNKNOWN"}): ${(_b = error == null ? void 0 : error.message) != null ? _b : "Unknown error"}`
      );
    }
    const document = payload;
    return this.decodeFields((_c = document.fields) != null ? _c : {});
  }
  decodeFields(fields) {
    const result = {};
    for (const [key, value] of Object.entries(fields)) {
      result[key] = this.decodeValue(value);
    }
    return result;
  }
  decodeValue(value) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if ("nullValue" in value) {
      return null;
    }
    if ("booleanValue" in value) {
      return value.booleanValue;
    }
    if ("integerValue" in value) {
      return Number(value.integerValue);
    }
    if ("doubleValue" in value) {
      return value.doubleValue;
    }
    if ("timestampValue" in value) {
      return value.timestampValue;
    }
    if ("stringValue" in value) {
      return value.stringValue;
    }
    if ("bytesValue" in value) {
      return value.bytesValue;
    }
    if ("referenceValue" in value) {
      return value.referenceValue;
    }
    if ("geoPointValue" in value) {
      return {
        latitude: (_b = (_a = value.geoPointValue) == null ? void 0 : _a.latitude) != null ? _b : 0,
        longitude: (_d = (_c = value.geoPointValue) == null ? void 0 : _c.longitude) != null ? _d : 0
      };
    }
    if ("arrayValue" in value) {
      return ((_f = (_e = value.arrayValue) == null ? void 0 : _e.values) != null ? _f : []).map(
        (item) => this.decodeValue(item)
      );
    }
    if ("mapValue" in value) {
      return this.decodeFields((_h = (_g = value.mapValue) == null ? void 0 : _g.fields) != null ? _h : {});
    }
    return null;
  }
  readStringArray(source, key) {
    const value = source[key];
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item) => typeof item === "string");
  }
  getPoolName(pool) {
    const form = this.asRecord(pool.form);
    if (!form) {
      return "Unknown";
    }
    const names = form.names;
    if (Array.isArray(names) && names.length > 0) {
      const firstName = this.asRecord(names[0]);
      const localizedName = firstName == null ? void 0 : firstName.name;
      if (typeof localizedName === "string" && localizedName.trim()) {
        return localizedName.trim();
      }
    }
    if (typeof form.name === "string" && form.name.trim()) {
      return form.name.trim();
    }
    return "Unknown";
  }
  asRecord(value) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value;
    }
    return null;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  KripsolCloud,
  KripsolCloudError
});
//# sourceMappingURL=kripsolCloud.js.map
