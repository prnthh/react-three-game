import type { Component } from "../../core/ComponentRegistry.js";

export type DataComponentProperties = {
    data?: Record<string, unknown>;
};

const DataComponent: Component<DataComponentProperties> = {
    name: 'Data',
    description: "Store application-defined JSON on this node. Does not run code; use Runtime.data for inputs to a Runtime script.",
    slot: 'data',
    properties: {
        data: { type: 'object', default: {} },
    },
};

export default DataComponent;
