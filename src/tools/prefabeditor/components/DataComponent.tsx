import type { Component } from "./ComponentRegistry";

export type DataComponentProperties = {
    data?: Record<string, unknown>;
};

const DataComponent: Component<DataComponentProperties> = {
    name: 'Data',
    slot: 'data',
    properties: {
        data: { type: 'object', default: {} },
    },
};

export default DataComponent;
