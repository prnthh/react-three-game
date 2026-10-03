"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import DialogueBox from "./DialogueBox";
import { useGameDriver } from "./GameDriver";

type Presentation = { owner: string; page: number; text: string; next(): void };
type DialogueDisplay = { show(value: Presentation): void; hide(owner: string): void };
const DialogueContext = createContext<DialogueDisplay | null>(null);
export const useDialogueDisplay = () => useContext(DialogueContext);

/** Presentation only: the originating entity owns the page number and advance action. */
export default function OverlayHUD({ children }: { children: ReactNode }) {
    const game = useGameDriver();
    const empty = !game?.scene || (!game.scene.root.children?.length && !Object.keys(game.scene.root.components ?? {}).length);
    const [presentation, show] = useState<Presentation | null>(null);
    const [voiceEnabled, setVoiceEnabled] = useState(true);
    const hide = useCallback((owner: string) => show(current => current?.owner === owner ? null : current), []);
    const display = useMemo(() => ({ show, hide }), [hide]);
    return <DialogueContext.Provider value={display}>
        {children}
        <div className="pointer-events-none absolute inset-0">
            {game?.scene && <button type="button" aria-pressed={voiceEnabled}
                onClick={() => setVoiceEnabled(enabled => !enabled)}
                className="pointer-events-auto absolute right-4 top-4 rounded bg-black/80 px-3 py-2 text-sm text-white">
                Voice: {voiceEnabled ? "on" : "off"}
            </button>}
            {presentation && !game?.loading && <DialogueBox key={`${presentation.owner}:${presentation.page}`} title="Dialogue"
                voiceEnabled={voiceEnabled} text={presentation.text} onNext={presentation.next} />}
            {(game?.loading || game?.error || empty) && <div className="grid h-full place-content-center text-center text-white">
                <p role={game?.error ? "alert" : "status"}>{game?.error ?? (game?.loading ? "Loading…" : "No scenes yet.")}</p>
            </div>}
        </div>
    </DialogueContext.Provider>;
}
