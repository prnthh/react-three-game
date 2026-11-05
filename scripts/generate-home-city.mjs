// Rebuild the home demo's editable prefab kit and small, deterministic surface assets.
// Run: node scripts/generate-home-city.mjs
// Writes docs/public/prefabs/brutalist-city and textures/home-city, including
// reusable habitat definitions. It embeds scripts/home-city/flythrough.js in the
// camera's Runtime update property. Export editor changes before regenerating:
// this script replaces generated documents and assets with its authored recipe.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const publicRoot = fileURLToPath(new URL('../docs/public/', import.meta.url));
const folder = `${publicRoot}prefabs/brutalist-city/`;
const textures = `${publicRoot}textures/home-city/`;
mkdirSync(textures, { recursive: true });
const rounded = values => values.map(v => Math.round(v * 10000) / 10000);
const component = (type, properties) => ({ type, properties });
const transform = (position, scale = [1, 1, 1], rotation = [0, 0, 0]) => component('Transform', { position: rounded(position), scale: rounded(scale), rotation: rounded(rotation) });
let serial = 0;
const materials = {
    concrete: { color: '#9c9e99', roughness: 0.94, diffuseRoughness: 0.8, texture: '/textures/home-city/formwork.png', normalMapTexture: '/textures/home-city/formwork-normal.png', normalScale: [0.28, 0.28], repeat: true, repeatCount: [2, 2] },
    pale: { color: '#b6b9b2', roughness: 0.92, diffuseRoughness: 0.75, texture: '/textures/home-city/formwork.png', repeat: true, repeatCount: [2, 1] },
    dark: { color: '#4d5555', roughness: 0.93, diffuseRoughness: 0.75, texture: '/textures/home-city/formwork.png', repeat: true, repeatCount: [2, 2] },
    metal: { color: '#313d40', roughness: 0.58, metalness: 0.7 },
    rust: { color: '#795746', roughness: 0.75, metalness: 0.4 },
    glass: { color: '#192d32', roughness: 0.26, metalness: 0.55 },
    road: { color: '#394448', roughness: 0.4, metalness: 0.25, texture: '/textures/home-city/formwork.png', repeat: true, repeatCount: [5, 22] },
    amber: { color: '#ffc584', emissive: '#ff9c42', emissiveIntensity: 3.2, roughness: 0.4 },
    cyan: { color: '#a0e4dc', emissive: '#45c9c7', emissiveIntensity: 2.6, roughness: 0.35 },
    window: { color: '#b4b29a', emissive: '#ffd39a', emissiveIntensity: 0.38, roughness: 0.4 },
    red: { color: '#c86245', emissive: '#ff492a', emissiveIntensity: 2.5 },
};

function mesh(name, position, scale, material = 'concrete', rotation = [0, 0, 0], geometryType = 'box', args = [1, 1, 1]) {
    return { id: `city-${++serial}`, name, components: {
        transform: transform(position, scale, rotation),
        geometry: component('Geometry', { geometryType, args, castShadow: !['amber', 'cyan', 'window', 'red'].includes(material), receiveShadow: true }),
        material: component('Material', { name: `home-city:${material}`, ...materials[material] }),
    } };
}
function group(id, name, children, position = [0, 0, 0], rotation = [0, 0, 0]) {
    return { id, name, components: { transform: transform(position, [1, 1, 1], rotation) }, children };
}
function light(id, position, color, intensity, distance, targetOffset) {
    return { id, name: id, components: {
        transform: transform(position),
        light: component(targetOffset ? 'SpotLight' : 'PointLight', { color, intensity, distance, decay: 2,
            ...(targetOffset ? { targetOffset, angle: 0.85, penumbra: 0.65 } : {}) }),
    } };
}
function sign(label, position, width, height, asset) {
    const node = mesh(label, position, [width, height, 1], 'metal', [0, 0, 0], 'plane', [1, 1]);
    node.components.material = component('Material', { name: `home-city:sign-${asset}`, materialType: 'basic', color: '#ffffff', texture: `/textures/home-city/${asset}.svg`, toneMapped: false });
    return node;
}
function writePrefab(filename, name, children) {
    // Define each shared material once. All other meshes are named references,
    // so loading a dense facade does not repeatedly replace pool definitions.
    const defined = new Set();
    const compact = node => {
        const material = node.components?.material;
        if (material) {
            const key = material.properties.name;
            if (defined.has(key)) material.properties = { name: key };
            else defined.add(key);
        }
        node.children?.forEach(compact);
    };
    children.forEach(compact);
    writeFileSync(`${folder}${filename}.json`, JSON.stringify({ id: filename, name, root: group(`${filename}-root`, name, children) }, null, 2) + '\n');
}

