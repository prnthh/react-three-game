import { registerComponent } from "react-three-game/viewer";
import { CrashcatPhysicsComponent } from "react-three-game/plugins/crashcat";
import ActivationCollider from "./ActivationColliderComponent";
import StageInteraction from "./StageInteractionComponent";
import StageCameraFollow from "./StageCameraFollow";

registerComponent(CrashcatPhysicsComponent);
registerComponent(ActivationCollider);
registerComponent(StageInteraction);
registerComponent(StageCameraFollow);
