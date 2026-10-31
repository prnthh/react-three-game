import { useEffect, useRef, type RefObject, type PointerEvent } from "react";
import type { Command } from "../shared/protocol";

type TouchAction = "fire" | "aim" | "crouch" | "jump" | "reload" | "grenade";
const touchActions: { key: TouchAction; label: string; held?: boolean }[] = [
  { key: "fire", label: "Fire", held: true }, { key: "aim", label: "Aim", held: true },
  { key: "crouch", label: "Crouch", held: true }, { key: "jump", label: "Jump" },
  { key: "reload", label: "Reload" },
  { key: "grenade", label: "Grenade" },
];
export function TouchControls({ input, onPause }: { input: RefObject<Command>; onPause: () => void }) {
  const stick = useRef<HTMLDivElement>(null), knob = useRef<HTMLDivElement>(null);
  const gestures = useRef(new Map<number, { kind: "move" | "look"; x: number; y: number }>());
  const held = useRef(new Map<number, TouchAction>());
  useEffect(() => () => {
    input.current.forward = input.current.right = 0;
    input.current.sprint = false;
    for (const action of touchActions) input.current[action.key] = false;
    gestures.current.clear(); held.current.clear();
  }, [input]);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestures.current.get(event.pointerId);
    if (!gesture) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (gesture.kind === "move") {
      const distance = Math.hypot(dx, dy), radius = 48;
      const scale = radius / Math.max(radius, distance);
      input.current.right = distance < 6 ? 0 : dx * scale / radius;
      input.current.forward = distance < 6 ? 0 : -dy * scale / radius;
      // Hysteresis avoids toggling sprint at the edge of the thumb travel.
      input.current.sprint = distance > (input.current.sprint ? 38 : 44);
      if (stick.current) stick.current.dataset.sprinting = String(input.current.sprint);
      if (knob.current) knob.current.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    } else {
      input.current.yaw -= dx * 0.004;
      input.current.pitch = Math.max(-1.4, Math.min(1.4, input.current.pitch - dy * 0.004));
      gesture.x = event.clientX; gesture.y = event.clientY;
    }
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (gestures.current.get(event.pointerId)?.kind === "move") {
      input.current.forward = input.current.right = 0;
      input.current.sprint = false;
      if (stick.current) stick.current.hidden = true;
    }
    gestures.current.delete(event.pointerId);
  };
  const releaseAction = (event: PointerEvent<HTMLButtonElement>) => {
    const key = held.current.get(event.pointerId);
    held.current.delete(event.pointerId);
    if (key && ![...held.current.values()].includes(key)) input.current[key] = false;
  };
  return <div className="fps-touch-controls" onPointerDown={event => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const kind = event.clientX - bounds.left < bounds.width * 0.4 ? "move" : "look";
    if ([...gestures.current.values()].some(gesture => gesture.kind === kind)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gestures.current.set(event.pointerId, { kind, x: event.clientX, y: event.clientY });
    if (kind === "move" && stick.current && knob.current) {
      stick.current.hidden = false;
      stick.current.style.left = `${event.clientX - bounds.left}px`;
      stick.current.style.top = `${event.clientY - bounds.top}px`;
      knob.current.style.transform = "translate(0, 0)";
    }
  }} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    <div ref={stick} className="fps-touch-stick" hidden aria-hidden="true"><div ref={knob} /></div>
    <div className="fps-touch-actions">
      {touchActions.map(action => <button key={action.key} type="button" aria-label={action.label}
        onPointerDown={event => {
          event.stopPropagation(); event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          input.current[action.key] = true;
          if (action.held) held.current.set(event.pointerId, action.key);
        }} onPointerUp={releaseAction} onPointerCancel={releaseAction} onLostPointerCapture={releaseAction}>
        {action.label}
      </button>)}
      </div>
    <button className="fps-touch-pause" type="button" aria-label="Pause" onPointerDown={event => { event.stopPropagation(); event.preventDefault(); onPause(); }} onClick={onPause}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="3" /></svg>
    </button>
  </div>;
}

