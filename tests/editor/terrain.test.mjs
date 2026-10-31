import { act, createElement as h } from 'react';
import { createRoot } from '@react-three/fiber';
import { TerrainPaintTool, TERRAIN_PAINT_TOOL } from '../../src/editor/terrain/TerrainPaintTool.tsx';
import { EditorToolsContext, createEditorToolController, registerEditorTool } from '../../src/editor/tools/EditorTools.ts';
import { EditorRefContext } from '../../src/editor/EditorContext.ts';
import { TERRAIN_SURFACE_COMPONENT } from '../../src/runtime/terrain/terrainSurface.ts';
import { NodeComponentContext, createNodeComponentRegistry, createPrefabRegistry } from '../../src/runtime/scene/SceneContext.tsx';
import { createGameObjectHandle, registerGameObjectOwner } from '../../src/runtime/scene/gameObject.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Raycaster, Vector3, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector2 } from 'three';
import { createTerrainGeometry, sampleHeight, paintWeights, readWeights, normalizeWeightMap, terrainLayers, terrainSettings } from '../../src/runtime/terrain/terrainData.ts';

function map(size = 33) {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 3] = 255; }
    return { width: size, height: size, data };
}
const brush = { u: 0.5, v: 0.5, radius: 3, width: 16, depth: 16, layer: 1, strength: 0.5, hardness: 0.4 };

test('terrain height orientation, interpolation, real mesh raycasts and bounds agree', () => {
    const heights = { width: 2, height: 2, data: new Uint8ClampedArray([255,255,255,255, 255,255,255,255, 0,0,0,255, 0,0,0,255]) };
    assert.equal(sampleHeight(heights, 0.5, 1), 1);
    assert.equal(sampleHeight(heights, 0.5, 0), 0);
    assert.equal(sampleHeight(heights, 0.5, 0.5), 0.5);
    const geometry = createTerrainGeometry({ width: 10, depth: 10, segments: 4, heightScale: 6 }, heights);
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    const hit = new Raycaster(new Vector3(0, 20, 0), new Vector3(0, -1, 0)).intersectObject(mesh)[0];
    assert.ok(hit);
    assert.ok(Math.abs(hit.point.y - 3) < 1e-6);
    assert.ok(Math.abs(hit.uv.y - 0.5) < 1e-6);
    assert.equal(geometry.boundingBox.max.y, 6);
    const visualRelief = createTerrainGeometry({ width: 10, depth: 10, segments: 4, heightScale: 6,
        layers: [{ displacementMap: 'rock.png', displacementScale: 10 }] }, heights);
    assert.deepEqual(visualRelief.attributes.position.array, geometry.attributes.position.array,
        'material displacement never changes CPU vertices used by terrain colliders');
    assert.deepEqual(visualRelief.boundingSphere, geometry.boundingSphere);
    visualRelief.dispose();
    geometry.dispose();mesh.material.dispose();
});

test('weight strokes preserve total mass and opaque alpha for every layer, including the residual fourth layer', () => {
    const image = map();
    for (let layer = 0; layer < 4; layer++) {
        for (let i = 0; i < 20; i++) paintWeights(image, { ...brush, layer });
        for (let offset = 0; offset < image.data.length; offset += 4) {
            const weights = readWeights(image.data, offset);
            assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0) - 1) < 1e-12);
            assert.equal(image.data[offset + 3], 255);
            assert.ok(image.data[offset] + image.data[offset+1] + image.data[offset+2] <= 255);
        }
        assert.ok(readWeights(image.data, (16*33+16)*4)[layer] > 0.98);
    }
    assert.deepEqual([...image.data.slice(0,4)], [255,0,0,255], 'outside radius unchanged');
});

