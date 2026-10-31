"use client";
import { blocks } from "./shared/map";
import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { ACESFilmicToneMapping } from "three";
import { GameCanvas } from "react-three-game/viewer";
import { idleCommand, LIMIT, HEALTH_RULES } from "./shared/protocol";
import { KillcamSession } from "./session";
import { SpatialAudio } from "./audio";
import { FPSScene } from "./scene";
import "./style.css";
import { withBasePath } from "../../basePath";
export default function FPSPage() {
  const [runtime, setRuntime] = useState(() => new KillcamSession()),
    [playing, setPlaying] = useState(false),
    [started, setStarted] = useState(false),
    [frame, setFrame] = useState(0),
    [error, setError] = useState(""),
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
        !active.current ||
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
      if (!active.current) return;
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
    if (dragLook.current) {
      setPlaying(true);
      setStarted(true);
      return;
    }
    try {
      await host.current?.querySelector("canvas")?.requestPointerLock();
      setStarted(true);
      setError("");
    } catch {
      setError(
        "Mouse capture is unavailable here. Use drag look, or open this page in a desktop browser for standard FPS controls.",
      );
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
    <main className="fps" ref={host} onContextMenu={(e) => e.preventDefault()}>
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
              .filter((b) => b.kind !== "roof")
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
              {a.ammo === 0 ? "PRESS R TO RELOAD" : "R RELOAD · RMB AIM"}
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
      {!playing && (
        <div className="fps-menu">
          <section>
            <span className="fps-eyebrow">POCKIT / LOCAL OPERATIONS</span>
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
                <button disabled={!ready} onClick={start}>
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
            <div className="fps-keys">
              <span><kbd>WASD</kbd> Move</span>
              <span><kbd>Mouse</kbd> Look</span>
              <span><kbd>LMB / RMB</kbd> Fire / aim</span>
              <span><kbd>Shift</kbd> Sprint</span>
              <span><kbd>Space</kbd> Jump</span>
              <span><kbd>C</kbd> Crouch</span>
              <span><kbd>G</kbd> Grenade</span>
              <span><kbd>R</kbd> Reload</span>
              <span><kbd>Esc</kbd> Pause</span>
            </div>
            {error && (
              <>
                <p role="alert">{error}</p>
                <button
                  className="fps-secondary"
                  onClick={() => {
                    enableAudio();
                    dragLook.current = true;
                    setPlaying(true);
                    setStarted(true);
                    setError("");
                  }}
                >
                  PLAY WITH DRAG LOOK →
                </button>
              </>
            )}
            <footer>You + 3 Remilios vs. 4 Miladys · Single-player</footer>
          </section>
        </div>
      )}
    </main>
  );
}
