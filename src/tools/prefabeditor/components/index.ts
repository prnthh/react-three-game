import AmbientLightComponent from "./AmbientLightComponent";
import BufferGeometryComponent from "./BufferGeometryComponent";
import CameraComponent from "./CameraComponent";
import DataComponent from "./DataComponent";
import DirectionalLightComponent from "./DirectionalLightComponent";
import EnvironmentComponent from "./EnvironmentComponent";
import GeometryComponent from "./GeometryComponent";
import InteriorMapComponent from "./InteriorMapComponent";
import MaterialComponent from "./MaterialComponent";
import MeshComponent from "./MeshComponent";
import ModelComponent from "./ModelComponent";
import PointLightComponent from "./PointLightComponent";
import PrefabRefComponent from "./PrefabRefComponent";
import SoundComponent from "./SoundComponent";
import AnimatedModelComponent from "./AnimatedModelComponent";
import SpotLightComponent from "./SpotLightComponent";
import SpriteComponent from "./SpriteComponent";
import TextComponent from "./TextComponent";
import TransformComponent from "./TransformComponent";
import { registerComponent } from "./ComponentRegistry";
import type { Component } from "./ComponentRegistry";

// This order controls how components are displayed in the editor.
const builtInComponents: Component<any>[] = [
	TransformComponent,
	MeshComponent,

	// Geometry components
	GeometryComponent,
	BufferGeometryComponent,
	ModelComponent,
	AnimatedModelComponent,
	SpriteComponent,
	TextComponent,

	// Material components
	MaterialComponent,
	InteriorMapComponent,

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
