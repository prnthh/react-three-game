import type { Component } from "../../core/ComponentRegistry.js";

export type DataComponentProperties = {
    data?: Record<string, unknown>;
};

const DataComponent: Component<DataComponentProperties> = {
    name: 'Data',
    category: 'misc',
    description: "Store application-defined JSON on this node. Does not run code; use Runtime.data for inputs to a Runtime script.",
    properties: {
        data: { type: 'object', default: {} },
    },
};

export default DataComponent;
