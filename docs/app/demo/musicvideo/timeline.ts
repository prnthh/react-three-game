import type { PrefabStoreApi } from 'react-three-game/viewer';

export type PropertyCue = { time: number; nodeId: string; component: string; properties: Record<string, unknown> };
export type AudioCue = { time: number; action: 'playAudio'; clip: string; volume?: number };
export type TimelineCue = PropertyCue | AudioCue;
export type Timeline = { commands: TimelineCue[] };
export function isAudioCue(cue: TimelineCue): cue is AudioCue { return 'action' in cue && cue.action === 'playAudio'; }

/** Validate the complete file before executing any commands. Equal-time cues retain file order. */
export function parseTimeline(value: unknown): Timeline {
    if (!value || typeof value !== 'object' || !Array.isArray((value as Timeline).commands)) {
        throw new Error('Timeline requires a commands array.');
    }
    const commands = (value as Timeline).commands.map((cue, index) => {
        if (!cue || !Number.isFinite(cue.time) || cue.time < 0) throw new Error(`Invalid timeline command ${index + 1}.`);
        if ('action' in cue) {
            if (!isAudioCue(cue) || typeof cue.clip !== 'string' || !cue.clip ||
                (cue.volume !== undefined && (!Number.isFinite(cue.volume) || cue.volume < 0 || cue.volume > 1))) {
                throw new Error(`Invalid audio command ${index + 1}.`);
            }
        } else if (typeof cue.nodeId !== 'string' || !cue.nodeId || typeof cue.component !== 'string' || !cue.component ||
            !cue.properties || typeof cue.properties !== 'object' || Array.isArray(cue.properties)) {
            throw new Error(`Invalid timeline command ${index + 1}.`);
        }
        return cue;
    });
    return { commands: commands.sort((a, b) => a.time - b.time) };
}

/** Playback edits are temporary; restore authored properties on stop. */
export function createTimelinePlayer(timeline: Timeline, store: PrefabStoreApi, playAudio: (cue: AudioCue) => void = () => {}) {
    const originals = new Map<string, { nodeId: string; component: string; properties: Record<string, unknown> }>();
    for (const cue of timeline.commands) {
        if (isAudioCue(cue)) continue;
        const component = store.getState().nodesById[cue.nodeId]?.components?.[cue.component];
        if (!component) throw new Error(`Timeline target not found: ${cue.nodeId}.${cue.component}`);
        const key = JSON.stringify([cue.nodeId, cue.component]);
        if (!originals.has(key)) originals.set(key, { ...cue, properties: component.properties });
    }
    let next = 0;
    const patch = (cue: PropertyCue, replace = false) => store.getState().updateNode(cue.nodeId, node => {
        const component = node.components?.[cue.component];
        if (!component) return node;
        return { ...node, components: { ...node.components, [cue.component]: {
            ...component, properties: replace ? cue.properties : { ...component.properties, ...cue.properties },
        } } };
    });
    return {
        advance(time: number) {
            store.getState().batch(() => {
                while (next < timeline.commands.length && timeline.commands[next].time <= time) {
                    const cue = timeline.commands[next++];
                    if (isAudioCue(cue)) playAudio(cue);
                    else patch(cue);
                }
            });
        },
        stop() {
            store.getState().batch(() => originals.forEach(cue => patch({ ...cue, time: 0 }, true)));
            next = 0;
        },
    };
}