// A small PNG writer keeps generation dependency-free.
function crc32(buffer) {
    let crc = -1;
    for (const byte of buffer) { crc ^= byte; for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
    return (crc ^ -1) >>> 0;
}
function png(path, size, pixel) {
    const chunk = (type, data) => {
        const tag = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
        length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([tag, data])));
        return Buffer.concat([length, tag, data, checksum]);
    };
    const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
    const data = Buffer.alloc(size * (1 + size * 3));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const rgb = pixel(x, y); const i = y * (1 + size * 3) + 1 + x * 3;
        rgb.forEach((v, c) => { data[i + c] = Math.max(0, Math.min(255, Math.round(v))); });
    }
    writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(data)), chunk('IEND', Buffer.alloc(0))]));
}
const size = 512;
const noise = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
function smoothNoise(x, y, cells) {
    const u = x / size * cells, v = y / size * cells;
    const ix = Math.floor(u), iy = Math.floor(v);
    const fade = value => value * value * (3 - 2 * value);
    const tx = fade(u - ix), ty = fade(v - iy);
    const at = (dx, dy) => noise((ix + dx) % cells, (iy + dy) % cells);
    return (at(0, 0) * (1 - tx) + at(1, 0) * tx) * (1 - ty)
        + (at(0, 1) * (1 - tx) + at(1, 1) * tx) * ty;
}
function height(x, y) {
    x = (x + size) % size; y = (y + size) % size;
    const pore = noise(x, y);
    const seam = y % 128 < 2 ? -0.1 : 0;
    const hole = Math.hypot((x + 64) % 128 - 64, (y + 32) % 128 - 64) < 3 ? -0.22 : 0;
    return pore * 0.035 + seam + hole;
}
png(`${textures}formwork.png`, size, (x, y) => {
    const grain = noise(x, y) * 18;
    const cloud = (smoothNoise(x, y, 8) - 0.5) * 22 + (smoothNoise(x, y, 32) - 0.5) * 8;
    const streak = (noise(Math.floor(x / 3), 0) - 0.5) * 2;
    const v = 183 + grain + cloud + streak + height(x, y) * 145;
    return [v + 3, v + 2, v];
});
png(`${textures}formwork-normal.png`, size, (x, y) => [128 + (height(x - 1, y) - height(x + 1, y)) * 240, 128 + (height(x, y - 1) - height(x, y + 1)) * 240, 255]);

const svg = (file, content) => writeFileSync(`${textures}${file}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="512" viewBox="0 0 256 512">${content}</svg>`);
svg('sector', '<rect width="256" height="512" fill="#253838"/><path d="M18 16h220v480H18z" fill="none" stroke="#80d4ce" stroke-width="3"/><text x="128" y="70" text-anchor="middle" fill="#8cdbd0" font-family="monospace" font-size="25">SECTOR</text><text x="128" y="212" text-anchor="middle" fill="#c0e5ce" font-family="sans-serif" font-size="148" font-weight="bold">09</text><path d="M45 268h166M45 280h166" stroke="#80d4ce" stroke-width="3"/><text x="128" y="337" text-anchor="middle" fill="#8cdbd0" font-family="monospace" font-size="22">TRANSIT</text><path d="M128 382v70m-24-24 24 24 24-24" fill="none" stroke="#b4e5d8" stroke-width="10"/>');
svg('habitat', '<rect width="256" height="512" fill="#382e25"/><rect x="14" y="14" width="228" height="484" fill="none" stroke="#d39a61" stroke-width="3"/><text x="128" y="70" text-anchor="middle" fill="#f9bd7c" font-family="monospace" font-size="26">HABITAT</text><text x="128" y="206" text-anchor="middle" fill="#f2ce98" font-family="sans-serif" font-weight="bold" font-size="130">24</text><text x="128" y="280" text-anchor="middle" fill="#dda16a" font-family="monospace" font-size="23">RESIDENTIAL</text><path d="M48 324h160M48 340h160M48 356h160" stroke="#b88758" stroke-width="6"/><text x="128" y="440" text-anchor="middle" fill="#f9bd7c" font-family="monospace" font-size="22">LEVEL 08</text>');

