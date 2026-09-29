/** Small, serializable entry points; detailed schemas stay behind describe* calls. */
export const sceneAgentHelp = {
    purpose: 'Inspect and edit the mounted scene document. Gameplay simulation belongs to the host.',
    start: [
        'api.getSceneInfo() // Check mode, revision, selection, history and canSave.',
        'api.findNodes({ name: "wall", limit: 20 }) // Inspect matches before choosing IDs.',
        'api.getNodes({ ids: [id], resolved: true }) // Read instance keys and properties.',
        'api.describeComponents() // Registered types; request { names: [...] } for fields and defaults.',
        'api.describeCommands() // Command semantics and JSON Schema.',
    ],
    methods: {
        help: 'help() — this compact guide; no scene changes.',
        analyzeScene: 'analyzeScene() — document counts and bounded rendering/organization advice; not measured draw calls or FPS.',
        getSceneInfo: 'getSceneInfo() — mode, revision, rootId, selection, nodeCount, canUndo, canRedo, canSave.',
        findNodes: 'findNodes({name?, component?, parentId?, offset?, limit?}) — summaries; parentId matches direct children.',
        getNodes: 'getNodes({ids, depth?, limit?, resolved?}) — chosen nodes and optional resolved component defaults.',
        describeComponents: 'describeComponents({names?, properties?}) — registered types, editable fields and evaluated defaults.',
        describeCommands: 'describeCommands() — all command inputs and their semantics.',
        getMaterials: 'getMaterials({ids?, offset?, limit?}) — summaries, or full definitions for chosen IDs.',
        validateBatch: 'validateBatch({expectedRevision, commands}) — read-only validation plus authoring advisories; throws on invalid input.',
        applyBatch: 'applyBatch({expectedRevision, commands}) — atomic edits, one shared UI undo step plus authoring advisories; edit mode only.',
        undo: 'undo({expectedRevision}) — undo the latest shared editor action; edit mode only.',
        redo: 'redo({expectedRevision}) — redo the latest undone action; edit mode only.',
        focusNode: 'focusNode({id}) — frame a mounted node; edit mode only.',
        captureView: 'await captureView() — PNG dataUrl, dimensions, revision and currentRevision; no editor HTML.',
        exportScene: 'exportScene() — explicit full prefab export; does not save it.',
        saveScene: 'await saveScene({expectedRevision}) — call the host save adapter if canSave; edit mode only.',
    },
    authoring: [
        'Start with a named group under an inspected parent. Create stable IDs, local child transforms, then reuse or move the assembly.',
        'Repeated boxes: Geometry {geometryType:"box",args:[1,1,1]}, dimensions in Transform.scale, Mesh defaults (instanced:true), and one shared Material.materialId.',
        'Import an existing mesh with Model.filename; discover fields via describeComponents({names:["Model","Material","Geometry","Mesh"]}). Use real known asset URLs, not invented filenames.',
        'Define a shared material with the material command: {color:"#999999",texture:"/textures/stone.jpg",roughness:0.9}. Reuse materialId and exact asset URLs. Model keeps its embedded materials; a sibling Material does not override arbitrary imported submeshes.',
        'URL assets use the editor basePath or absolute CORS-enabled URLs. They load asynchronously; command validation cannot verify fetches or visual results. The host owns its asset catalog/uploads.',
        'Read advisories on validateBatch/applyBatch, or call analyzeScene(). Compatible meshes batch automatically; selection, events, skinning and material differences can prevent batching.',
        'Detailed examples: https://prnth.com/react-three-game/editor/agents',
    ],
    example: `// After inspecting matches, pass a chosen node ID and its new name.
async function renameNode(id, name) {
    const read = api.getNodes({ ids: [id] });
    const batch = {
        expectedRevision: read.revision,
        commands: [{ op: 'update', id, patch: { name } }],
    };
    api.validateBatch(batch);
    const result = api.applyBatch(batch);
    const image = await api.captureView();
    return { result, image }; // Review before saving. Do not auto-undo other users' work.
}`,
    rules: [
        'Y up; XYZ Euler rotations in radians. Units are host-defined. Local transforms are relative to the parent; world transforms require position, rotation and scale.',
        'Prefer targeted reads and small patches over full JSON. Component keys identify instances, not types; inspect them before patching.',
        'Group assemblies under a named parent with stable IDs. Add parents before children; move the parent to reposition the assembly.',
        'A revision conflict means reread affected nodes and replan. Validation does not reserve a revision.',
        'Edits affect memory and shared UI history, not disk. Check canSave; await saveScene and check its result, or use exportScene with a host-owned persistence workflow.',
        'Capture and focus require a mounted canvas/object. A document can be available before models finish loading. Review the viewport; schema validation does not prove playability.',
        'Reacquire the editor after navigation, remount or hot reload. API results are copies, not live references.',
    ],
};

export const sceneRegistryHelp = {
    purpose: 'Find an editor in this page, then ask it for help. Calls use ordinary page JavaScript; no MCP server is needed.',
    start: [
        'window.reactThreeGame.listEditors() // Discover IDs, names, modes and revisions.',
        'const api = window.reactThreeGame.editors[chosenId] // Choose from the discovered editors.',
        'api.help() // Methods, workflow, example and persistence rules.',
    ],
    notes: 'Use the editor frame’s JavaScript context. An absent registry means it has not mounted or agent tools are disabled. Reacquire after navigation/remount. Call getSceneInfo() for current document status; it does not report unsaved-file state or asset readiness.',
};
