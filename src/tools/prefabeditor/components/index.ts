import AmbientLightComponent from "./AmbientLightComponent";
import BufferGeometryComponent from "./BufferGeometryComponent";
import CameraComponent from "./CameraComponent";
import DataComponent from "./DataComponent";
import DirectionalLightComponent from "./DirectionalLightComponent";
import EnvironmentComponent from "./EnvironmentComponent";
import GeometryComponent from "./GeometryComponent";
import MaterialComponent, { MaterialRuntimeProvider } from "./MaterialComponent";
import MeshComponent from "./MeshComponent";
import MergedMeshComponent from "./MergedMeshComponent";
import ModelComponent from "./ModelComponent";
import PointLightComponent from "./PointLightComponent";
import PrefabRefComponent from "./PrefabRefComponent";
import SoundComponent from "./SoundComponent";
import SpotLightComponent from "./SpotLightComponent";
import SpriteComponent from "./SpriteComponent";
import TextComponent from "./TextComponent";
import TransformComponent from "./TransformComponent";
import { AudioRuntimeProvider } from "../AudioRuntime";
import { registerRuntimeWrapper } from "../RuntimeWrapperRegistry";
import { registerComponent } from "./ComponentRegistry";
import type { Component } from "./ComponentRegistry";

// This order controls how components are displayed in the editor.
const builtInComponents: Component<any>[] = [
	TransformComponent,
	MeshComponent,
	MergedMeshComponent,

	// Geometry components
	GeometryComponent,
	BufferGeometryComponent,
	ModelComponent,
	SpriteComponent,
	TextComponent,

	// Material components
	MaterialComponent,

	// Light components
	SpotLightComponent,
	PointLightComponent,
	DirectionalLightComponent,
	AmbientLightComponent,

	// Other components
	EnvironmentComponent,
	CameraComponent,
	SoundComponent,
	DataComponent,
	PrefabRefComponent,
];

builtInComponents.forEach(registerComponent);
registerRuntimeWrapper(MaterialRuntimeProvider);
registerRuntimeWrapper(AudioRuntimeProvider);
