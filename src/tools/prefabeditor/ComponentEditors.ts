import type { FC } from "react";
import type { Component, ComponentEditorProps } from "./components/ComponentRegistry";

const editors = new Map<string, FC<ComponentEditorProps<any>>>();

/** Register inspector UI separately so exported games never import it. */
export function registerComponentEditor<P extends object>(component: Component<P>, Editor: FC<ComponentEditorProps<P>>) {
    editors.set(component.name, Editor);
}

export function getComponentEditor(name: string) {
    return editors.get(name);
}
