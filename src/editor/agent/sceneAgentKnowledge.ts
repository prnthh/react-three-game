/** Shared editor semantics and operation descriptions. Interface adapters add syntax, not new authoring rules. */
export const sceneAgentKnowledge = {
    purpose: "Inspect and edit the running application’s scene: a JSON document of nodes (scene objects) and component settings. The host controls persistence; edits share the editor’s undo history.",
    concepts: {
        node: "A scene object with a stable ID, metadata, keyed components and child nodes. Parent/child relationships form the scene hierarchy.",
        component: "A registered node feature with editable settings. Its type selects the implementation; its properties supply authored values.",
        schema: "Supported component settings, types and defaults.",
        revision: "Visible scene version for guarded writes, history and advanced coordination. Normal individual edits use the current version automatically.",
        prefab: "Reusable scene document storing component type names and settings, not React implementations.",
        batch: "Document commands committed together as one update and one undo step.",
        liveState: "Animation and physics change mounted objects, not the authored document or its revision. Document exports contain authored values; images and geometry captures show mounted state.",
        componentKey: "A component entry key identifies an instance on a node and can differ from its registered type name. Inspect existing keys before patching or removing a component.",
        material: "A named material definition can be reused by name. Editing a shared definition affects every user; a Model retains embedded materials unless its component explicitly supports overrides.",
        view: "The editor camera and selection are navigation state. Moving the editor view does not author a scene camera or change the document."
    },
    workflow: [
        {
            "intent": "Orient to the active document, mode and available persistence before editing.",
            "methods": [
                "info"
            ]
        },
        {
            "intent": "Find an existing object by a unique query, or search to explore. Search summaries often contain enough placement and component information to edit directly; read full objects only when needed.",
            "methods": [
                "find",
                "search",
                "get",
                "getMany"
            ]
        },
        {
            "intent": "Discover component settings and defaults before using unfamiliar fields; discover configured assets and shared materials when relevant. Do not guess schemas.",
            "methods": [
                "components",
                "assets",
                "materials"
            ]
        },
        {
            "intent": "Focus the subject and prefer a suitable existing object. Use one object edit for a small change; use a batch when dependent changes must commit together. Validate complex batches before applying them.",
            "methods": [
                "look",
                "update",
                "create",
                "validate",
                "batch"
            ]
        },
        {
            "intent": "If an edit fails, read the actual error and relevant schema, then correct the request. A revision conflict requires reading the current state before retrying.",
            "methods": [
                "info",
                "components",
                "get",
                "getMany"
            ]
        },
        {
            "intent": "Frame and capture the result, review it, then iterate. Test behavior in play mode when needed. Schema validation and document advisories do not judge visual or behavioral quality.",
            "methods": [
                "look",
                "capture",
                "setMode"
            ]
        },
        {
            "intent": "Save through the configured host callback, or export the complete JSON for the caller to persist. Checkpoint before loading another document. Completed edits remain in shared undo history.",
            "methods": [
                "save",
                "export",
                "exportJSON",
                "load",
                "undo",
                "redo"
            ]
        }
    ],
    outputs: [
        "PNG captures exclude HTML and can hide editor helpers. Temporary capture overrides do not change the editor camera or authored materials. If capture revision and currentRevision differ, inspect and capture again.",
        "Geometry exports contain rendered objects, not React behavior. A document commit can finish before its assets mount; wait for the relevant objects before capturing or exporting mounted geometry."
    ],
    authoring: [
        "Components with scope:scene belong on the outer scene root. Prefab copies inherit that configuration. Unspecified render settings keep renderer defaults; effects and chunking are authored separately.",
        "An empty document supplies no authored lights. Standard/physical materials need illumination from lights or an environment. Add appropriate lighting before judging a new scene; an unlit capture helps diagnose missing lighting.",
        "Group related nodes under a named parent; child transforms are relative to it. Use unique IDs and add parents before children.",
        "Inspect nearby peers before composing a node. Preserve the scene’s conventions for component ownership, hierarchy, naming and the distinction between functional objects and visual-only details.",
        "Prefer a few well-placed objects over repeated decoration. Reuse the scene’s established visual language rather than introducing a new one implicitly.",
        "Document advisories cover bounded structure and rendering hints. Review captures and test behavior to judge visual and behavioral correctness."
    ],
    rules: [
        "Y is up; rotations use XYZ Euler radians. Local transforms are relative to the parent. World transform edits require position, rotation and scale together.",
        "Individual edits use the current revision by default. Explicit revision guards reject conflicts without changes; atomic batches require the revision returned by scene inspection.",
        "Edit mode is required for document writes, history, selection and editor camera changes. Switching modes does not reset live state; reset remounts from the current authored document.",
        "Query results are copies, not live references. After reload or navigation, reacquire the editing interface."
    ]
};