test('brush pressure zero is a no-op, edges clip, non-square dimensions preserve physical footprint', () => {
    const image = map(65), before = image.data.slice();
    assert.equal(paintWeights(image, { ...brush, strength: 0 }), false);
    assert.deepEqual(image.data, before);
    paintWeights(image, { ...brush, width: 32, depth: 16, radius: 4, strength: 1 });
    assert.equal(image.data[(32*65+42)*4+1],0, 'outside x radius');
    assert.ok(image.data[(42*65+32)*4+1]>0, 'inside z radius');
    assert.doesNotThrow(()=>paintWeights(image,{...brush,u:0,v:1,radius:8}));
});

test('imported weights normalize and defaults are bounded without mutating layer definitions', () => {
    const image = {width:1,height:1,data:new Uint8ClampedArray([255,255,255,255])};
    normalizeWeightMap(image);
    assert.deepEqual([...image.data],[85,85,85,255]);
    assert.equal(terrainSettings({segments:Infinity}).segments,128);
    assert.equal(terrainSettings({segments:100000}).segments,512);
    const layers=terrainLayers();layers[0].color='#000000';
    assert.notEqual(terrainLayers()[0].color,'#000000');
});

test('terrain TSL material owns cloned layer textures, leaving shared source textures untouched', async () => {
    const { DataTexture, Vector2, ClampToEdgeWrapping } = await import('three');
    const { uniform } = await import('three/tsl');
    const { createTerrainMaterial } = await import('../../src/runtime/terrain/terrainMaterial.ts');
    const source = new DataTexture(new Uint8Array([128,128,255,255]),1,1);
    const originalWrap=source.wrapS;
    let sourceDisposed=false;source.addEventListener('dispose',()=>sourceDisposed=true);
    const surface={texture:source,brushCenter:uniform(new Vector2()),brushRadius:uniform(new Vector2(1,1)),brushVisible:uniform(0)};
    const maps=Array.from({length:4},()=>({albedo:source,normal:source,roughness:source,displacement:source}));
    const material=createTerrainMaterial(terrainLayers([{ displacementMap: 'rock.png', displacementScale: .35 }]),maps,surface,32,32);
    assert.ok(material.isMeshStandardNodeMaterial);
    assert.ok(material.positionNode, 'material relief is implemented in the vertex shader');
    assert.ok(material.colorNode && material.normalNode && material.roughnessNode && material.emissiveNode);
    assert.equal(source.wrapS,originalWrap);assert.equal(source.wrapS,ClampToEdgeWrapping);
    material.dispose();assert.equal(sourceDisposed,false);
    source.dispose();
});

test('terrain surface ownership uses the scene registry without leaking through nested nodes', async () => {
    const {Group}=await import('three');
    const {createNodeComponentRegistry,createPrefabRegistry}=await import('../../src/runtime/scene/SceneContext.tsx');
    const {registerGameObjectOwner,createGameObjectHandle}=await import('../../src/runtime/scene/gameObject.ts');
    const {TERRAIN_SURFACE_COMPONENT,findTerrainSurface}=await import('../../src/runtime/terrain/terrainSurface.ts');
    const registry=createNodeComponentRegistry(),objects=createPrefabRegistry();
    const parent=new Group(),child=new Group();parent.add(child);
    objects.registerObject('parent',parent);objects.registerObject('child',child);
    const releaseParent=registerGameObjectOwner(parent,createGameObjectHandle('parent','',objects,registry));
    const releaseChild=registerGameObjectOwner(child,createGameObjectHandle('child','',objects,registry));
    const surface={width:32,depth:32};const release=registry.register('child',TERRAIN_SURFACE_COMPONENT,surface);
    assert.equal(findTerrainSurface(parent),null,'parent must not pick a descendant terrain');
    assert.equal(findTerrainSurface(child),surface);
    const replacement={width:64,depth:64},releaseReplacement=registry.register('child',TERRAIN_SURFACE_COMPONENT,replacement);
    assert.equal(findTerrainSurface(child),surface,'multiple terrains resolve the first live surface');
    release();assert.equal(findTerrainSurface(child),replacement,'old cleanup cannot delete replacement');
    releaseReplacement();assert.equal(findTerrainSurface(child),null);
    releaseParent();releaseChild();
});