// Front faces +Z. Each kit turns toward the central canyon when placed.
function tower(variant) {
    const width = [22, 27, 20][variant], depth = [23, 20, 26][variant], floors = [13, 17, 11][variant];
    const step = 5.4, base = 6, top = base + floors * step;
    const children = [];
    const add = (...args) => children.push(mesh(...args));
    const maintenanceFloors = variant === 2 ? [3, 9] : [2, 8];
    const clearWidth = width - 4;
    const coreFront = depth / 2 - 3.5;
    add('Recessed service core', [0, top / 2, -2], [width - 3, top, depth - 3], 'dark');
    for (const x of [-width / 2 + 1, width / 2 - 1]) {
        add('Full-height concrete buttress', [x, top / 2, 0], [2, top + 3, depth + 1], 'concrete');
        add('Buttress cap', [x, top + 2, 0], [3, 1, depth + 2], 'pale');
    }
    // The terrace is at +3 m. Give it a continuous landing and a usable doorway
    // below the first apartment slab instead of a blank, unsupported ground bay.
    add('Entrance plinth', [0, 1.32, depth / 2 - 1], [clearWidth, 2.64, 5.5], 'dark');
    add('Entrance landing', [0, 2.84, depth / 2 - 1], [clearWidth, 0.4, 5.5], 'concrete');
    add('Recessed entrance doors', [0, 4.3, coreFront + 0.08], [2.4, 2.5, 0.12], 'glass');
    for (const x of [-1.27, 0, 1.27]) add('Entrance door frame', [x, 4.3, coreFront + 0.17], [0.12, 2.6, 0.16], 'metal');
    add('Entrance lintel', [0, 5.56, coreFront + 0.15], [2.7, 0.16, 0.22], 'metal');
    add('Entrance door header light', [0, 5.47, coreFront + 0.29], [2.4, 0.08, 0.1], variant === 1 ? 'cyan' : 'amber');
    add('Entrance ceiling light', [0, 5.58, depth / 2 - 0.8], [2.4, 0.08, 0.18], variant === 1 ? 'cyan' : 'amber');
    // Deep slab edges, recessed window bays, staggered projecting apartments.
    for (let f = 0; f < floors; f++) {
        const y = base + f * step;
        const projectingRoom = f % 3 === variant % 3;
        const roomX = (f % 2 ? 1 : -1) * width * 0.21;
        add('Exposed floor plate', [0, y, 0], [width + 0.8, 0.72, depth + 2], f % 4 === 0 ? 'pale' : 'concrete');
        add('Shadowed gallery', [0, y + 2.5, depth / 2 - 1.5], [width - 3, 3.8, 0.5], 'glass');
        const bays = 5;
        for (let b = 0; b < bays; b++) {
            const x = (b - 2) * (width - 4) / bays;
            const lit = (f * 13 + b * 7 + variant) % 9 < 3;
            const paneWidth = (width - 5) / bays - 0.3;
            const buriedInRoom = (center, halfWidth) => projectingRoom
                && center - halfWidth > roomX - width * 0.215 && center + halfWidth < roomX + width * 0.215;
            if (!buriedInRoom(x, paneWidth / 2)) {
                add('Apartment glazing', [x, y + 2.4, depth / 2 - 1.15], [paneWidth, 2.3, 0.12], lit ? 'window' : 'glass');
                if (lit) add('Window center stile', [x, y + 2.4, depth / 2 - 1.06], [0.07, 2.3, 0.1], 'metal');
            }
            const finX = x - (width - 4) / bays / 2;
            if (!buriedInRoom(finX, 0.12)) add('Window mullion', [finX, y + 2.5, depth / 2 - 0.5], [0.24, 4.5, 1.9], 'concrete');
        }
        if (projectingRoom) {
            const x = roomX;
            add('Cantilevered concrete room', [x, y + 2.46, depth / 2 + 1.2], [width * 0.43, 4.2, 4.4], 'concrete');
            add('Inset cantilever window', [x, y + 2.8, depth / 2 + 3.42], [width * 0.3, 1.7, 0.1], f % 2 ? 'window' : 'glass');
            add('Window eyebrow', [x, y + 3.9, depth / 2 + 3.7], [width * 0.38, 0.3, 0.8], 'pale');
        }
        // Rails stop at room walls; maintenance decks open directly off the gallery.
        const railRanges = maintenanceFloors.includes(f) ? [] : projectingRoom
            ? [[-clearWidth / 2, roomX - width * 0.215], [roomX + width * 0.215, clearWidth / 2]]
            : [[-clearWidth / 2, clearWidth / 2]];
        for (const [left, right] of railRanges) if (right - left > 0.5) {
            add('Gallery guardrail', [(left + right) / 2, y + 0.95, depth / 2 + 0.7], [right - left, 1.1, 0.35], 'dark');
        }
        if (f % 4 === 1) add('Gallery utility light', [0, y + 0.3, depth / 2 + 1.06], [width - 4, 0.1, 0.12], variant === 1 ? 'cyan' : 'amber');
        // The end wall matters just as much as the front in a moving camera shot.
        add('End-wall horizontal joint', [width / 2 + 0.06, y + 2, 0], [0.14, 0.12, depth], 'dark');
    }
    add('Roof slab', [0, top + 0.36, 0], [width + 0.8, 0.72, depth + 2], 'concrete');
    for (let i = 0; i < 3; i++) {
        const x = -width / 2 - 0.3, z = depth / 2 - 0.5 - i * 0.55;
        add('External riser pipe', [x, (top + 0.72) / 2, z], [0.18, top + 0.72, 0.18], i === 1 ? 'rust' : 'metal', [0, 0, 0], 'cylinder', [1, 1, 1, 8]);
        for (let y = 8; y < top; y += 14) add('Pipe bracket', [-width / 2 - 0.15, y, z], [0.6, 0.16, 0.4], 'metal');
    }
    for (let i = 0; i < 4; i++) {
        add('Rooftop plant enclosure', [(i - 1.5) * 3.6, top + 2.12, -2], [2.6, 2.8, 5], 'metal');
        add('Plant louvre', [(i - 1.5) * 3.6, top + 2.12, 0.56], [2.2, 1.5, 0.12], 'dark');
    }
    add('Antenna mast', [width / 3, top + 8, -5], [0.2, 14, 0.2], 'metal');
    add('Aircraft warning beacon', [width / 3, top + 15, -5], [0.45, 0.45, 0.45], 'red');
    const signX = width / 2 - 1, signY = base + 4 * step;
    for (const offset of [-3, 3]) add('Sign stand-off bracket', [signX, signY + offset, depth / 2 + 1.95], [0.25, 0.3, 2.9], 'metal');
    add('Sign mounting frame', [signX, signY, depth / 2 + 3.65], [3.4, 8.5, 0.5], 'metal');
    add('Sign illuminated edge', [signX - 1.64, signY, depth / 2 + 3.96], [0.1, 8.2, 0.1], variant === 1 ? 'cyan' : 'amber');
    children.push(sign('Illuminated district sign', [signX, signY, depth / 2 + 3.91], 3, 8, variant === 1 ? 'sector' : 'habitat'));
    // Align maintenance decks to floor plates and carry loads back into the piers.
    for (const floor of maintenanceFloors) {
        const y = base + floor * step, span = width - 1.5;
        add('Projecting maintenance platform', [0, y, depth / 2 + 2], [span, 0.7, 6], 'dark');
        add('Maintenance platform edge', [0, y + 0.9, depth / 2 + 4.85], [span, 1.1, 0.25], 'concrete');
        for (const side of [-1, 1]) {
            add('Maintenance return guard', [side * (span / 2 - 0.125), y + 0.9, depth / 2 + 2], [0.25, 1.1, 5.7], 'concrete');
            const x = side * (width / 2 - 1.25);
            const from = [x, y - 4.2, depth / 2 + 0.75], to = [x, y - 0.55, depth / 2 + 4.4];
            const dy = to[1] - from[1], dz = to[2] - from[2];
            add('Diagonal concrete bearing', from.map((v, axis) => (v + to[axis]) / 2), [0.65, Math.hypot(dy, dz), 0.85], 'concrete', [Math.atan2(dz, dy), 0, 0]);
            add('Bearing wall shoe', [x, from[1], depth / 2 + 0.6], [1.1, 1, 0.4], 'metal');
            add('Bearing deck seat', [x, y - 0.475, to[2]], [1.1, 0.25, 0.75], 'metal');
        }
    }
    writePrefab(`habitat-${variant + 1}`, `Vertical habitat ${variant + 1}`, children);
}
for (let i = 0; i < 3; i++) tower(i);

