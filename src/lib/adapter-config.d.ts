// This file extends the AdapterConfig type from "@iobroker/types"

declare global {
    namespace ioBroker {
        interface AdapterConfig {
            username: string;
            password: string;
        }
    }
}

export {};
