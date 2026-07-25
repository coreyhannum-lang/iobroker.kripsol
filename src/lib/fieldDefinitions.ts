export interface FieldDefinition {
    ioPath: string;
    name: string;
    type: ioBroker.CommonType;
    role: string;
    write: boolean;
    unit?: string;
    states?: Record<string, string>;
    booleanNumeric?: boolean;
    factor?: number;
}

export const FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
    "filtration.status": {
        ioPath: "Filtration.status",
        name: "Filtration",
        type: "boolean",
        role: "switch",
        write: true,
        booleanNumeric: true,
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
            "4": "Intelligent",
        },
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
            "2": "Schnell",
        },
    },
    "modules.ph.current": {
        ioPath: "Wasserwerte.pH.Istwert",
        name: "pH-Istwert",
        type: "number",
        role: "value",
        write: false,
        unit: "pH",
        factor: 0.01,
    },
    "modules.ph.status.high_value": {
        ioPath: "Wasserwerte.pH.Sollwert",
        name: "pH-Sollwert",
        type: "number",
        role: "level",
        write: false,
        unit: "pH",
        factor: 0.01,
    },
    "modules.rx.current": {
        ioPath: "Wasserwerte.Redox.Istwert",
        name: "Redox-Istwert",
        type: "number",
        role: "value",
        write: false,
        unit: "mV",
    },
    "modules.rx.status.value": {
        ioPath: "Wasserwerte.Redox.Sollwert",
        name: "Redox-Sollwert",
        type: "number",
        role: "level",
        write: false,
        unit: "mV",
    },
};

export function getFieldDefinition(
    cloudPath: string[],
): FieldDefinition | undefined {
    return FIELD_DEFINITIONS[cloudPath.join(".")];
}
