"use client";

import SceneRedirect from "./components/SceneRedirect";
import Walkable from "./components/Walkable";

import { useState } from "react";
import { GameCanvas, GameEventsProvider, PrefabRoot, registerComponent } from "react-three-game/viewer";
import { CrashcatPhysicsComponent, CrashcatRuntime } from "react-three-game/plugins/crashcat";
import { BASE_PATH } from "../../basePath";
import { games } from "./games";
import GameDriver, { useGameDriver } from "./components/GameDriver";
import OverlayHUD from "./components/OverlayHUD";
import CharacterDriver from "./components/CharacterDriver";
import InteractionDriver from "./components/InteractionDriver";
import InteractionCollider from "./components/InteractionCollider";
import ActivationCollider from "./components/ActivationColliderComponent";
import StageCameraFollow from "./components/StageCameraFollow";

registerComponent(CrashcatPhysicsComponent);
registerComponent(CharacterDriver);
registerComponent(InteractionDriver);
registerComponent(SceneRedirect);
registerComponent(Walkable);
registerComponent(InteractionCollider);
registerComponent(ActivationCollider);
registerComponent(StageCameraFollow);

function GameScene() {
    const game = useGameDriver();
    if (!game?.scene) return null;
    return <CrashcatRuntime key={game.sceneKey}>
        <PrefabRoot data={game.scene} basePath={BASE_PATH} />
    </CrashcatRuntime>;
}

export default function StageDemo() {
    const [game, setGame] = useState(games[0]);
    return <main className="relative h-screen w-screen overflow-hidden bg-black">
        <label className="absolute left-4 top-4 z-20 rounded bg-black/80 px-3 py-2 text-sm text-white">
            Game
            <select aria-label="Game" value={game.id} onChange={event => setGame(games.find(candidate => candidate.id === event.target.value)!)} className="ml-2 bg-zinc-900">
                {games.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
            </select>
        </label>
        <GameEventsProvider key={game.id}>
            <GameDriver rootFolder={game.rootFolder} basePath={BASE_PATH}>
                <OverlayHUD>
                    <GameCanvas><GameScene /></GameCanvas>
                </OverlayHUD>
            </GameDriver>
        </GameEventsProvider>
    </main>;
}