const city = [];
const add = (...args) => city.push(mesh(...args));
add('Lower service boulevard', [0, -0.7, -110], [190, 1.4, 320], 'road');
for (const side of [-1, 1]) {
    add('Raised pedestrian terrace', [side * 17, 1.5, -110], [7, 3, 320], 'dark');
    add('Terrace coping', [side * 13.65, 3.05, -110], [0.4, 0.35, 320], 'pale');
    add('Continuous drainage channel', [side * 10.8, 0.1, -110], [0.35, 0.12, 320], 'metal');
    for (let row = 0; row < 8; row++) {
        const z = 32 - row * 40;
        const variant = (row + (side === 1 ? 1 : 0)) % 3 + 1;
        city.push({ id: `habitat-${side}-${row}`, name: `Habitat ${side === 1 ? 'east' : 'west'} ${row + 1}`, components: {
            transform: transform([side * (32 + (row % 3 === 1 ? 2 : 0)), 0, z], [1, 1 + (row % 3) * 0.08, 1], [0, -side * Math.PI / 2, 0]),
            prefab: component('PrefabRef', { url: `/prefabs/brutalist-city/habitat-${variant}.json` }),
        } });
        // Meet stretched building landings without overlapping the terrace surface.
        const landingHeight = 3.04 * (1 + row % 3 * 0.08), rise = landingHeight - 3;
        const stairCount = Math.max(1, Math.ceil(rise / 0.18)), stairFront = [23, 20, 26][variant - 1] / 2 + 1.75;
        city.push(group(`entry-steps-${side}-${row}`, 'Entrance approach steps', Array.from({ length: stairCount }, (_, index) => {
            const height = rise * (index + 1) / stairCount;
            return mesh('Entrance approach tread', [0, 3 + height / 2, stairFront + (stairCount - index - 0.5) * 0.35], [2.8, height, 0.35], 'concrete');
        }), [side * (32 + (row % 3 === 1 ? 2 : 0)), 0, z], [0, -side * Math.PI / 2, 0]));
        // Farther towers form a second, taller layer above the street wall.
        const backX = side * (66 + row % 2 * 12), backHeight = 132 + row % 3 * 16;
        add('Distant megastructure', [backX, backHeight / 2, z - 12], [22, backHeight, 27], 'dark');
        for (let h = 25; h < backHeight - 2; h += 12) add('Distant facade rib', [backX, h, z - 12], [25, 0.6, 29], 'concrete');
        add('Street luminaire housing', [side * 14, 9, z - 7], [0.4, 0.6, 3], 'metal');
        add('Street luminaire lens', [side * 14, 8.65, z - 7], [0.3, 0.12, 2.6], 'amber');
        add('Street lamp post', [side * 14.5, 5.8, z - 7], [0.2, 6.5, 0.2], 'metal');
        add('Luminaire mounting arm', [side * 14.25, 9, z - 7], [0.8, 0.24, 0.25], 'metal');
        for (let dash = 0; dash < 3; dash++) add('Boulevard lane marker', [side * 6, 0.03, z + dash * 11], [0.12, 0.04, 3], 'pale');
    }
}
// Crossings at different levels provide an immediate sense of a vertical city.
for (const [i, row, floor] of [[0, 1, 5], [1, 3, 9], [2, 5, 4], [3, 7, 10]]) {
    const z = 32 - row * 40, stretch = 1 + row % 3 * 0.08;
    const y = (6 + floor * 5.4 + 0.36) * stretch - 0.85;
    const setback = 32 + (row % 3 === 1 ? 2 : 0);
    const walls = [-1, 1].map(side => side * (setback - [23, 20, 26][(row + (side === 1 ? 1 : 0)) % 3] / 2 - 0.5));
    const center = (walls[0] + walls[1]) / 2, span = walls[1] - walls[0] + 4;
    add('Suspended transit deck', [center, y, z], [span, 1.7, 5.8], 'concrete');
    for (const edge of [-1, 1]) {
        add('Skybridge parapet', [center, y + 1.6, z + edge * 2.8], [span, 1.8, 0.5], 'dark');
        add('Skybridge handrail light', [center, y + 2.55, z + edge * 2.8], [span - 1, 0.11, 0.15], i % 2 ? 'cyan' : 'amber');
        for (let x = center - span / 2 + 2; x <= center + span / 2 - 2; x += 7) add('Bridge vertical support', [x, y + 3, z + edge * 2.8], [0.22, 4, 0.22], 'metal');
    }
    add('Skybridge canopy', [center, y + 5, z], [span, 0.4, 6.2], 'pale');
    add('Transit undercroft luminaire', [center, y - 0.9, z + 2], [span - 8, 0.12, 0.35], i % 2 ? 'cyan' : 'amber');
    for (let side = 0; side < 2; side++) add('Bridge bearing', [walls[side] + (side ? 0.3 : -0.3), y - 2.2, z], [3, 3.2, 7], 'dark');
    // Two localized pools per chunk, rather than a real light for every emissive strip.
    if (i < 2) city.push(light(`bridge-bounce-${i}`, [center, y - 2, z], i % 2 ? '#6fbfca' : '#ffd09b', 550, 43, [0, -24, 0]));
}
// Bundled utility runs crossing the street below the main bridges.
for (const z of [-46, -208]) for (let p = 0; p < 3; p++) {
    add('Cross-canyon service pipe', [0, 19 + p * 0.9, z], [0.3, 44, 0.3], p === 1 ? 'rust' : 'metal', [0, 0, Math.PI / 2], 'cylinder', [1, 1, 1, 10]);
}
city.push(light('Transit sign cyan spill', [-17, 23, -47], '#68c8ca', 360, 31));
city.push(light('Service terrace amber spill', [17, 14, -145], '#ffc18a', 280, 28));
city.push(JSON.parse(readFileSync(new URL('./home-city/arrival.json', import.meta.url), 'utf8')));
writePrefab('city-chunk', 'Sector 09 / stacked concrete city', city);

