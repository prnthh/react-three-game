import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// =============================================================================
// 3D MODEL SCRATCHPAD — EDIT THIS SECTION
// =============================================================================
// Units: metres. Axes: X = left/right, Y = up, +Z = front. Rotations: radians.
// Every command starts with: material key, part name.
//
// box(    mat, name, [width, height, depth], position, rotation?)
// sphere( mat, name, radius, position, scale?)
// cylinder(mat, name, [topRadius, bottomRadius, height, sides], position, rotation?)
// torus(   mat, name, [radius, tube, tubeSides, ringSides], position, rotation?)
// prism(   mat, name, width, [[z,y], ...])       // extruded side silhouette
// side(    mat, name, x, [[z,y], ...])           // flat side decal/window
// quad(    mat, name, [[x,y,z], ...4 corners])   // flat 3D panel
//
// Smaller-model instruction: edit only MODEL, MATERIALS, and buildModel().
// Reuse the commands above; use loops for repeated/symmetrical parts.

// name = GLB root node. output = project-relative default path.
const MODEL = {
	name: "GeneratedModel",
	output: "docs/public/models/generated/model.glb",
	metadata: { style: "funky 1990s toon arcade racer", forwardAxis: "+Z", groundPlane: "Y=0" },
};

// materialKey: [GLB material name, color, optional settings]
const MATERIALS = {
	ink: ["toon ink", "#17152d"],
	body: ["electric teal body", "#20d6c7"],
	dark: ["deep teal body", "#087e8b"],
	purple: ["grape purple cabin", "#6d39c5"],
	pink: ["hot pink accents", "#ff3e9d"],
	yellow: ["sunny yellow accents", "#ffe14a"],
	orange: ["tangerine spoiler", "#ff7a2f"],
	glass: ["blue toon glass", "#215a83", { roughness: .25, metalness: .15, doubleSide: true }],
	shine: ["windshield shine", "#83f4ff", { emissive: "#83f4ff", emissiveIntensity: .35, doubleSide: true }],
	rubber: ["chunky tires", "#191826", { roughness: 1 }],
	metal: ["cartoon chrome", "#b8c2c9", { roughness: .32, metalness: .65 }],
	white: ["warm white", "#fff8df"],
	head: ["glowing headlights", "#ffe14a", { emissive: "#ffe14a", emissiveIntensity: 1.35 }],
	tail: ["glowing taillights", "#ff294d", { emissive: "#ff294d", emissiveIntensity: 1.1 }],
};

