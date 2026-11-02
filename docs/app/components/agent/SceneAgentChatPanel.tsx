import { downloadBlob } from 'react-three-game/browser';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useEditorRef, createSceneTools } from 'react-three-game/editor';
import { listSceneChatModels, SceneChatSession, type SceneChatConfig, type SceneChatEvent } from './sceneChat.js';

const field: CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 6, padding: 8, fontSize: 12 };
const button: CSSProperties = { background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', borderRadius: 6, padding: '8px 10px', cursor: 'pointer', fontSize: 12 };
const storageKey = 'rtg:scene-chat:config:v1';

export function SceneAgentChatPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
    const { scene } = useEditorRef();
    const tools = useMemo(() => createSceneTools(scene), [scene]);
    const [session, setSession] = useState(() => new SceneChatSession(tools));
    const [config, setConfig] = useState<SceneChatConfig>({ endpoint: 'http://localhost:1234', model: '', vision: false });
    const [events, setEvents] = useState<SceneChatEvent[]>([]);
    const [draft, setDraft] = useState('');
    const [prompt, setPrompt] = useState('');
    const [models, setModels] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('Connect an OpenAI-compatible server. Edits apply to this scene.');
    const controller = useRef<AbortController | null>(null);
    const end = useRef<HTMLDivElement>(null);
    useEffect(() => {
        try { const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null'); if (saved) setConfig({ endpoint: saved.endpoint ?? 'http://localhost:1234', model: saved.model ?? '', vision: !!saved.vision }); } catch { /* Ignore unavailable or invalid storage. */ }
        return () => controller.current?.abort();
    }, []);
    useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [events, draft]);
    const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify({ endpoint: config.endpoint, model: config.model, vision: config.vision })); } catch { /* Optional preference persistence. */ } };
    const connect = async () => {
        const abort = new AbortController(); controller.current = abort; setBusy(true); persist();
        try {
            const ids = await listSceneChatModels(config, abort.signal); setModels(ids);
            if (!config.model && ids[0]) setConfig(current => ({ ...current, model: ids[0] }));
            setStatus(`${ids.length} models available`);
        } catch (error) { setStatus(`${String(error)}. Check server address, CORS and browser local-network access.`); }
        finally { setBusy(false); }
    };
    const send = async () => {
        const text = prompt.trim(); if (!text || busy) return;
        setPrompt(''); setDraft(''); setBusy(true); persist();
        const abort = new AbortController(); controller.current = abort;
        try {
            await session.run(text, config, event => {
                if (event.type === 'delta') setDraft(current => current + event.text);
                else if (event.type === 'status') setStatus(event.text);
                else { if (event.type === 'assistant' || event.type === 'error') setDraft(''); setEvents(current => [...current, event]); }
            }, abort.signal);
            setStatus('Ready');
        } catch (error) { setStatus(abort.signal.aborted ? 'Stopped' : String(error)); }
        finally { setBusy(false); }
    };
    const download = () => {
        downloadBlob(new Blob([JSON.stringify(session.transcript(config), null, 2)], { type: 'application/json' }), 'scene-agent-transcript.json');
    };
    return <>
        {open && <section aria-label="Scene agent chat" style={{ position: 'absolute', bottom: 50, right: 0, width: 'min(430px, calc(100vw - 24px))', height: 'min(78vh, 780px)', display: 'flex', flexDirection: 'column', gap: 10, boxSizing: 'border-box', padding: 16, background: '#111827', border: '1px solid #475569', borderRadius: 12, boxShadow: '0 16px 48px #0008' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>Scene agent</strong><button style={button} aria-label="Close agent chat" onClick={onToggle}>×</button></div>
            <details open><summary style={{ cursor: 'pointer', fontSize: 12 }}>Connection · {config.model || 'choose a model'}</summary>
                <label style={{ fontSize: 12 }}>Endpoint<input aria-label="Agent endpoint" style={field} disabled={busy} value={config.endpoint} onChange={e => setConfig({ ...config, endpoint: e.target.value })} /></label>
                <label style={{ fontSize: 12 }}>Model<input aria-label="Agent model" list="scene-agent-models" style={field} disabled={busy} value={config.model} onChange={e => setConfig({ ...config, model: e.target.value })} /></label>
                <datalist id="scene-agent-models">{models.map(id => <option key={id} value={id} />)}</datalist>
                <label style={{ fontSize: 12 }}>API key (optional, kept in memory)<input aria-label="Agent API key" type="password" autoComplete="off" style={field} disabled={busy} value={config.apiKey ?? ''} onChange={e => setConfig({ ...config, apiKey: e.target.value })} /></label>
                <label style={{ display: 'block', fontSize: 12, margin: '8px 0' }}><input type="checkbox" disabled={busy} checked={!!config.vision} onChange={e => setConfig({ ...config, vision: e.target.checked })} /> Send captures to model (requires vision)</label>
                <button style={button} disabled={busy} onClick={() => void connect()}>Connect / list models</button>
            </details>
            <div style={{ display: 'flex', gap: 6 }}><button style={button} disabled={busy} onClick={() => { setSession(new SceneChatSession(tools)); setEvents([]); setDraft(''); setStatus('New conversation; scene unchanged.'); }}>New chat</button><button style={button} onClick={download}>Export transcript</button></div>
            <div aria-label="Agent conversation" style={{ flex: 1, overflow: 'auto', minHeight: 80, fontSize: 12, lineHeight: 1.5 }}>
                {!events.length && <p style={{ color: '#94a3b8' }}>Ask for a scene edit. Tool calls, errors and captures appear here. Completed edits can be undone in the editor.</p>}
                {events.map((event, index) => <div key={index} style={{ marginBottom: 10, overflowWrap: 'anywhere' }}>
                    {event.type === 'user' || event.type === 'assistant' || event.type === 'error' ? event.text && <div style={{ whiteSpace: 'pre-wrap', color: event.type === 'error' ? '#fda4af' : event.type === 'user' ? '#67e8f9' : '#e2e8f0' }}><strong>{event.type === 'user' ? 'You' : event.type === 'error' ? 'Error' : 'Agent'}</strong><br />{event.text}</div> : event.type === 'request' ? <small style={{ color: '#94a3b8' }}>Model round {event.round} · {(event.durationMs / 1000).toFixed(1)}s</small> : event.type === 'toolStart' ? <details><summary>→ {event.name}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{event.arguments}</pre></details> : event.type === 'toolEnd' ? <>
                        <details><summary style={{ color: event.result.isError ? '#fda4af' : '#6ee7b7' }}>{event.result.isError ? 'Failed' : 'Done'} · {event.name} · {Math.round(event.durationMs)}ms</summary><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{event.result.content.filter(item => item.type === 'text').map(item => item.text).join('\n')}</pre></details>
                        {event.result.content.filter(item => item.type === 'image').map((item, i) => <img key={i} alt="Agent scene capture" src={`data:${item.mimeType};base64,${item.data}`} style={{ width: '100%', borderRadius: 6 }} />)}
                    </> : null}
                </div>)}
                {draft && <div style={{ whiteSpace: 'pre-wrap' }}>{draft}</div>}<div ref={end} />
            </div>
            <div role="status" style={{ fontSize: 11, color: '#94a3b8', overflowWrap: 'anywhere' }}>{status}</div>
            <form onSubmit={e => { e.preventDefault(); void send(); }}>
                <textarea aria-label="Message scene agent" rows={3} style={{ ...field, resize: 'vertical' }} value={prompt} disabled={busy} onChange={e => setPrompt(e.target.value)} placeholder="Describe a scene edit…" />
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between' }}><small style={{ color: '#94a3b8' }}>Uses the shared scene tools</small>{busy ? <button type="button" style={button} onClick={() => controller.current?.abort()}>Stop</button> : <button style={{ ...button, background: '#0e7490' }} type="submit" disabled={!prompt.trim() || !config.model.trim()}>Send</button>}</div>
            </form>
        </section>}
        <button style={{ ...button, padding: '10px 15px', background: '#111827' }} aria-expanded={open} onClick={onToggle}>Agent chat{busy ? ' · running' : ''}</button>
    </>;
}
