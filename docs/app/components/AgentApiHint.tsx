import { withBasePath } from '../basePath';

/** Documentation discovery belongs to the host page, not the editor package. */
export default function AgentApiHint() {
    return <a
        href={withBasePath('/editor-scene-for-agents.md')}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Scene API: window.scene.help()"
        title="Start here: window.scene.help()"
        className="fixed bottom-3 right-3 z-50 rounded border border-white/15 bg-slate-950/85 px-2 py-1.5 text-[11px] text-slate-200 hover:text-white"
    >Scene API ↗</a>;
}