function buildModel() {
	// Main silhouette.
	prism("body", "faceted body", 2.42, [
		[-2.22, .72], [2.2, .72], [2.3, 1.18], [1.72, 1.48], [.72, 1.66], [-1.25, 1.62], [-2.18, 1.34],
	]);
	prism("purple", "bubble cabin", 2.02, [
		[-1.28, 1.54], [.78, 1.54], [.3, 2.42], [-.7, 2.58], [-1.3, 2.02],
	]);

	// Chassis, hood, bumpers, lights and spoiler.
	box("ink", "shadow chassis", [2.28, .28, 4.45], [0, .62, 0]);
	box("pink", "sloping hood", [2.04, .11, 1.34], [0, 1.55, 1.38], [.19, 0, 0]);
	box("yellow", "hood stripe", [.35, .13, 1.42], [.12, 1.61, 1.36], [.19, .02, 0]);
	box("dark", "rear deck", [2.08, .13, .72], [0, 1.59, -1.68], [-.06, 0, 0]);
	box("ink", "front bumper", [2.6, .24, .27], [0, .72, 2.28]);
	box("ink", "bumper smile", [1.24, .27, .08], [0, .91, 2.435], [0, 0, .04]);
	box("ink", "rear bumper", [2.5, .24, .26], [0, .72, -2.3]);
	for (const x of [-.68, .68]) {
		box("tail", `${x < 0 ? "left" : "right"} taillight`, [.48, .22, .1], [x, 1.22, -2.23], [0, 0, x * .088]);
		box("orange", `${x < 0 ? "left" : "right"} spoiler support`, [.16, .62, .16], [x * 1.118, 1.83, -1.91], [.12, 0, x * .118]);
	}
	box("orange", "oversized spoiler", [2.62, .18, .54], [0, 2.12, -2.02], [-.08, 0, 0]);
	box("yellow", "spoiler stripe", [1.05, .2, .57], [.28, 2.13, -2.02], [-.08, 0, 0]);

	// Glass panels and reflections.
	quad("glass", "front windshield", [[-.87, 2.39, .33], [.87, 2.39, .33], [.94, 1.73, .73], [-.94, 1.73, .73]]);
	quad("glass", "rear windshield", [[.86, 2.42, -.72], [-.86, 2.42, -.72], [-.94, 1.83, -1.25], [.94, 1.83, -1.25]]);
	quad("shine", "windshield big shine", [[-.64, 2.34, .37], [-.45, 2.34, .37], [.12, 1.79, .7], [-.08, 1.79, .7]]);
	quad("shine", "windshield small shine", [[.32, 2.34, .37], [.47, 2.34, .37], [.63, 2.14, .49], [.48, 2.14, .49]]);
	const windows = [
		["front", [[.62, 1.72], [.25, 2.37], [-.18, 2.43], [-.12, 1.72]]],
		["rear", [[-.22, 1.72], [-.28, 2.44], [-.66, 2.5], [-1.18, 1.96], [-1.13, 1.72]]],
	];
	for (const x of [-1.015, 1.015]) for (const [name, points] of windows) {
		side("glass", `${x < 0 ? "left" : "right"} ${name} window`, x, points);
	}

	// Four chunky wheels. Low side counts keep the arcade look and triangle count down.
	for (const x of [-1.3, 1.3]) for (const z of [-1.55, 1.55]) {
		const name = `${x < 0 ? "left" : "right"} ${z > 0 ? "front" : "rear"}`;
		torus("rubber", `${name} tire`, [.49, .2, 7, 12], [x, .72, z], [0, Math.PI / 2, 0]);
		cylinder("metal", `${name} rim`, [.31, .31, .14, 8], [x * 1.138, .72, z], [0, 0, Math.PI / 2]);
		cylinder(z > 0 ? "yellow" : "pink", `${name} hubcap`, [.16, .19, .17, 6], [x * 1.204, .72, z], [0, 0, Math.PI / 2]);
		torus(z > 0 ? "yellow" : "pink", `${name} fender`, [.68, .055, 5, 12], [x * .942, .76, z], [0, Math.PI / 2, 0]);
	}

	// Asymmetric door decals.
	const bolt = [[-1, 1.42], [-.28, 1.45], [-.53, 1.2], [.42, 1.25], [-.55, .82], [-.29, 1.1], [-1.12, 1.08]];
	for (const x of [-1.268, 1.268]) side(x < 0 ? "yellow" : "pink", `${x < 0 ? "left" : "right"} lightning`, x, bolt);

	// Face-like nose, exhausts, mirrors and roof toys.
	for (const x of [-.68, .68]) {
		sphere("ink", `${x < 0 ? "left" : "right"} headlight rim`, .3, [x, 1.27, 2.3], [1.25, .78, .42]);
		sphere(x < 0 ? "head" : "pink", `${x < 0 ? "left" : "right"} headlight`, x < 0 ? .23 : .2, [x, 1.28, 2.39], [1.25, .74, .38]);
	}
	for (let i = 0; i < 4; i++) box("white", `grille tooth ${i + 1}`, [.18, .13, .06], [-.33 + i * .22, .93, 2.49], [0, 0, i % 2 ? -.1 : .1]);
	for (const x of [-.72, .72]) {
		cylinder("metal", "fat exhaust", [.16, .19, .54, 8], [x, .52, -2.35], [Math.PI / 2, 0, 0]);
		cylinder("ink", "exhaust opening", [.1, .1, .02, 8], [x, .52, -2.63], [Math.PI / 2, 0, 0]);
	}
	for (const x of [-1.24, 1.24]) sphere(x < 0 ? "pink" : "yellow", `${x < 0 ? "left" : "right"} mirror`, .22, [x, 1.92, .36], [1.2, .72, .85]);
	prism("yellow", "roof scoop", .64, [[-.42, 2.57], [.34, 2.57], [.18, 2.84], [-.28, 2.82]]);
	cylinder("ink", "wobble antenna", [.025, .035, .94, 6], [.58, 3, -.55], [0, 0, -.24]);
	sphere("pink", "antenna ball", .13, [.69, 3.45, -.55]);
}

// =============================================================================
// ENGINE / GLB EXPORT — USUALLY DO NOT EDIT BELOW THIS LINE
// =============================================================================