export const sceneApiOperations = {
    load: {
        signature: "await load({url,expectedRevision?}, {signal?}?)",
        description: "Fetch fresh scene JSON through the host loader and replace the active document as one undo step. Validates before commit; rejects stale revisions, intervening edits, cancellation and exit from Edit. URL resolves against the host basePath. Persistence destination stays host-owned. Export/save a checkpoint before loading another document."
    },
    packMany: {
        signature: "packMany({ids,reuse?,expectedRevision?})",
        description: "Pack 1–200 disjoint subtrees atomically. reuse:true shares definitions whose components and child structure match, ignoring node IDs/names and root placement. Opt in only for self-contained assemblies; custom ID references are not remapped. Returns reused source IDs. Ancestor/descendant selections are rejected."
    },
    pack: {
        signature: "pack({id,expectedRevision?})",
        description: "Mark a child node packed:true while keeping its components and children in place. Copies use PrefabRef with the owner node ID as prefabId. Editing the owner updates copies. Creates one undo step. Duplicate the result for more instances; save the scene to persist. References across the packed boundary and custom scripts may need adjustment."
    },
    unpack: {
        signature: "await unpack({id,expectedRevision?})",
        description: "Clear a packed owner marker, or expand a PrefabRef under its placement wrapper. Remaining users retain the shared definition. One undo step; rejects edits made during loading. Internal IDs are scoped; custom ID strings are not rewritten."
    },
    exportPrefab: {
        signature: "exportPrefab({id})",
        description: "Return {revision,prefab} for the full subtree, including materials and referenced inline definitions, with the placement transform/flags removed. No truncation and no scene changes. Asset URLs retain the editor basePath convention."
    },
    bounds: {
        signature: "bounds({id})",
        description: "Live rendered subtree world AABB: {min,max,size,center}, or null when empty. Wait for mounting/assets; includes hidden objects, instancing source meshes, and any mounted helpers. Not collision bounds. Use low-angle captures to verify ground contact."
    },
    help: {
        signature: "help()",
        description: "Read editor concepts, workflow, callable methods and examples without changing the scene."
    },
    analyze: {
        signature: "analyze()",
        description: "Document counts and bounded rendering/organization advice. It does not judge visual or behavioral correctness, draw calls or FPS."
    },
    info: {
        signature: "info()",
        description: "Read scene mode, revision, root ID, selection, history and save availability. The host reports its persistence method."
    },
    assets: {
        signature: "assets({type?, query?, offset?, limit?})",
        description: "Search the host’s configured model, texture, sound and prefab catalog without changing the scene."
    },
    find: {
        signature: "find({query?, component?, parentId?})",
        description: "Require exactly one search match and return its ID, flags, components and local/world transform."
    },
    search: {
        signature: "search({query?, component?, parentId?, recursive?, groupsOnly?, offset?, limit?})",
        description: "Search objects by name, ID, component or parent, with pagination. Results include IDs, flags, component keys/types and local/world transforms. Recursive parent searches include descendants; groupsOnly filters assemblies before pagination."
    },
    get: {
        signature: "get({id, depth?, resolved?})",
        description: "Node plus flat descendants and truncated flag; node.childIds lists children (not node.children). Use exportPrefab for a complete nested subtree."
    },
    getMany: {
        signature: "getMany({ids, depth?, limit?, resolved?})",
        description: "Read known node IDs and optional descendants, including component properties and child IDs. Request resolved defaults when needed; use subtree export for a complete nested document."
    },
    components: {
        signature: "components({names?, properties?})",
        description: "Discover registered component types; request names to read editable fields, schemas and evaluated defaults. Inspect unfamiliar settings before authoring them."
    },
    commands: {
        signature: "commands()",
        description: "Read batch command inputs and semantics. Use individual object edits when they express the task; use a batch for dependent changes that need one atomic commit."
    },
    materials: {
        signature: "materials({ids?, offset?, limit?})",
        description: "Read shared material names and IDs, or full definitions for selected IDs."
    },
    validate: {
        signature: "validate({expectedRevision, commands})",
        description: "Read-only batch/schema validation plus bounded advisories. It does not judge visual or behavioral correctness."
    },
    batch: {
        signature: "batch({expectedRevision, commands})",
        description: "Run supported node creation, removal, placement, component and hierarchy commands atomically as one shared editor undo step. Requires edit mode."
    },
    create: {
        signature: "create({parentId,node,expectedRevision?})",
        description: "Add one node or subtree; defaults to the current revision."
    },
    update: {
        signature: "update({id,patch?,transform?,components?,expectedRevision?})",
        description: "Edit one object’s metadata, transform and component entries atomically as one shared undo step. Component entries replace with {type,properties}, patch with {properties,unset?}, or remove with null. Requires edit mode."
    },
    remove: {
        signature: "remove({id,expectedRevision?})",
        description: "Remove one node subtree."
    },
    replace: {
        signature: "replace({id,node,expectedRevision?})",
        description: "Replace one complete node subtree."
    },
    replaceAll: {
        signature: "replaceAll({prefab,expectedRevision?})",
        description: "Replace the complete prefab document."
    },
    move: {
        signature: "move({id,parentId,expectedRevision?})",
        description: "Reparent one node, keeping its local transform."
    },
    transform: {
        signature: "transform({id,space?,position?,rotation?,scale?,expectedRevision?})",
        description: "Set one node transform."
    },
    setComponent: {
        signature: "setComponent({id,key,component,expectedRevision?})",
        description: "Add/replace a component; null removes it."
    },
    patchComponent: {
        signature: "patchComponent({id,key,properties,unset?,expectedRevision?})",
        description: "Patch one existing component."
    },
    duplicate: {
        signature: "duplicate({id,newId,parentId?,expectedRevision?})",
        description: "Duplicate one subtree."
    },
    setMode: {
        signature: "await setMode({mode:\"edit\"|\"play\"})",
        description: "Switch between edit and play using the same action as the toolbar. Switching mode does not reset live state."
    },
    reset: {
        signature: "await reset()",
        description: "Remount live prefab objects/behaviors from the current document, preserving mode, authored edits and undo. Clears selection; calls onResetScene for external host state. Asset loading may continue after return."
    },
    select: {
        signature: "select({id:string|null})",
        description: "Select an unlocked document node or clear selection; edit mode only."
    },
    getCamera: {
        signature: "getCamera()",
        description: "Current camera position and orbit target in world coordinates."
    },
    setCamera: {
        signature: "setCamera({position:[x,y,z],target:[x,y,z]})",
        description: "Position the editor camera; edit mode only. Does not edit the document."
    },
    undo: {
        signature: "undo({expectedRevision?})",
        description: "Undo the latest shared editor action; revision guard is optional; edit mode only."
    },
    redo: {
        signature: "redo({expectedRevision?})",
        description: "Redo the latest undone action; revision guard is optional; edit mode only."
    },
    look: {
        signature: "look({id})",
        description: "Position the viewport around a mounted node; edit mode only."
    },
    capture: {
        signature: "await capture({mode?,fov?,position?,target?,helpers?})",
        description: "Return an inline PNG and metadata for the live scene. Wait for mounting/assets. Modes: default, unlit, wireframe; view/material overrides affect only the capture. helpers:false hides guides without changing mode or resetting. Captures do not prove visual correctness by themselves."
    },
    downloadGLB: {
        signature: "await downloadGLB({filename?})",
        description: "Request a browser GLB download, default scene.glb; returns download metadata."
    },
    downloadScreenshot: {
        signature: "await downloadScreenshot({filename?})",
        description: "Request a browser PNG download, default screenshot.png; returns download metadata."
    },
    export: {
        signature: "export()",
        description: "Export the complete authored prefab document without saving or changing it. Exported data does not include transient animation or physics state."
    },
    exportJSON: {
        signature: "exportJSON()",
        description: "Complete pretty-printed scene JSON for replacing the source scene file; always available."
    },
    save: {
        signature: "await save({expectedRevision?})",
        description: "Save the current authored scene through the host’s configured persistence callback. Requires edit mode. The host controls the destination; returning JSON or a browser download does not write an arbitrary filesystem path."
    }
};
export type SceneApiOperation = keyof typeof sceneApiOperations;
