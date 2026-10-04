import AmbientLightComponent from "./AmbientLightComponent.js";
import BufferGeometryComponent from "./BufferGeometryComponent.js";
import CameraFollowComponent from "./CameraFollowComponent.js";
import CameraComponent from "./CameraComponent.js";
import DataComponent from "./DataComponent.js";
import RuntimeComponent from "./RuntimeComponent.js";
import DirectionalLightComponent from "./DirectionalLightComponent.js";
import EnvironmentComponent from "./EnvironmentComponent.js";
import FogComponent from "./FogComponent.js";
import GeometryComponent from "./GeometryComponent.js";
import HemisphereLightComponent from "./HemisphereLightComponent.js";
import MaterialComponent from "./MaterialComponent.js";
import ModelComponent from "./ModelComponent.js";
import PointLightComponent from "./PointLightComponent.js";
import PrefabRefComponent from "./PrefabRefComponent.js";
import SoundComponent from "./SoundComponent.js";
import SkinnedMeshComponent from "./SkinnedMeshComponent.js";
import SpotLightComponent from "./SpotLightComponent.js";
import SpriteComponent from "./SpriteComponent.js";
import TextComponent from "./TextComponent.js";
import TransformComponent from "./TransformComponent.js";
import { registerBuiltInComponents as registerDefaults, type Component } from "../../core/ComponentRegistry.js";

// Built-in definitions; this order controls their editor display.
export const builtInComponents: readonly Component<any>[] = [
	TransformComponent,

	// Geometry components
	GeometryComponent,
	BufferGeometryComponent,
	ModelComponent,
	SkinnedMeshComponent,
	SpriteComponent,
	TextComponent,

	// Material components
	MaterialComponent,

	// Light components
	SpotLightComponent,
	PointLightComponent,
	DirectionalLightComponent,
	HemisphereLightComponent,
	AmbientLightComponent,

	// Other components
	EnvironmentComponent,
	FogComponent,
	CameraComponent,
	CameraFollowComponent,
	SoundComponent,
	DataComponent,
	RuntimeComponent,
	PrefabRefComponent,
];

/** Install built-in contracts without replacing already registered custom definitions. */
export function registerBuiltInComponents() {
    registerDefaults(builtInComponents);
}
