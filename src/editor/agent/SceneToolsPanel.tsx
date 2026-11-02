import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type CSSProperties } from 'react';
import { useEditorRef } from '../EditorContext.js';
import { createSceneTools, createSceneToolGuide, type SceneTool, type SceneToolResult } from './sceneTools.js';
import { getSceneWebMCPStatus, subscribeSceneWebMCP } from './sceneWebMCP.js';

const inputStyle: CSSProperties = { width: '100%', boxSizing: 'border-box', color: '#e2e8f0', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '8px 10px', fontSize: 12 };
const buttonStyle: CSSProperties = { border: '1px solid #475569', borderRadius: 6, padding: '7px 11px', background: '#1e293b', color: '#e2e8f0', cursor: 'pointer', fontSize: 12 };
const initialValues: Record<string, Record<string, string>> = {
    scene_search: { limit: '20' }, scene_view: { action: 'get' }, scene_capture: { helpers: 'false' },
    scene_mode: { mode: 'edit' }, scene_history: { action: 'undo' }, scene_save: { action: 'export' },
    scene_prefab: { action: 'export' }, scene_batch: { validateOnly: 'true', commands: '[]' },
};

/** The panel and native tools execute the same catalog, including API validation
 * and shared undo. It remains usable in browsers without native WebMCP. */
