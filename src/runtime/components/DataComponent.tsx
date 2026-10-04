import type { Component } from "../../core/ComponentRegistry.js";

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