class NodeFileReader {
	readAsArrayBuffer(blob) {
		blob.arrayBuffer().then((result) => {
			this.result = result;
			this.onloadend?.();
		}, (error) => this.onerror?.(error));
	}
}
globalThis.FileReader ??= NodeFileReader;

const materials = Object.fromEntries(Object.entries(MATERIALS).map(([key, [name, color, settings = {}]]) => {
	const { doubleSide, ...rest } = settings;
	const material = new THREE.MeshStandardMaterial({
		color, roughness: .82, metalness: 0, flatShading: true,
		side: doubleSide ? THREE.DoubleSide : THREE.FrontSide, ...rest,
	});
	material.name = name;
	return [key, material];
}));

const buckets = new Map();
function addPart(matKey, name, geometry, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
	const material = materials[matKey];
	if (!material) throw new Error(`Unknown material "${matKey}" on part "${name}"`);
	const transform = new THREE.Object3D();
	transform.position.fromArray(position); transform.rotation.set(...rotation); transform.scale.fromArray(scale);
	transform.updateMatrix(); geometry.applyMatrix4(transform.matrix); geometry.deleteAttribute("uv");
	const bucket = buckets.get(material) ?? { geometries: [], names: [] };
	bucket.geometries.push(geometry); bucket.names.push(name); buckets.set(material, bucket);
}

function box(mat, name, size, position, rotation) {
	addPart(mat, name, new THREE.BoxGeometry(...size), position, rotation);
}
function sphere(mat, name, radius, position, scale) {
	addPart(mat, name, new THREE.SphereGeometry(radius, 8, 6), position, undefined, scale);
}
function cylinder(mat, name, dimensions, position, rotation) {
	addPart(mat, name, new THREE.CylinderGeometry(...dimensions, 1), position, rotation);
}
function torus(mat, name, dimensions, position, rotation) {
	addPart(mat, name, new THREE.TorusGeometry(...dimensions), position, rotation);
}
function prism(mat, name, width, points) {
	const n = points.length;
	const positions = [-width / 2, width / 2].flatMap((x) => points.flatMap(([z, y]) => [x, y, z]));
	const faces = THREE.ShapeUtils.triangulateShape(points.map(([z, y]) => new THREE.Vector2(z, y)), []);
	const indices = faces.flatMap(([a, b, c]) => [a, b, c, n + c, n + b, n + a]);
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		indices.push(i, n + i, n + j, i, n + j, j);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices); geometry.computeVertexNormals(); addPart(mat, name, geometry);
}
function side(mat, name, x, points) {
	const faces = THREE.ShapeUtils.triangulateShape(points.map(([z, y]) => new THREE.Vector2(z, y)), []);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flatMap(([z, y]) => [x, y, z]), 3));
	geometry.setIndex(faces.flatMap(([a, b, c]) => x > 0 ? [c, b, a] : [a, b, c]));
	geometry.computeVertexNormals(); addPart(mat, name, geometry);
}
function quad(mat, name, corners) {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners.flat(), 3));
	geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals(); addPart(mat, name, geometry);
}

buildModel();
const root = new THREE.Group();
root.name = MODEL.name;
root.userData = MODEL.metadata;
let triangles = 0;
for (const [material, { geometries, names }] of buckets) {
	const geometry = mergeGeometries(geometries, false);
	if (!geometry) throw new Error(`Could not merge material "${material.name}"`);
	triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
	geometry.computeBoundingBox(); geometry.computeBoundingSphere();
	const mesh = new THREE.Mesh(geometry, material);
	mesh.name = material.name; mesh.userData.parts = names; root.add(mesh);
	geometries.forEach((item) => item.dispose());
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const fallback = path.join(repoRoot, MODEL.output);
const requested = process.argv[2] ? path.resolve(process.argv[2]) : fallback;
const output = path.extname(requested).toLowerCase() === ".glb"
	? requested
	: path.join(requested, path.basename(MODEL.output));
await mkdir(path.dirname(output), { recursive: true });
const glb = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
await writeFile(output, Buffer.from(glb));
const partCount = [...buckets.values()].reduce((sum, bucket) => sum + bucket.names.length, 0);
console.log(`Wrote ${output}`);
console.log(`${triangles.toLocaleString()} triangles, ${root.children.length} merged meshes, ${partCount} detailed parts`);
