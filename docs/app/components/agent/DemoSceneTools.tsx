import { useState } from 'react';
import { SceneToolsPanel } from 'react-three-game/editor';
import { SceneAgentChatPanel } from './SceneAgentChatPanel';

/** Demo integration: the library supplies tools; this host supplies a chat client. */
export function DemoSceneTools({ guideUrl }: { guideUrl: string }) {
    const [open, setOpen] = useState<'tools' | 'chat' | null>(null);
    return <SceneToolsPanel guideUrl={guideUrl} open={open === 'tools'} onOpenChange={value => setOpen(value ? 'tools' : null)}>
        <SceneAgentChatPanel open={open === 'chat'} onToggle={() => setOpen(open === 'chat' ? null : 'chat')} />
    </SceneToolsPanel>;
}
