export interface FieldDefinition {
    ioPath: string;
    name: string;
    type: ioBroker.CommonType;
    role: string;
    write: boolean;
    unit?: string;
    states?: Record<string, string>;
    booleanNumeric?: boolean;
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
};

export function getFieldDefinition(
    cloudPath: string[],
): FieldDefinition | undefined {
    return FIELD_DEFINITIONS[cloudPath.join(".")];
}
