/** Small, serializable entry points; detailed schemas stay behind describe* calls. */
export const sceneAgentHelp = {
    purpose: 'Inspect and edit the running application’s scene: a JSON document of nodes (scene objects) and component settings. Changes stay in memory until saved.',
    concepts: {
        component: 'React behavior made available by registerComponent; declares settings exposed in the inspector and API.',
        schema: 'Supported component settings, types and defaults.',
        revision: 'Scene version returned by a read; pass it when editing to avoid overwriting newer changes.',
        prefab: 'Reusable scene document storing component type names and settings, not React implementations.',
        batch: 'Document commands committed together as one update and one undo step.',
        liveState: 'Animation and physics change mounted objects, not the document. These changes do not advance document revisions or appear in exportScene; captureView and exportGLB capture live objects.',
    },
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
        setMode: 'await setMode({mode:"edit"|"play"}) — use the same mode action as the toolbar. Switching mode does not reset live state.',
        resetScene: 'await resetScene() — remount live prefab objects/behaviors from the current document, preserving mode, authored edits and undo. Clears selection; calls onResetScene for external host state. Asset loading may continue after return.',
        setSelection: 'setSelection({id:string|null}) — select an unlocked document node or clear selection; edit mode only.',
        getView: 'getView() — current camera position and orbit target in world coordinates.',
        setView: 'setView({position:[x,y,z],target:[x,y,z]}) — position the editor camera; edit mode only. Does not edit the document.',
        undo: 'undo({expectedRevision}) — undo the latest shared editor action; edit mode only.',
        redo: 'redo({expectedRevision}) — redo the latest undone action; edit mode only.',
        focusNode: 'focusNode({id}) — frame a mounted node; edit mode only.',
        captureView: 'await captureView() — PNG dataUrl, dimensions, revision and currentRevision; no editor HTML.',
        exportGLB: 'await exportGLB({filename?}) — request a browser GLB download, default scene.glb; returns downloadRequested, filename, mimeType and revisions. Does not confirm a file was saved.',
        screenshot: 'await screenshot({filename?}) — request a browser PNG download, default screenshot.png; clears selection and renders the current camera before capture. Returns download metadata and revisions.',
        exportScene: 'exportScene() — explicit full prefab export; does not save it.',
        saveScene: 'await saveScene({expectedRevision}) — call the function passed to PrefabEditor.onSaveScene if canSave; edit mode only.',
    },
    workflow: [
        'Inspect nodes and component schemas. If behavior is missing, register a React component in a module imported by the editor page, then reload and inspect its schema.',
        'In Edit mode, applyBatch with the revision from your read. Review captureView().dataUrl with your image tool, adjust, and call setMode({mode:"play"}) to check motion.',
        'Call setMode({mode:"edit"}); resetScene restores live objects to authored settings. If canSave, call saveScene; otherwise write exportScene().prefab to the scene file. Export alone does not save.',
    ],
    outputs: [
        'Wait for assets before capture/export. PNG excludes HTML but may include canvas helpers. If revision and currentRevision differ, read and capture again.',
        'Set a browser download listener before screenshot/exportGLB and check its result. GLB contains rendered prefab objects, not React behavior. GameCanvas/PrefabRoot alone do not expose this API; PrefabEditor showUI={false} does.',
    ],
    authoring: [
        'Group related nodes under a named parent; child transforms are relative to it. Use unique IDs and add parents before children.',
        'Repeated boxes: Geometry {geometryType:"box",args:[1,1,1]}, dimensions in Transform.scale, Mesh defaults (instanced:true). Matching built-in materials share automatically; reuse materialId for linked edits.',
        'Model.filename loads a known asset URL relative to basePath or a CORS-enabled absolute URL. Model keeps embedded materials; sibling Material does not override them.',
        'Inspect batch advisories or analyzeScene() for rendering/organization suggestions, not measured draw calls or FPS.',
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
        'Y up, XYZ Euler radians. Local transforms are relative to the parent; world transforms require position, rotation and scale.',
        'Read node.components keys before patchComponent; keys can differ from type names. On revision conflict, read again and adjust; validation does not lock the scene.',
        'After navigation or reload, use listEditors() and select editors[id] again. Query results are copies, not live references.',
    ],
};

export const sceneRegistryHelp = {
    purpose: 'Find an editor in this page, then ask it for help. Calls use ordinary page JavaScript; no MCP server is needed.',
    start: [
        'window.reactThreeGame.listEditors() // Discover IDs, names, modes and revisions.',
        'const api = window.reactThreeGame.editors[chosenId] // Choose from the discovered editors.',
        'api.help() // Methods, examples and saving instructions.',
    ],
    notes: 'Run these calls in the browser frame containing PrefabEditor. If window.reactThreeGame is absent, check that PrefabEditor has loaded and agentTools is not false. After reload, call listEditors() and select the editor again. getSceneInfo() reports document state, not whether files are saved or models have finished loading.',
};
