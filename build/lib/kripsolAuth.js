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
var kripsolAuth_exports = {};
__export(kripsolAuth_exports, {
  KripsolAuth: () => KripsolAuth,
  KripsolAuthenticationError: () => KripsolAuthenticationError
});
module.exports = __toCommonJS(kripsolAuth_exports);
const API_KEY = "AIzaSyBLaxiyZ2nS1KgRBqWe-NY4EG7OzG5fKpE";
const IDENTITY_TOOLKIT_BASE = "https://identitytoolkit.googleapis.com/v1/accounts";
const SECURETOKEN_URL = "https://securetoken.googleapis.com/v1/token";
const API_REFERRER = "https://hayward-europe.web.app/";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1e3;
class KripsolAuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = "KripsolAuthenticationError";
  }
}
class KripsolAuth {
  constructor(email, password) {
    this.email = email;
    this.password = password;
  }
  tokens = null;
  expiresAt = 0;
  async authenticate() {
    const response = await fetch(
      `${IDENTITY_TOOLKIT_BASE}:signInWithPassword?key=${API_KEY}`,
      {
        method: "POST",
        headers: this.buildHeaders("application/json; charset=UTF-8"),
        body: JSON.stringify({
          email: this.email,
          password: this.password,
          returnSecureToken: true
        })
      }
    );
    const payload = await this.readJson(response);
    if (!response.ok) {
      throw new KripsolAuthenticationError(
        this.formatError(payload.error, response.status)
      );
    }
    const expiresIn = Number(payload.expiresIn);
    if (!payload.idToken || !payload.refreshToken || !payload.localId || !Number.isFinite(expiresIn)) {
      throw new KripsolAuthenticationError(
        "Unexpected authentication response from the Kripsol cloud."
      );
    }
    this.tokens = {
      idToken: payload.idToken,
      refreshToken: payload.refreshToken,
      expiresIn,
      userId: payload.localId
    };
    this.expiresAt = Date.now() + expiresIn * 1e3;
    return this.tokens;
  }
  async getValidTokens() {
    if (!this.tokens) {
      return this.authenticate();
    }
    if (Date.now() >= this.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
      await this.refresh();
    }
    return this.tokens;
  }
  get userId() {
    var _a, _b;
    return (_b = (_a = this.tokens) == null ? void 0 : _a.userId) != null ? _b : null;
  }
  async refresh() {
    var _a;
    if (!this.tokens) {
      await this.authenticate();
      return;
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.tokens.refreshToken
    });
    const response = await fetch(`${SECURETOKEN_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: this.buildHeaders(
        "application/x-www-form-urlencoded; charset=UTF-8"
      ),
      body
    });
    const payload = await this.readJson(response);
    if (!response.ok) {
      throw new KripsolAuthenticationError(
        this.formatError(payload.error, response.status)
      );
    }
    const expiresIn = Number(payload.expires_in);
    if (!payload.id_token || !payload.refresh_token || !Number.isFinite(expiresIn)) {
      throw new KripsolAuthenticationError(
        "Unexpected token refresh response from the Kripsol cloud."
      );
    }
    this.tokens = {
      idToken: payload.id_token,
      refreshToken: payload.refresh_token,
      expiresIn,
      userId: (_a = payload.user_id) != null ? _a : this.tokens.userId
    };
    this.expiresAt = Date.now() + expiresIn * 1e3;
  }
  buildHeaders(contentType) {
    return {
      "Content-Type": contentType,
      Referer: API_REFERRER,
      Origin: "https://hayward-europe.web.app"
    };
  }
  async readJson(response) {
    const text = await response.text();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new KripsolAuthenticationError(
        `Kripsol cloud returned invalid JSON (HTTP ${response.status}).`
      );
    }
  }
  formatError(error, httpStatus) {
    var _a, _b;
    const code = (_a = error == null ? void 0 : error.code) != null ? _a : httpStatus;
    const status = (error == null ? void 0 : error.status) ? `, status=${error.status}` : "";
    const message = (_b = error == null ? void 0 : error.message) != null ? _b : "Unknown error";
    return `Authentication failed (code=${code}${status}, message=${message}).`;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  KripsolAuth,
  KripsolAuthenticationError
});
//# sourceMappingURL=kripsolAuth.js.map