test('terrain samplers share GPU textures and release only after the last material owner', async () => {
    const { retainTerrainSampler } = await import('../../src/runtime/terrain/terrainResources.ts');
    const { Texture, SRGBColorSpace, NoColorSpace } = await import('three');
    const source = new Texture();
    let sourceDisposed = 0, sharedDisposed = 0;
    source.addEventListener('dispose', () => sourceDisposed++);
    const a = retainTerrainSampler(source, true), b = retainTerrainSampler(source, true), linear = retainTerrainSampler(source, false);
    assert.equal(a.texture, b.texture);
    assert.notEqual(a.texture, linear.texture);
    assert.equal(a.texture.colorSpace, SRGBColorSpace);
    assert.equal(linear.texture.colorSpace, NoColorSpace);
    assert.equal(source.colorSpace, NoColorSpace);
    a.texture.addEventListener('dispose', () => sharedDisposed++);
    a.release(); a.release(); assert.equal(sharedDisposed, 0);
    b.release(); assert.equal(sharedDisposed, 1);
    assert.equal(sourceDisposed, 0);
    linear.release();
    const next = retainTerrainSampler(source, true);
    assert.notEqual(next.texture, a.texture); next.release(); source.dispose();
});


class Canvas extends EventTarget {
    width=200; height=200; style={}; captured=new Set();
    getBoundingClientRect(){return {left:0,top:0,width:200,height:200};}
    setPointerCapture(id){this.captured.add(id);}
    hasPointerCapture(id){return this.captured.has(id);}
    releasePointerCapture(id){this.captured.delete(id);}
}
function pointer(canvas,type,patch={}) {
    const event=new Event(type,{cancelable:true});
    Object.assign(event,{pointerId:1,pointerType:'mouse',button:0,buttons:1,clientX:100,clientY:100,pressure:0.5,...patch});
    canvas.dispatchEvent(event);return event;
}

