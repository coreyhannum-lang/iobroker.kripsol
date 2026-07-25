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
var fieldDefinitions_exports = {};
__export(fieldDefinitions_exports, {
  FIELD_DEFINITIONS: () => FIELD_DEFINITIONS,
  getFieldDefinition: () => getFieldDefinition
});
module.exports = __toCommonJS(fieldDefinitions_exports);
const FIELD_DEFINITIONS = {
  "filtration.status": {
    ioPath: "Filtration.status",
    name: "Filtration",
    type: "boolean",
    role: "switch",
    write: true,
    booleanNumeric: true
  },
  "filtration.mode": {
    ioPath: "Filtration.mode",
    name: "Betriebsart",
    type: "number",
    role: "level",
    write: true,
    states: {
      "0": "Manuell",
      "1": "Automatik",
      "2": "Heizung",
      "3": "Smart",
      "4": "Intelligent"
    }
  },
  "filtration.manVel": {
    ioPath: "Filtration.manualSpeed",
    name: "Manuelle Pumpenstufe",
    type: "number",
    role: "level",
    write: true,
    states: {
      "0": "Langsam",
      "1": "Mittel",
      "2": "Schnell"
    }
  },
  "modules.ph.current": {
    ioPath: "Wasserwerte.pH.Istwert",
    name: "pH-Istwert",
    type: "number",
    role: "value",
    write: false,
    unit: "pH",
    factor: 0.01
  },
  "modules.ph.status.high_value": {
    ioPath: "Wasserwerte.pH.Sollwert",
    name: "pH-Sollwert",
    type: "number",
    role: "level",
    write: false,
    unit: "pH",
    factor: 0.01
  },
  "modules.rx.current": {
    ioPath: "Wasserwerte.Redox.Istwert",
    name: "Redox-Istwert",
    type: "number",
    role: "value",
    write: false,
    unit: "mV"
  },
  "modules.rx.status.value": {
    ioPath: "Wasserwerte.Redox.Sollwert",
    name: "Redox-Sollwert",
    type: "number",
    role: "level",
    write: false,
    unit: "mV"
  }
};
function getFieldDefinition(cloudPath) {
  return FIELD_DEFINITIONS[cloudPath.join(".")];
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FIELD_DEFINITIONS,
  getFieldDefinition
});
//# sourceMappingURL=fieldDefinitions.js.map
