export {
    CrashcatRuntime,
    useCrashcat,
    type BodyMeta,
    type CrashcatApi,
    type CrashcatEventConfig,
} from "./CrashcatRuntime.js";
export {
    default as CrashcatPhysicsComponent,
    RIGID_BODY_COMPONENT,
    default,
} from "./CrashcatPhysicsComponent.js";
export {
    CrashcatRagdoll,
    default as CrashcatRagdollComponent,
    RagdollBodyPart,
    createRagdollSettings,
    createStaticBoxBody,
    type CrashcatRagdollProps,
    type RagdollSettings,
} from "./CrashcatRagdoll.js";

export { importCollisionModel } from "./importCollisionModel.js";

export { TerrainPhysicsComponent, TERRAIN_PHYSICS_COMPONENT, terrainPhysicsProblem } from './TerrainPhysicsComponent.js';
export { getTerrainPhysicsStatus } from './TerrainPhysicsRuntime.js';
export { CharacterControllerComponent } from './CharacterControllerComponent.js';

export { createColliderResidencyScheduler, type ColliderResidencyTarget } from './colliderResidency.js';
