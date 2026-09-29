import type { GameObject } from 'react-three-game/core';
import type { Position } from './movement';
export type Character = { id: string; name: string; color: string; position: Position; speed: number; jumpSpeed: number; playable: boolean };

export function parseRoster(value: unknown): Character[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new Error('Expected 1–20 characters.');
    const ids = new Set<string>();
    const characters = value.map(entry => {
        if (!entry || typeof entry !== 'object') throw new Error('Invalid character.');
        const c = entry as Character;
        if (typeof c.id !== 'string' || !/^[a-z0-9-]+$/.test(c.id) || ids.has(c.id)) throw new Error('Character IDs must be unique lowercase names.');
        ids.add(c.id);
        if (typeof c.name !== 'string' || !c.name.trim() || typeof c.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.color)
            || !Array.isArray(c.position) || c.position.length !== 3 || !c.position.every(n => typeof n === 'number' && Number.isFinite(n))
            || typeof c.speed !== 'number' || !Number.isFinite(c.speed) || c.speed < 1 || c.speed > 12
            || typeof c.jumpSpeed !== 'number' || !Number.isFinite(c.jumpSpeed) || c.jumpSpeed < 1 || c.jumpSpeed > 15
            || typeof c.playable !== 'boolean') throw new Error(`Invalid fields for ${c.id}.`);
        return { id: c.id, name: c.name, color: c.color, position: [...c.position] as Position, speed: c.speed, jumpSpeed: c.jumpSpeed, playable: c.playable };
    });
    if (characters.filter(c => c.playable).length !== 1) throw new Error('Roster needs exactly one playable character.');
    return characters;
}

export function characterNode(c: Character): GameObject {
    return { id: `character-${c.id}`, name: c.name, components: {
        transform: { type: 'Transform', properties: { position: c.position } },
        character: { type: 'JumperCharacter', properties: { color: c.color, speed: c.speed, jumpSpeed: c.jumpSpeed, playable: c.playable } },
    } };
}
