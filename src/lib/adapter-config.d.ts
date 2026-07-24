/**
 * ioBroker adapter configuration.
 */
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            username: string;
            password: string;
            pollingInterval: number;
        }
    }
}

export {};
