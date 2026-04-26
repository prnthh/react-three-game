// biome-ignore assist/source/organizeImports: <in order of display in the editor>
import TransformComponent from "./TransformComponent";
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

// this controls the order of components in the editor, and also which components are available to add
export const builtinComponents = [
	TransformComponent,

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
];
