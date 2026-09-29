import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const metadata = { title: 'Editor API for agents' };

/** Publish the canonical agent guide as readable HTML, including in static exports. */
export default function EditorAgentGuide() {
    const guide = readFileSync(join(process.cwd(), 'editor-api-for-agents.md'), 'utf8');
    return <main style={{ minHeight: '100vh', background: '#101722', color: '#edf2f8', padding: '40px 24px' }}>
        <article style={{ maxWidth: 900, margin: '0 auto' }}>
            <h1 style={{ fontSize: 28, fontWeight: 650, marginBottom: 24 }}>Editor API for agents</h1>
            <pre style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {guide.replace(/^# Editor API for agents\s*/, '')}
            </pre>
        </article>
    </main>;
}
