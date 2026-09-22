import { FieldRenderer } from "react-three-game/editor";
import type { ComponentEditorProps, FieldDefinition } from "react-three-game/editor";
import { IndustrialMachineGunProperties } from "./IndustrialMachineGunComponent";

const machineGunFields = [
    { name: "barrelId", type: "node", label: "Barrel" },
    { name: "fireRate", type: "number", label: "Fire Rate", min: 1, step: 1 },
    { name: "projectileSpeed", type: "number", label: "Projectile Speed", min: 1, step: 1 },
    { name: "projectileRadius", type: "number", label: "Projectile Radius", min: 0.02, step: 0.01 },
    { name: "projectileLifetime", type: "number", label: "Projectile Lifetime", min: 0.2, step: 0.1 },
    { name: "muzzleOffset", type: "number", label: "Muzzle Offset", step: 0.1 },
    { name: "muzzleFlashId", type: "node", label: "Muzzle Flash" },
    { name: "spread", type: "number", label: "Spread", min: 0, step: 0.001 },
    { name: "shotEventName", type: "string", label: "Shot Event" },
    { name: "triggerEventName", type: "string", label: "Trigger Event" },
    { name: "projectileCountEventName", type: "string", label: "Projectile Count Event" },
    { name: "aimYawRange", type: "number", label: "Aim Yaw Range", min: 0, step: 0.01 },
    { name: "aimPitchRange", type: "number", label: "Aim Pitch Range", min: 0, step: 0.01 },
    { name: "aimSmoothing", type: "number", label: "Aim Smoothing", min: 1, step: 0.5 },
    { name: "recoilKick", type: "number", label: "Recoil Kick", min: 0, step: 0.01 },
    { name: "recoilReturn", type: "number", label: "Recoil Return", min: 0.1, step: 0.1 },
    { name: "fireSound", type: "string", label: "Fire Sound" },
    { name: "fireVolume", type: "number", label: "Fire Volume", min: 0, max: 1, step: 0.05 },
] satisfies FieldDefinition<IndustrialMachineGunProperties>[];

function IndustrialMachineGunEditor({ properties, update }: ComponentEditorProps<IndustrialMachineGunProperties>) {
    return <FieldRenderer fields={machineGunFields} values={properties} onChange={update} />;
}

export default IndustrialMachineGunEditor;
