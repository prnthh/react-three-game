"use client";
import { blocks } from "./shared/world";
import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { ACESFilmicToneMapping, Group } from "three";
import { idleCommand, LIMIT, HEALTH_RULES } from "./shared/protocol";
import { KillcamSession } from "./session";
import { SpatialAudio } from "./audio";
import { useLoader } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GameCanvas, PrefabRoot, registerComponent } from "react-three-game/viewer";
import { BASE_PATH, withBasePath } from "../../basePath";
import { asset, animationURLs } from "./assets";
import { relayYardScene } from "./scene";
import { TouchControls } from "./components/TouchControls";
import { CharacterComponent } from "./components/CharacterComponent";
import { PlayerControllerComponent } from "./components/PlayerControllerComponent";
import { SpawnPointComponent } from "./components/SpawnPointComponent";
import { SessionContext, SessionDriver, RendererLighting, WorldAudio, MatchManagerComponent, type FPSSession } from "./components/SessionSystems";
import { CombatEffects, GrenadeEffects, MuzzleContext } from "./components/CombatEffects";

import "./style.css";

registerComponent(MatchManagerComponent);
registerComponent(PlayerControllerComponent);
registerComponent(CharacterComponent);
registerComponent(SpawnPointComponent);

export default function FPSPage() {
  const [runtime, setRuntime] = useState(() => new KillcamSession()),
    [playing, setPlaying] = useState(false),
    [started, setStarted] = useState(false),
    [frame, setFrame] = useState(0),
    [touchControls, setTouchControls] = useState(false),
    [ready, setReady] = useState(false);
  const match = runtime.state;
  const liveMatch = runtime.liveState;
  const [audio] = useState(() => new SpatialAudio());
  const enableAudio = () => audio.enable();
  useEffect(() => () => audio.dispose(), [audio]);
  useEffect(() => { if (!playing) audio.stop(); }, [playing, audio]);
  const onReady = useCallback(() => setReady(true), []);
  const active = useRef(false),
    dragLook = useRef(false);
  active.current = playing;
  const touchMode = useRef(false);
  touchMode.current = touchControls;
  useEffect(() => { setTouchControls(window.matchMedia("(pointer: coarse)").matches); }, []);
  const host = useRef<HTMLDivElement>(null),
    input = useRef(idleCommand()),
    keys = useRef(new Set<string>());
  useEffect(() => {
    Object.assign(input.current, idleCommand());
    input.current.yaw = runtime.liveState.actors[0].yaw;
    input.current.pitch = runtime.liveState.actors[0].pitch;
  }, [runtime]);
  useEffect(() => {
    const clear = () => {
      keys.current.clear();
      Object.assign(input.current, {
        forward: 0,
        right: 0,
        fire: false,
        sprint: false,
        aim: false,
        reload: false,
        jump: false, crouch: false, grenade: false,
      });
    };
    const sync = () => {
      const k = keys.current;
      input.current.forward = Number(k.has("KeyW")) - Number(k.has("KeyS"));
      input.current.right = Number(k.has("KeyD")) - Number(k.has("KeyA"));
      input.current.sprint = k.has("ShiftLeft");
      input.current.crouch = k.has("KeyC");
    };
    const key = (e: KeyboardEvent) => {
      if (!active.current) return;
      if (e.code === "Escape") {
        setPlaying(false);
        document.exitPointerLock();
        clear();
        return;
      }
      if (
        ["Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyR", "KeyC", "KeyG", "ShiftLeft"].includes(
          e.code,
        )
      )
        e.preventDefault();
      if (e.type === "keydown") {
        keys.current.add(e.code);
        if (e.code === "Space" && !e.repeat) input.current.jump = true;
        if (e.code === "KeyR" && !e.repeat) input.current.reload = true;
        if (e.code === "KeyG" && !e.repeat) input.current.grenade = true;
      } else keys.current.delete(e.code);
      sync();
    };
    const mouse = (e: MouseEvent) => {
      if (
        !active.current || touchMode.current ||
        (!document.pointerLockElement && (!dragLook.current || !e.buttons))
      )
        return;
      input.current.yaw -= e.movementX * 0.002;
      input.current.pitch = Math.max(
        -1.4,
        Math.min(1.4, input.current.pitch - e.movementY * 0.002),
      );
    };
    const button = (e: MouseEvent) => {
      if (!active.current || touchMode.current) return;
      if (e.type === "mousedown") audio.enable();
      if (e.button === 0) input.current.fire = e.type === "mousedown";
      if (e.button === 2) input.current.aim = e.type === "mousedown";
    };
    const lock = () => {
      if (!dragLook.current) setPlaying(!!document.pointerLockElement);
      clear();
    };
    const blur = () => {
      setPlaying(false);
      document.exitPointerLock();
      clear();
    };
    document.addEventListener("pointerlockchange", lock);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("mousemove", mouse);
    window.addEventListener("mousedown", button);
    window.addEventListener("mouseup", button);
    window.addEventListener("blur", blur);
    return () => {
      clear();
      document.exitPointerLock();
      document.removeEventListener("pointerlockchange", lock);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("mousemove", mouse);
      window.removeEventListener("mousedown", button);
      window.removeEventListener("mouseup", button);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const start = async () => {
    enableAudio();
    if (touchMode.current || dragLook.current) {
      dragLook.current = true;
      setPlaying(true);
      setStarted(true);
      return;
    }
    try {
      await host.current?.querySelector("canvas")?.requestPointerLock();
      setStarted(true);
    } catch {
      dragLook.current = true;
      setStarted(true);
      setPlaying(true);
    }
  };
  useEffect(() => {
    if (liveMatch.winner !== null && !runtime.killcam) { document.exitPointerLock(); setPlaying(false); }
  }, [match, frame]);
  const a = match.actors[runtime.viewActorId],
    hit = match.shots.some((s) => s.shooter === runtime.viewActorId && s.hit),
    minutes = Math.floor(match.time / 60),
    seconds = Math.floor(match.time % 60);
  return (
    <main className={`fps${touchControls ? " fps-touch-mode" : ""}`} ref={host} onContextMenu={(e) => e.preventDefault()}>
      <GameCanvas
        camera={{ position: [0, 1.5, -21], fov: 76, near: 0.04, far: 150 }}
        rendererConfig={{
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
      >
        <Suspense fallback={null}>
          <FPSScene
            runtime={runtime}
            match={match}
            input={input}
            playing={playing}
            onReady={onReady}
            audio={audio}
            onHud={() => setFrame((n) => n + 1)}
          />
        </Suspense>
      </GameCanvas>
      <div className="fps-hurt" aria-hidden="true" style={{ opacity: playing ? Math.max(0, 1 - a.hp / HEALTH_RULES.max) : 0 }} />
      <div hidden={!playing}>
        <div className="fps-top">
          <div className="fps-brand">
            POCKIT <span> / FIELD OPERATIONS</span>
            <small>RELAY YARD · TEAM DEATHMATCH</small>
          </div>
          <div className="fps-score">
            <b>{match.scores[0]}</b>
            <span>
              {minutes}:{String(seconds).padStart(2, "0")}
              <small>FIRST TO {LIMIT}</small>
            </span>
            <b>{match.scores[1]}</b>
          </div>
        </div>
        <div className="fps-map">
          <svg viewBox="-22 -26 44 52" aria-label="Team radar">
            {blocks
              .filter((b) => b.kind !== "roof" && b.kind !== "ground")
              .map((b, i) => (
                <rect
                  key={i}
                  x={b.p[0] - b.size[0] / 2}
                  y={b.p[2] - b.size[2] / 2}
                  width={b.size[0]}
                  height={b.size[2]}
                  fill="#66716b"
                />
              ))}
            {match.actors
              .filter((b) => b.team === a.team && b.hp > 0)
              .map((b) => (
                <circle
                  key={b.id}
                  cx={b.x}
                  cy={b.z}
                  r={b.id === runtime.viewActorId ? 1.1 : 0.65}
                  fill={b.id === runtime.viewActorId ? "#fff" : "#78ddc8"}
                />
              ))}
          </svg>
          <span>N ↑ / RELAY YARD</span>
        </div>
        <div className={`fps-cross ${hit ? "hit" : ""}`}>{hit ? "×" : "+"}</div>
        <div className="fps-feed">
          {match.feed.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
        <div className="fps-bottom">
          <div className="fps-health">
            <small>{runtime.killcam ? `${a.name} / KILLER VIEW` : "REMILIO / ALPHA"}</small>
            <strong>
              {Math.ceil(a.hp)} <span>HEALTH</span>
            </strong>
            <meter min={0} max={HEALTH_RULES.max} value={a.hp} />
            <small>
              {a.kills} KILLS / {a.deaths} DEATHS
            </small>
          </div>
          <div className="fps-ammo">
            <small>RY–01 CARBINE · {a.grenades} GRENADES</small>
            <strong>
              {a.throwing > 0 ? "THROWING" : a.reload > 0 ? "RELOADING" : a.ammo}
              <span> / 30</span>
            </strong>
            <small>
              {touchControls ? (a.ammo === 0 ? "TAP RELOAD" : "HOLD AIM TO SCOPE") : (a.ammo === 0 ? "PRESS R TO RELOAD" : "R RELOAD · RMB AIM")}
            </small>
          </div>
        </div>
      </div>
      {playing && runtime.killcam && (
        <div className="fps-killcam"><strong>KILLCAM · {a.name}</strong><span>Recorded server view · Respawn in {Math.ceil(liveMatch.actors[0].respawn)}s</span></div>
      )}
      {playing && !runtime.killcam && a.hp === 0 && (
        <div className="fps-death">
          <h2>BACK IN {Math.ceil(a.respawn)}</h2>
          <p>Regroup. Find another route.</p>
        </div>
      )}
      {playing && touchControls && <TouchControls input={input} onPause={() => setPlaying(false)} />}
      {!playing && (
        <div className="fps-menu">
          <section>
            <h1>
              RELAY
              <br />
              <em>YARD.</em>
            </h1>
            <p>
              A relay station on the edge of town.
              <br />
              Two squads. Three routes. No safe corners.
            </p>
            <div className="fps-tags">
              <span>4 VS 4</span>
              <span>SINGLE PLAYER + BOTS</span>
              <span>FIRST TO {LIMIT}</span>
            </div>
            <div className="fps-actions">
              {match.winner !== null ? (
                <>
                  <h2>
                    {match.winner === 2
                      ? "DRAW"
                      : match.winner === 0
                        ? "ALPHA WINS"
                        : "BRAVO WINS"}
                  </h2>
                  <p>
                    {a.kills} kills · {a.deaths} deaths
                  </p>
                  <button
                    onClick={() => {
                      setRuntime(new KillcamSession());
                      setStarted(false);
                    }}
                  >
                    NEW MATCH →
                  </button>
                </>
              ) : (
                <button disabled={!ready} onPointerDown={e => { if (e.pointerType === "touch") setTouchControls(true); }} onClick={start}>
                  {!ready
                    ? "LOADING SQUADS"
                    : started
                      ? "RESUME OPERATION"
                      : "DEPLOY AS REMILIO"}{" "}
                  →
                </button>
              )}
              <a href={withBasePath("/demo/fps/editor")}>EDIT MAP ↗</a>
            </div>
            {touchControls ? <p className="fps-touch-hint">Drag left to move · Drag right to look<br />Push the stick farther to sprint.</p> : <div className="fps-keys">
              <span><kbd>WASD</kbd> Move</span>
              <span><kbd>Mouse</kbd> Look</span>
              <span><kbd>LMB / RMB</kbd> Fire / aim</span>
              <span><kbd>Shift</kbd> Sprint</span>
              <span><kbd>Space</kbd> Jump</span>
              <span><kbd>C</kbd> Crouch</span>
              <span><kbd>G</kbd> Grenade</span>
              <span><kbd>R</kbd> Reload</span>
              <span><kbd>Esc</kbd> Pause</span>
            </div>}
          </section>
        </div>
      )}
    </main>
  );
}


/** The host owns ticking and world systems; prefab nodes bind and present its session. */
function FPSScene(props: FPSSession) {
  const muzzles = useMemo(() => new Map<number, Group>(), [props.match]);
  useLoader(FBXLoader, animationURLs);
  // Resolve assets before committing registry-backed nodes, avoiding a scene-wide
  // Suspense hide/unregister cycle while character components discover the manager.
  useGLTF([
    asset("pockit-remilio"),
    asset("pockit-milady"),
    asset("relay-carbine"),
    asset("relay-grenade"),
  ]);
  return (
    <SessionContext.Provider value={props}>
      <MuzzleContext.Provider value={muzzles}>
        <SessionDriver {...props} />
        <RendererLighting />
        <WorldAudio {...props} />
        <GrenadeEffects match={props.match} playing={props.playing} runtime={props.runtime} />
        <CombatEffects match={props.match} playing={props.playing} runtime={props.runtime} />
        <PrefabRoot id="fps" data={relayYardScene} basePath={BASE_PATH} />
      </MuzzleContext.Provider>
    </SessionContext.Provider>
  );
}
