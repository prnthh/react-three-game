import { FieldRenderer } from "react-three-game/editor";
import type { ComponentEditorProps, FieldDefinition } from "react-three-game/editor";
import { AdvancingTargetProperties } from "./AdvancingTargetComponent";

const advancingTargetFields = [
    { name: "speed", type: "number", label: "Speed", min: 0, step: 0.1 },
    { name: "resetZ", type: "number", label: "Reset Z", step: 0.5 },
    { name: "breachZ", type: "number", label: "Breach Z", step: 0.5 },
    { name: "idleColor", type: "color", label: "Idle Color" },
    { name: "hitColor", type: "color", label: "Hit Color" },
    { name: "hitEventName", type: "string", label: "Hit Event" },
    { name: "breachEventName", type: "string", label: "Breach Event" },
] satisfies FieldDefinition<AdvancingTargetProperties>[];

function AdvancingTargetEditor({ properties, update }: ComponentEditorProps<AdvancingTargetProperties>) {
    return <FieldRenderer fields={advancingTargetFields} values={properties} onChange={update} />;
}

export default AdvancingTargetEditor;
