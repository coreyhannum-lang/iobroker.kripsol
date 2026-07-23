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
    const user = await this.getDocument(
      `users/${encodeURIComponent(tokens.userId)}`
    );
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
  async updatePoolField(poolId, fieldPath, value) {
    var _a, _b, _c, _d;
    if (fieldPath.length === 0) {
      throw new KripsolCloudError("Cloud field path is empty.");
    }
    const tokens = await this.auth.getValidTokens();
    const firestorePath = fieldPath.map((part) => this.escapeFieldPathPart(part)).join(".");
    const query = new URLSearchParams();
    query.append("updateMask.fieldPaths", firestorePath);
    const nestedFields = this.buildNestedFields(
      fieldPath,
      this.encodeValue(value)
    );
    const response = await fetch(
      `${FIRESTORE_BASE}/pools/${encodeURIComponent(poolId)}?${query.toString()}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${tokens.idToken}`,
          Accept: "application/json",
          "Content-Type": "application/json; charset=UTF-8"
        },
        body: JSON.stringify({
          fields: nestedFields
        })
      }
    );
    if (!response.ok) {
      const text = await response.text();
      let message = text;
      try {
        const payload = JSON.parse(text);
        message = (_d = (_c = (_a = payload.error) == null ? void 0 : _a.message) != null ? _c : (_b = payload.error) == null ? void 0 : _b.status) != null ? _d : text;
      } catch {
      }
      throw new KripsolCloudError(
        `Cloud write failed for ${firestorePath} (HTTP ${response.status}): ${message || "Unknown error"}`
      );
    }
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
  buildNestedFields(path, leafValue) {
    const [head, ...tail] = path;
    if (!head) {
      return {};
    }
    if (tail.length === 0) {
      return {
        [head]: leafValue
      };
    }
    return {
      [head]: {
        mapValue: {
          fields: this.buildNestedFields(tail, leafValue)
        }
      }
    };
  }
  encodeValue(value) {
    if (value === null) {
      return { nullValue: null };
    }
    if (typeof value === "boolean") {
      return { booleanValue: value };
    }
    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return { integerValue: String(value) };
      }
      return { doubleValue: value };
    }
    if (typeof value === "string") {
      return { stringValue: value };
    }
    throw new KripsolCloudError(
      `Unsupported cloud value type: ${typeof value}`
    );
  }
  escapeFieldPathPart(part) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)) {
      return part;
    }
    return `\`${part.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
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
    return value.filter(
      (item) => typeof item === "string"
    );
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
