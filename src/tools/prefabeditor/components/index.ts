// biome-ignore assist/source/organizeImports: <in order of display in the editor>
import TransformComponent from "./TransformComponent";
import PrefabRefComponent from "./PrefabRefComponent";
import MeshComponent from "./MeshComponent";
import GeometryComponent from "./GeometryComponent";
import BufferGeometryComponent from "./BufferGeometryComponent";
import ModelComponent from "./ModelComponent";
import SpriteComponent from "./SpriteComponent";
import TextComponent from "./TextComponent";
import MaterialComponent from "./MaterialComponent";
import SpotLightComponent from "./SpotLightComponent";
import PointLightComponent from "./PointLightComponent";
import DirectionalLightComponent from "./DirectionalLightComponent";
import AmbientLightComponent from "./AmbientLightComponent";
import EnvironmentComponent from "./EnvironmentComponent";
import CameraComponent from "./CameraComponent";
import SoundComponent from "./SoundComponent";
import DataComponent from "./DataComponent";
import { getComponentDef, registerComponent } from "./ComponentRegistry";
import type { Component } from "./ComponentRegistry";

// this controls the order of components in the editor, and also which components are available to add
export const builtinComponents: Component<any>[] = [
	TransformComponent,
	MeshComponent,

	// geometry components
	GeometryComponent,
	BufferGeometryComponent,
	ModelComponent,
	SpriteComponent,
	TextComponent,

	// material components
	MaterialComponent,

	// light components
	SpotLightComponent,
	PointLightComponent,
	DirectionalLightComponent,
	AmbientLightComponent,

	// other components
	EnvironmentComponent,
	CameraComponent,
	SoundComponent,
	DataComponent,
	PrefabRefComponent,
];

let didRegisterRuntimeComponents = false;
let didRegisterEditorComponents = false;

export function registerBuiltinComponents() {
	if (didRegisterRuntimeComponents) return;
	builtinComponents.forEach(component => {
		if (getComponentDef(component.name)) return;
		registerComponent({
			name: component.name,
			attachment: component.attachment,
			disableSiblingComposition: component.disableSiblingComposition,
			defaultProperties: component.defaultProperties,
			View: component.View,
			getAssetRefs: component.getAssetRefs,
		});
	});
	didRegisterRuntimeComponents = true;
}

export function registerBuiltinComponentEditors() {
	if (didRegisterEditorComponents) return;
	builtinComponents.forEach(registerComponent);
	didRegisterEditorComponents = true;
}
