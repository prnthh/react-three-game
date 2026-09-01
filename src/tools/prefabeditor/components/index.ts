import AmbientLightComponent from "./AmbientLightComponent";
import BufferGeometryComponent from "./BufferGeometryComponent";
import CameraComponent from "./CameraComponent";
import DataComponent from "./DataComponent";
import DirectionalLightComponent from "./DirectionalLightComponent";
import EnvironmentComponent from "./EnvironmentComponent";
import GeometryComponent from "./GeometryComponent";
import HemisphereLightComponent from "./HemisphereLightComponent";
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
import type { Component } from "./ComponentRegistry";

// GameCanvas installs these for its lifetime. This order controls their editor display.
export const builtInComponents: readonly Component<any>[] = [
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

	// Light components
	SpotLightComponent,
	PointLightComponent,
	DirectionalLightComponent,
	HemisphereLightComponent,
	AmbientLightComponent,

	// Other components
	EnvironmentComponent,
	CameraComponent,
	SoundComponent,
	DataComponent,
	PrefabRefComponent,
];
