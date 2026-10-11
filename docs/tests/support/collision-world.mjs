import { after } from 'node:test';
import { CollisionWorld } from '../../app/demo/parkour/collision.ts';

// Tests construct equivalent surface arrays every tick; reuse their static worlds.
const worlds = new Map();
export function collisionWorld(surfaces) {
    if (surfaces instanceof CollisionWorld) return surfaces;
    const key = JSON.stringify(surfaces);
    if (!worlds.has(key)) worlds.set(key, new CollisionWorld(surfaces));
    return worlds.get(key);
}
after(() => {
    for (const world of worlds.values()) world.dispose();
    worlds.clear();
});
