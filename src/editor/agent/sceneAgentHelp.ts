import { sceneAgentKnowledge, sceneApiOperations, type SceneApiOperation } from './sceneAgentKnowledge.js';

/** JS presentation of the shared editor knowledge. Schemas stay discoverable at runtime. */
export const sceneAgentHelp = {
    ...sceneAgentKnowledge,
    workflow: sceneAgentKnowledge.workflow.map(step => ({ intent: step.intent, methods: step.methods.map(name => 'scene.' + name) })),
    methods: Object.fromEntries(Object.entries(sceneApiOperations).map(([name, operation]) => [name, operation.signature + ' — ' + operation.description])) as Record<SceneApiOperation, string>,
    start: [
        'scene.find({ query: "north wall" }) // Fast path when one node should match; returns placement and ID.',
        'scene.search({ query: "wall", limit: 20 }) // Broaden the search when the name is ambiguous.',
        'scene.get({ id, resolved: true }) // Read full properties only when the search summary is insufficient.',
        'scene.look({ id }) // Bring the mounted object into view directly from a search result.',
        'scene.update({ id, transform: { position: [x, y, z] } }) // Edit metadata, transform and components together.',
        'await scene.capture({ helpers: false }) // Review with the current view, then repeat the loop.',
        'await scene.capture({ mode: "wireframe", fov: 55, position: [8, 6, 4], target: [0, 1, 0] }) // Capture-only overrides.',
    ],
    example: `// Find, look, update and review without a redundant inspection read.
async function placeExistingNode(query, position) {
    const before = scene.find({ query }).node;
    const id = before.id;
    scene.look({ id });
    const result = scene.update({ id, transform: { position } });
    scene.look({ id });
    const image = await scene.capture({ helpers: false });
    return { before, result, image }; // Review before saving. undo() remains available.
}`,
};
