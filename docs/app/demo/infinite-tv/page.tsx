'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import { Loader } from '@react-three/drei';
import { GameCanvas, GameEventsProvider, PrefabRoot, registerComponent, useGameEvents, type Prefab } from 'react-three-game/viewer';
import { BASE_PATH } from '../../basePath';
import CutsceneRunner from '../../components/cutscene/CutsceneRunner';
import scene from '../../../public/prefabs/infinite-tv.json';
import type { AudioState, Caption } from '../../components/cutscene/Runner';

registerComponent(CutsceneRunner);

const buttonStyle: CSSProperties = {
    padding: '8px 12px', borderRadius: 6, background: '#0009',
    color: '#fff', font: '14px system-ui', textDecoration: 'none',
};

function AudioButton() {
    const events = useGameEvents();
    const [state, setState] = useState<AudioState>('on');
    useEffect(() => {
        const off = events.on('infinite-tv:audio-state', value => setState(value as AudioState));
        events.emit('infinite-tv:audio', 'status');
        return off;
    }, [events]);
    return <button
        type="button"
        aria-label={state === 'on' ? 'Mute audio' : 'Enable audio'}
        title="Enable or mute dialogue audio. If the browser tab itself is muted, unmute it in the browser."
        onClick={() => events.emit('infinite-tv:audio', state !== 'on')}
        style={{ ...buttonStyle, pointerEvents: 'auto', border: 0, cursor: 'pointer' }}
    >{state === 'on' ? 'Audio on' : state === 'muted' ? 'Audio off' : 'Enable audio'}</button>;
}

function Captions() {
    const events = useGameEvents();
    const [caption, setCaption] = useState<Caption>({ text: 'Loading scene…' });
    useEffect(() => events.on('infinite-tv:dialogue', value => setCaption(value as Caption)), [events]);
    return caption && <div aria-live="polite" aria-atomic="true" style={{
        position: 'absolute', bottom: 'max(24px, env(safe-area-inset-bottom))', left: '5%', right: '5%',
        textAlign: 'center', color: '#fff', font: 'clamp(16px, 2.2vw, 24px)/1.5 system-ui',
        pointerEvents: 'none',
    }}>
        <div style={{ display: 'inline-block', maxWidth: 900, padding: '12px 20px', borderRadius: 6, background: '#000b' }}>
            {caption.character && <div style={{ fontSize: 12, color: '#d4e493', marginBottom: 4 }}>{caption.character}</div>}
            <p style={{ margin: 0 }}>{caption.text}</p>
        </div>
    </div>;
}

export default function InfiniteTV() {
    return <GameEventsProvider>
        <main style={{ position: 'fixed', inset: 0, background: '#252e2c' }}>
            <GameCanvas>
                <color attach="background" args={['#252e2c']} />
                <PrefabRoot data={scene as Prefab} basePath={BASE_PATH} />
            </GameCanvas>
            <Loader />
            <nav aria-label="Demo navigation" style={{
                position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', left: 16, right: 16,
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'none',
            }}>
                <Link href="/" style={{ ...buttonStyle, pointerEvents: 'auto' }}>← Back</Link>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <Link href="/demo/infinite-tv/editor" style={{ ...buttonStyle, pointerEvents: 'auto' }}>Edit</Link>
                    <AudioButton />
                </div>
            </nav>
            <Captions />
        </main>
    </GameEventsProvider>;
}