test('terrain tool captures paint, commits once, cancels safely, and leaves touch navigation available', async t=>{
    globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const previousWindow=globalThis.window;
    globalThis.window=new EventTarget();
    const canvas=new Canvas(), controls={current:{enabled:true}};
    const geometry=createTerrainGeometry({width:16,depth:16,segments:2},null);
    const mesh=new Mesh(geometry,new MeshBasicMaterial());
    const camera=new PerspectiveCamera(60,1,0.1,100);camera.position.set(0,15,0);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    let data=new Uint8ClampedArray(33*33*4);
    for(let i=0;i<data.length;i+=4){data[i]=255;data[i+3]=255;}
    const context={getImageData:()=>({width:33,height:33,data:data.slice()}),putImageData:image=>{data=image.data.slice();}};
    const paintCanvas={width:33,height:33,getContext:()=>context,toDataURL:()=>`data:image/png;base64,${Buffer.from(data).toString('base64')}`};
    const surface={mesh,width:16,depth:16,canvas:paintCanvas,texture:{needsUpdate:false},brushCenter:{value:new Vector2()},brushRadius:{value:new Vector2()},brushVisible:{value:0}};
    const registry=createNodeComponentRegistry(), objects=createPrefabRegistry();
    objects.registerObject('land',mesh);
    const unown=registerGameObjectOwner(mesh,createGameObjectHandle('land','',objects,registry));
    const unregister=registry.register('land',TERRAIN_SURFACE_COMPONENT,surface);
    let node={id:'land',components:{surface:{type:'Terrain',properties:{}}}}, commits=0;
    const editor={batch:fn=>fn(),getObject:()=>mesh,get:()=>node,update:(id,fn)=>{assert.equal(id,'land');node=fn(node);commits++;}};
    const unregisterTool=registerEditorTool({id:TERRAIN_PAINT_TOOL,label:'Paint',supports:()=>true,createSettings:()=>({layer:1,radius:3,strength:0.5,hardness:0.4,pressure:true}),Viewport:TerrainPaintTool,Panel:()=>null});
    const tools=createEditorToolController(()=>node);tools.activate(TERRAIN_PAINT_TOOL,'land');
    const root=createRoot(canvas);
    await root.configure({camera,gl:{render(){},setSize(){},setPixelRatio(){},domElement:canvas},size:{width:200,height:200,top:0,left:0},frameloop:'never'});
    await act(async()=>root.render(h(EditorRefContext.Provider,{value:editor},h(EditorToolsContext.Provider,{value:tools},h(NodeComponentContext.Provider,{value:registry},h(TerrainPaintTool,{camera,controlsRef:controls}))))));
    t.after(async()=>{await act(async()=>root.unmount());unregisterTool();unregister();unown();geometry.dispose();mesh.material.dispose();globalThis.window=previousWindow;});
    assert.equal(pointer(canvas,'pointerdown',{pointerType:'touch'}).defaultPrevented,false);
    assert.equal(commits,0);assert.equal(controls.current.enabled,true);
    const before=data.slice();
    assert.equal(pointer(canvas,'pointerdown').defaultPrevented,true);
    assert.equal(controls.current.enabled,false);assert.equal(canvas.hasPointerCapture(1),true);
    assert.equal(commits,0,'live preview never writes the document');
    assert.notDeepEqual(data,before);
    pointer(canvas,'pointermove',{clientX:120});
    pointer(canvas,'pointerup',{buttons:0});
    assert.equal(commits,1);assert.ok(node.components.surface.properties.weightMap.startsWith('data:image/png'));
    assert.equal(controls.current.enabled,true);assert.equal(canvas.hasPointerCapture(1),false);
    const committed=data.slice();
    pointer(canvas,'pointerdown',{pointerType:'pen',pressure:0.7});
    assert.equal(pointer(canvas,'pointerdown',{pointerType:'touch',pointerId:2}).defaultPrevented,true,'palm cannot steal a stroke');
    pointer(canvas,'pointercancel',{pointerType:'pen'});
    assert.deepEqual(data,committed);assert.equal(commits,1);assert.equal(controls.current.enabled,true);
    pointer(canvas,'pointerdown');
    globalThis.window.dispatchEvent(Object.assign(new Event('keydown'),{key:'Escape'}));
    assert.deepEqual(data,committed);assert.equal(commits,1);
    pointer(canvas,'pointerdown',{pointerType:'pen',pressure:0});
    pointer(canvas,'pointerup',{pointerType:'pen',pressure:0});
    assert.equal(commits,1,'zero pressure makes no history entry');
    pointer(canvas,'pointerdown');
    tools.cancelInteraction();
    assert.deepEqual(data,committed,'toolbar undo can synchronously cancel the stroke before restoring history');
    assert.equal(controls.current.enabled,true);
    assert.equal(tools.getSnapshot().error,null);
});