export function SceneToolsPanel({ guideUrl, open: controlledOpen, onOpenChange, children }: {
    guideUrl?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: ReactNode;
} = {}) {
    const { scene } = useEditorRef();
    const tools = useMemo(() => createSceneTools(scene), [scene]);
    const guide = useMemo(createSceneToolGuide, []);
    const subscribe = useMemo(() => (listener: () => void) => subscribeSceneWebMCP(scene, listener), [scene]);
    const snapshot = useMemo(() => () => getSceneWebMCPStatus(scene), [scene]);
    const status = useSyncExternalStore(subscribe, snapshot, snapshot);
    const [localOpen, setLocalOpen] = useState(false);
    const open = controlledOpen ?? localOpen;
    const setOpen = (value: boolean) => { setLocalOpen(value); onOpenChange?.(value); };
    const [selected, setSelected] = useState('scene_search');
    const [fields, setFields] = useState<Record<string, string>>(initialValues.scene_search);
    const [result, setResult] = useState<SceneToolResult | null>(null);
    const [busy, setBusy] = useState(false);
    const execution = useRef<AbortController | null>(null);
    useEffect(() => () => execution.current?.abort(), []);
    const tool = tools.find(tool => tool.name === selected)!;
    const properties = tool.inputSchema.properties as Record<string, { type?: string; enum?: string[]; description?: string; minimum?: number; maximum?: number }>;
    const required = tool.inputSchema.required as string[];
    const changeTool = (name: string) => {
        setSelected(name); setResult(null);
        setFields({ ...initialValues[name], ...(['scene_batch', 'scene_load'].includes(name) ? { expectedRevision: scene.info().revision } : {}) });
    };
    const execute = async (currentTool: SceneTool, args: Record<string, unknown>) => {
        const controller = new AbortController(); execution.current = controller;
        setBusy(true); setResult(null);
        try {
            const output = await currentTool.execute(args, { signal: controller.signal });
            if (!controller.signal.aborted) setResult(output);
        } catch (error) {
            if (!controller.signal.aborted) setResult({ isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] });
        } finally { if (!controller.signal.aborted) setBusy(false); }
    };
    const run = () => {
        try {
            const args = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== '').map(([key, value]) => {
                const type = properties[key]?.type;
                return [key, type === 'string' ? value : JSON.parse(value)];
            }));
            void execute(tool, args);
        } catch (error) { setResult({ isError: true, content: [{ type: 'text', text: `Check the arguments: ${error instanceof Error ? error.message : String(error)}` }] }); }
    };
    const text = result?.content.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? '';
    let data: { nodes?: { id: string; name?: string }[] } | undefined;
    try { data = text ? JSON.parse(text) : undefined; } catch { /* Plain API error text. */ }
    const images = result?.content.filter(block => block.type === 'image') ?? [];
    return <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 10000, fontFamily: 'system-ui, sans-serif', color: '#e2e8f0' }}
        onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') setOpen(false); }}>
        {open && <section aria-label="Scene tools panel" style={{ width: 'min(410px, calc(100vw - 24px))', maxHeight: 'min(78vh, 720px)', overflow: 'auto', marginBottom: 10, border: '1px solid #475569', borderRadius: 12, background: '#111827', boxShadow: '0 16px 48px #0008', padding: 18, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: 17 }}>Scene tools</h2>
                <button type="button" aria-label="Close scene tools" style={buttonStyle} onClick={() => setOpen(false)}>×</button>
            </div>
            <p role="status" style={{ fontSize: 12, color: status.state === 'ready' ? '#6ee7b7' : '#94a3b8', margin: '9px 0' }}>
                {status.state === 'ready' ? `${status.toolCount} tools available to browser agents` : status.state === 'registering' ? 'Registering browser tools…' : status.state === 'error' ? 'Browser tool registration failed' : 'Native WebMCP unavailable in this browser'}
            </p>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px' }}>Run scene actions here or through an agent. Edits share the editor’s undo history.</p>
            {guideUrl && <a href={guideUrl} target="_blank" rel="noopener noreferrer"
                title="Scene concepts and API examples"
                style={{ display: 'inline-block', marginBottom: 16, fontSize: 12, color: '#67e8f9' }}>Scene API guide ↗</a>}
            {status.message && <p role="alert" style={{ fontSize: 12, color: '#fda4af' }}>{status.message}</p>}
            <details style={{ fontSize: 12, marginBottom: 16 }}>
                <summary style={{ cursor: 'pointer', color: '#67e8f9' }}>Editor concepts and workflow</summary>
                <dl>{Object.entries(guide.concepts).map(([name, description]) => <div key={name} style={{ marginTop: 10 }}>
                    <dt style={{ fontWeight: 600, textTransform: 'capitalize' }}>{name.replace(/([A-Z])/g, ' $1')}</dt>
                    <dd style={{ margin: '3px 0 0', color: '#cbd5e1', lineHeight: 1.5 }}>{description}</dd>
                </div>)}</dl>
                {guide.workflow.map((step, index) => <div key={index} style={{ marginTop: 14 }}>
                    <p style={{ lineHeight: 1.5, marginBottom: 6 }}>{step.intent}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{step.tools.map(name => <button type="button" key={name} disabled={busy} style={buttonStyle} onClick={() => changeTool(name)}>{tools.find(tool => tool.name === name)?.title ?? name}</button>)}</div>
                </div>)}
            </details>
            <form onSubmit={event => { event.preventDefault(); run(); }}>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }} htmlFor="scene-tool-action">Action</label>
                <select id="scene-tool-action" value={selected} disabled={busy} onChange={event => changeTool(event.target.value)} style={inputStyle}>
                    {tools.map(tool => <option key={tool.name} value={tool.name}>{tool.title}</option>)}
                </select>
                <p style={{ fontSize: 12, lineHeight: 1.5, color: '#cbd5e1' }}>{tool.description}</p>
                {Object.entries(properties).map(([key, field]) => <label key={`${selected}/${key}`} style={{ display: 'block', fontSize: 12, marginTop: 12 }}>
                    <span style={{ display: 'block', marginBottom: 5 }}>{key}{required.includes(key) ? ' *' : ''}</span>
                    {field.enum || field.type === 'boolean' ? <select aria-label={key} style={inputStyle} value={fields[key] ?? ''} disabled={busy} onChange={event => setFields({ ...fields, [key]: event.target.value })}>
                        <option value="">{required.includes(key) ? 'Choose…' : 'Use default'}</option>
                        {(field.enum ?? ['true', 'false']).map(value => <option key={value} value={value}>{value}</option>)}
                    </select> : field.type === 'array' || field.type === 'object' ? <textarea aria-label={key} rows={3} spellCheck={false} style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }} placeholder={field.type === 'array' ? '[]' : '{}'} disabled={busy} value={fields[key] ?? ''} onChange={event => setFields({ ...fields, [key]: event.target.value })} /> :
                        <input aria-label={key} style={inputStyle} type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'} step={field.type === 'integer' ? 1 : 'any'} min={field.minimum} max={field.maximum} disabled={busy} value={fields[key] ?? ''} onChange={event => setFields({ ...fields, [key]: event.target.value })} />}
                    {field.description && <span style={{ display: 'block', color: '#94a3b8', fontSize: 11, marginTop: 4 }}>{field.description}</span>}
                </label>)}
                {['scene_batch', 'scene_load'].includes(selected) && <button type="button" disabled={busy} style={{ ...buttonStyle, marginTop: 10 }} onClick={() => setFields({ ...fields, expectedRevision: scene.info().revision })}>Use current revision</button>}
                <button type="submit" disabled={busy} style={{ ...buttonStyle, marginTop: 16, width: '100%', background: busy ? '#334155' : '#0e7490', borderColor: '#0891b2', fontWeight: 600 }}>{busy ? 'Running…' : tool.title}</button>
            </form>
            {result && <div aria-live="polite" style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 12, marginBottom: 8, color: result.isError ? '#fda4af' : '#6ee7b7' }}>{result.isError ? 'Action failed' : 'Result'}</h3>
                {data?.nodes && <div style={{ display: 'grid', gap: 5, marginBottom: 10 }}>{data.nodes.map(node => <button type="button" disabled={busy} key={node.id} style={{ ...buttonStyle, textAlign: 'left' }} onClick={() => { void execute(tools.find(tool => tool.name === 'scene_view')!, { action: 'focus', id: node.id }); }}>{node.name || node.id} <span style={{ color: '#94a3b8' }}>↗</span></button>)}</div>}
                {images.map((block, index) => <img key={index} alt="Scene capture" style={{ maxWidth: '100%', borderRadius: 6 }} src={`data:${block.mimeType};base64,${block.data}`} />)}
                <pre style={{ margin: 0, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: '#020617', borderRadius: 6, padding: 10, fontSize: 11 }}>{data ? JSON.stringify(data, null, 2) : text}</pre>
            </div>}
            <details style={{ fontSize: 11, marginTop: 14, color: '#94a3b8' }}><summary style={{ cursor: 'pointer' }}>Tool schema · {tool.name}</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(tool.inputSchema, null, 2)}</pre></details>
        </section>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{children}<button type="button" aria-expanded={open} aria-label="Scene tools" onClick={() => setOpen(!open)} style={{ ...buttonStyle, float: 'right', padding: '10px 15px', background: '#111827', boxShadow: '0 4px 16px #0005' }}>✦ Scene tools</button></div>
    </div>;
}
