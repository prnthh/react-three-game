export type Point = [number, number, number];
export type CutsceneCommand =
    | { type: 'animation'; character: string; name: string }
    | { type: 'dialogue'; character: string; text: string; durationMs?: number; audioSrc?: string; closeup?: boolean }
    | { type: 'walkto'; character: string; position: Point; speed?: number }
    | { type: 'lookat'; character: string; target: string | Point };
export type Script = CutsceneCommand[];

export function parseScript(input: unknown): Script {
    const fail = (message: string): never => { throw new Error(`Cutscene: ${message}`); };
    const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    const point = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n));
    const string = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
    const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
    if (!Array.isArray(input) || !input.length) fail('expected a nonempty command array.');
    for (const [index, value] of (input as unknown[]).entries()) {
        if (!record(value) || !string(value.character)) fail(`command ${index} needs a character node ID.`);
        const c = value as Record<string, unknown>;
        switch (c.type) {
            case 'animation':
                if (!string(c.name)) fail(`invalid animation at ${index}.`);
                break;
            case 'dialogue':
                if (c.closeup !== undefined && typeof c.closeup !== 'boolean') fail(`invalid closeup flag at ${index}.`);
                if (typeof c.text !== 'string' || (c.durationMs !== undefined && !positive(c.durationMs)) || (c.audioSrc !== undefined && !string(c.audioSrc))) fail(`invalid dialogue at ${index}.`);
                break;
            case 'walkto':
                if (!point(c.position) || (c.speed !== undefined && !positive(c.speed))) fail(`invalid walkto at ${index}.`);
                break;
            case 'lookat':
                if (!string(c.target) && !point(c.target)) fail(`invalid lookat at ${index}.`);
                break;
            default: fail(`unknown command type at ${index}.`);
        }
    }
    return input as Script;
}

/** Node IDs required to execute the commands; no separate character metadata. */
export function characterIds(script: Script) {
    return [...new Set(script.flatMap(command => command.type === 'lookat' && typeof command.target === 'string'
        ? [command.character, command.target] : [command.character]))];
}
