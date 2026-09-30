import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSceneAgent } from '../../src/tools/prefabeditor/sceneAgent.ts';
import { createPrefabStore } from '../../src/tools/prefabeditor/prefabStore.ts';
import { createPrefabHistory } from '../../src/tools/prefabeditor/prefabHistory.ts';
import { registerComponent } from '../../src/tools/prefabeditor/components/ComponentRegistry.ts';
import Geometry from '../../src/tools/prefabeditor/components/GeometryComponent.tsx';
import Mesh from '../../src/tools/prefabeditor/components/MeshComponent.tsx';
import Transform from '../../src/tools/prefabeditor/components/TransformComponent.tsx';
import Material from '../../src/tools/prefabeditor/components/MaterialComponent.tsx';
import Model from '../../src/tools/prefabeditor/components/ModelComponent.tsx';
[Geometry, Mesh, Transform, Material, Model].forEach(registerComponent);
function fixture(prefab = {root:{id:'world'}}, save) {
    const store = createPrefabStore(prefab);
    const history = createPrefabHistory(store); history.connect();
    const api = createSceneAgent(store,()=>({mode:()=> 'edit',selectedId:()=>null,transaction:history.transaction,beforeCommit(){},undo:history.undo,redo:history.redo,history:history.getSnapshot,canSave:()=>Boolean(save),save:async document=>{ await save?.(document); },focusNode(){},captureView:async()=>({mimeType:'image/png',dataUrl:'',width:1,height:1})})).api;
    return {store,api};
}

test('documented assembly example validates and loads asset references without fetching', () => {
    const {api} = fixture();
    const guide = readFileSync(new URL('../public/editor-api-for-agents.md',import.meta.url),'utf8');
    const block = guide.split('```js').map(s=>s.split('```')[0]).find(s=>s.includes('function assemblyBatch'));
    const recipe = new Function(`${block}; return assemblyBatch;`)();
    const batch = recipe(api,'world','courtyard','/models/prop.glb','/textures/stone.jpg');
    assert.deepEqual(api.validateBatch(batch).advisories,[]);
    api.applyBatch(batch);
    const nodes=api.getNodes({ids:['courtyard-wall','courtyard-prop']}).nodes;
    assert.equal(nodes[0].parentId,'courtyard');
    assert.deepEqual(nodes[0].components.geometry.properties.args,[1,1,1]);
    assert.equal(nodes[1].components.model.properties.filename,'/models/prop.glb');
    assert.equal(api.getMaterials({ids:['courtyard-stone']}).materials[0].texture,'/textures/stone.jpg');
});


test('documented current-scene workflow attaches, patches, saves and reloads behavior', async () => {
    const { default: Rotator } = await import('../app/demo/customcomponent/RotatorComponent.tsx');
    const { default: Squish } = await import('../app/demo/customcomponent/SquishComponent.tsx');
    const { builtInComponents } = await import('../../src/tools/prefabeditor/components/index.ts');
    [...builtInComponents, Rotator, Squish].forEach(registerComponent);
    const initial = JSON.parse(readFileSync(new URL('../app/demo/customcomponent/rotator-demo.json', import.meta.url), 'utf8'));
    let saved;
    const { api } = fixture(initial, document => { saved = JSON.stringify(document); });
    const guide = readFileSync(new URL('../public/editor-api-for-agents.md', import.meta.url), 'utf8');
    const blocks = [...guide.matchAll(/```js\n([\s\S]*?)```/g)].map(match => match[1]);
    const configure = new Function(`${blocks.find(block => block.includes('function configureComponent'))}; return configureComponent;`)();
    configure(api, 'squishy-cube', 'Rotator', { speed: 2, axis: 'x' });
    assert.equal(api.getNodes({ ids: ['squishy-cube'] }).nodes[0].components.Rotator.properties.speed, 2);
    configure(api, 'squishy-cube', 'Rotator', { speed: 0.5 });
    const persist = blocks.find(block => block.includes('const current = api.getSceneInfo()'));
    await new Function('api', `return (async () => { ${persist} })();`)(api);
    const restored = fixture(JSON.parse(saved)).api;
    const node = restored.getNodes({ ids: ['squishy-cube'], resolved: true }).nodes[0];
    assert.equal(node.components.Rotator.properties.speed, 0.5);
    assert.equal(node.resolvedComponents.Rotator.properties.axis, 'x');
    assert.equal(node.components.squish.type, 'Squish');
});