// Keep the original entry scene and its stable node IDs for editor links.
const level = JSON.parse(readFileSync(`${folder}game-level.json`, 'utf8'));
level.name = 'Sector 09 / vertical city';
const nodes = level.root.children;
const env = nodes.find(n => n.components?.environment);
env.components.environment.properties = { intensity: 0.14, backgroundIntensity: 0.12, backgroundBlurriness: 0.25, resolution: 128 };
env.children[0].components.sky = component('Sky', { sunPosition: [-60, 30, 45], size: 450, turbidity: 8, rayleigh: 1.2, mieCoefficient: 0.005, mieDirectionalG: 0.8, sunDisc: false });
level.root.components.renderSettings = component('RenderSettings', { toneMapping: 'agx', exposure: 1.05, outputColorSpace: 'srgb', shadows: true, shadowMapType: 'pcf' });
level.root.components.postProcessing = component('PostProcessing', { ambientOcclusion: true, ambientOcclusionRadius: 2.5, ambientOcclusionIntensity: 0.8, bloom: true, bloomStrength: 0.22, bloomRadius: 0.45, bloomThreshold: 1.1 });
const hemi = nodes.find(n => n.id === 'brutalist-ambient-fill');
hemi.components.ambientLight.properties = { skyColor: '#a7bbc7', groundColor: '#444b50', intensity: 0.32 };
const sun = nodes.find(n => n.id === 'brutalist-directional-sun');
sun.components.transform.properties.position = [-60, 90, 35];
Object.assign(sun.components.directionalLight.properties, { color: '#ffe4c2', intensity: 2.5, targetOffset: [60, -90, -35], shadowDistance: 210, shadowNormalBias: 0.08 });
const camera = nodes.find(n => n.components?.camera);
camera.components.transform.properties.position = [0, 17, 55];
camera.components.transform.properties.rotation = [-0.12, 0, 0];
Object.assign(camera.components.camera.properties, { fov: 60, far: 420 });
delete camera.components.constantVelocity;
camera.components.flythrough = component('Runtime', {
    data: { speed: 2.6 },
    update: readFileSync(new URL('./home-city/flythrough.js', import.meta.url), 'utf8').trim(),
});
// Keep the pedestrian alongside the flythrough on the open boulevard.
const walker = {
    id: 'home-remilio-walker', name: 'Remilio / boulevard walk',
    components: {
        transform: transform([-7, 0.02, 25], [1.5, 1.5, 1.5], [0, Math.PI, 0]),
        model: component('SkinnedMesh', { filename: '/models/fps/pockit-remilio.glb', animationState: 'walk', castShadow: true, receiveShadow: true }),
        walk: component('Runtime', { data: { ...camera.components.flythrough.properties.data }, update: camera.components.flythrough.properties.update }),
    },
};
const previousWalker = nodes.findIndex(n => n.id === walker.id);
if (previousWalker >= 0) nodes[previousWalker] = walker; else nodes.push(walker);
nodes.find(n => n.id === 'city-fog').components.fog.properties = { color: '#71858a', near: 65, far: 330 };
level.root.components.chunkSettings = component('ChunkSettings', {
    batchCellSize: 24, cellSize: 64, visibleDistance: 245, preloadDistance: 300, unloadDistance: 360, maxNodesPerChunk: 96,
});
// One authored document: the editable prototype and its scripts travel together.
// Textures remain ordinary asset dependencies; no second scene JSON is requested.
const streamer = nodes.find(n => n.id === 'prefab-grid-streamer');
const prototype = JSON.parse(readFileSync(`${folder}city-chunk.json`, 'utf8')).root;
const embedded = new Set();
const embedHabitats = node => {
    const entry = Object.entries(node.components ?? {}).find(([, component]) => component.type === 'PrefabRef');
    if (entry) {
        const [key, component] = entry;
        const url = component.properties.url;
        if (url?.startsWith('/prefabs/brutalist-city/')) {
            const definition = JSON.parse(readFileSync(`${publicRoot}${url.slice(1)}`, 'utf8')).root;
            if (embedded.has(definition.id)) component.properties = { prefabId: definition.id };
            else {
                embedded.add(definition.id);
                definition.packed = true;
                delete node.components[key];
                (node.children ??= []).push(definition);
            }
        }
    }
    node.children?.forEach(embedHabitats);
};
embedHabitats(prototype);
prototype.packed = true;
streamer.children = [prototype];
streamer.components.prefabGridStreamer.properties.prefabId = prototype.id;
delete streamer.components.prefabGridStreamer.properties.url;
// A sampled diffuse probe adds colored, direction-dependent bounce in the recesses.
const probe = { id: 'home-diffuse-probe', name: 'Canyon diffuse light probe', components: { probe: component('DiffuseLightProbe', { intensity: 0.45, skyColor: '#a8bfc9', groundColor: '#62615b', directionality: 0.65, axis: [0, 0, 1] }) } };
const previousProbe = nodes.findIndex(n => n.id === probe.id);
if (previousProbe >= 0) nodes[previousProbe] = probe; else nodes.push(probe);
writeFileSync(`${folder}game-level.json`, JSON.stringify(level, null, 2) + '\n');
console.log(`Home city rebuilt: ${serial} authored meshes, three reusable habitats, concrete color/normal maps, two signs.`);