test('a world-space stroke paints both sides of a tile seam atomically, with undo and cancellation', async t => {
    const { createPrefabStore } = await import('../../src/core/prefabStore.ts');
    const { createPrefabHistory } = await import('../../src/core/prefabHistory.ts');
    const { createPrefabDocumentApi } = await import('../../src/core/prefabDocumentApi.ts');
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const previousWindow = globalThis.window;
    globalThis.window = new EventTarget();
    const canvas = new Canvas(), controls = { current: { enabled: true } };
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 30, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const registry = createNodeComponentRegistry(), objects = createPrefabRegistry();
    const nodes = ['left', 'right'].map(id => ({ id, components: { terrain: { type: 'Terrain', properties: {} } } }));
    const store = createPrefabStore({ root: { id: 'root', children: nodes } });
    const history = createPrefabHistory(store); t.after(history.connect());
    const api = createPrefabDocumentApi(store);
    let batches = 0;
    const editor = { ...api, getObject: objects.getObject, batch: fn => { batches++; api.batch(fn); } };
    const tiles = nodes.map((node, index) => {
        const mesh = new Mesh(createTerrainGeometry({ width: 16, depth: 16, segments: 2 }, null), new MeshBasicMaterial());
        mesh.position.x = index ? 8 : -8; mesh.updateMatrixWorld();
        let data = new Uint8ClampedArray(33 * 33 * 4);
        for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 3] = 255; }
        const initial = data.slice();
        const context = { getImageData: () => ({ width: 33, height: 33, data: data.slice() }), putImageData: image => { data = image.data.slice(); } };
        const surface = { mesh, width: 16, depth: 16, canvas: { width: 33, height: 33, getContext: () => context,
            toDataURL: () => `data:image/png;base64,${Buffer.from(data).toString('base64')}` }, texture: {},
            brushCenter: { value: new Vector2() }, brushRadius: { value: new Vector2() }, brushVisible: { value: 0 } };
        t.after(objects.registerObject(node.id, mesh));
        t.after(registerGameObjectOwner(mesh, createGameObjectHandle(node.id, '', objects, registry)));
        t.after(registry.register(node.id, TERRAIN_SURFACE_COMPONENT, surface));
        t.after(() => { mesh.geometry.dispose(); mesh.material.dispose(); });
        return { surface, initial, read: () => data.slice() };
    });
    t.after(registerEditorTool({ id: TERRAIN_PAINT_TOOL, label: 'Paint', supports: () => true,
        createSettings: () => ({ layer: 1, radius: 3, strength: .5, hardness: .4, pressure: true }), Viewport: TerrainPaintTool, Panel: () => null }));
    const tools = createEditorToolController(api.get); tools.activate(TERRAIN_PAINT_TOOL, 'left');
    const root = createRoot(canvas);
    await root.configure({ camera, gl: { render() {}, setSize() {}, setPixelRatio() {}, domElement: canvas }, size: { width: 200, height: 200, top: 0, left: 0 }, frameloop: 'never' });
    await act(async () => root.render(h(EditorRefContext.Provider, { value: editor }, h(EditorToolsContext.Provider, { value: tools },
        h(NodeComponentContext.Provider, { value: registry }, h(TerrainPaintTool, { camera, controlsRef: controls }))))));
    t.after(async () => { await act(async () => root.unmount()); globalThis.window = previousWindow; });
    pointer(canvas, 'pointerdown'); // Exactly on the seam: footprint must reach both maps.
    for (const tile of tiles) assert.notDeepEqual(tile.read(), tile.initial);
    assert.equal(batches, 0);
    pointer(canvas, 'pointerup');
    await Promise.resolve();
    assert.equal(batches, 1);
    for (const node of nodes) assert.ok(api.get(node.id).components.terrain.properties.weightMap);
    history.undo();
    for (const node of nodes) assert.equal(api.get(node.id).components.terrain.properties.weightMap, undefined);
    assert.equal(history.getSnapshot().canUndo, false, 'both maps belong to one history entry');
    history.redo();
    const committed = tiles.map(tile => tile.read());
    pointer(canvas, 'pointerdown', { clientX: 85 });
    pointer(canvas, 'pointermove', { clientX: 115 });
    pointer(canvas, 'pointercancel');
    tiles.forEach((tile, i) => assert.deepEqual(tile.read(), committed[i]));
    assert.equal(batches, 1);
    api.update('right', node => ({ ...node, locked: true }));
    pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup');
    assert.deepEqual(tiles[1].read(), committed[1], 'locked neighbors are excluded');
    api.update('right', node => ({ ...node, locked: false, components: { terrain: { type: 'Terrain', properties: { layers: [{ name: 'Lava' }] } } } }));
    const beforeMismatch = tiles[1].read();
    pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup');
    assert.deepEqual(tiles[1].read(), beforeMismatch, 'different palettes must not receive the selected layer index');
});
