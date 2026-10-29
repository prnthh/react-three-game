import { attachPointerTool } from '../../src/editor/tools/pointerTool.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorToolController, registerEditorTool, getEditorTool, getEditorTools, subscribeEditorTools } from '../../src/editor/tools/EditorTools.ts';
import { registerEditorNodePreset, getEditorNodePresets } from '../../src/editor/NodePresets.ts';
import '../../src/editor/builtInNodePresets.ts';
import { createPrefabStore } from '../../src/core/prefabStore.ts';
import { createPrefabHistory } from '../../src/core/prefabHistory.ts';

const customTool = (id) => ({ id, label: 'Path editor', supports: node => !!node.components?.path,
    createSettings: () => ({ spacing: 2 }), Viewport: () => null, Panel: () => null });

test('extension subscriptions publish stable snapshots and cleanup owns a registration even for reused values', t => {
    const definition = customTool('test.reused');
    const snapshots = [];
    t.after(subscribeEditorTools(() => snapshots.push(getEditorTools())));
    const first = registerEditorTool(definition), second = registerEditorTool(definition);
    t.after(second);
    assert.equal(getEditorTools(), getEditorTools());
    assert.equal(snapshots.length, 2);
    assert.notEqual(snapshots[0], snapshots[1]);
    first();
    assert.equal(getEditorTool(definition.id), definition);
    assert.equal(snapshots.length, 2);
    second(); second();
    assert.equal(getEditorTool(definition.id), undefined);
    assert.equal(snapshots.length, 3);
    assert.ok(snapshots[0].includes(definition), 'previous snapshots stay immutable');
});

test('unloading or replacing a plugin ends its interaction and does not reuse incompatible settings', t => {
    const definition = customTool('test.dynamic');
    const release = registerEditorTool(definition);
    t.after(release);
    const tools = createEditorToolController(() => ({ id: 'a', components: { path: {} } }));
    const disconnect = tools.connect(); t.after(disconnect);
    tools.activate(definition.id, 'a');
    tools.setSettings({ spacing: 99 });
    let cancellations = 0;
    tools.registerCancellation(() => cancellations++);
    const replacement = { ...definition, createSettings: () => ({ radius: 3 }) };
    const removeReplacement = registerEditorTool(replacement); t.after(removeReplacement);
    assert.equal(tools.getSnapshot(), null);
    assert.equal(cancellations, 1);
    release();
    assert.equal(tools.activate(definition.id, 'a'), true);
    assert.deepEqual(tools.getSnapshot().settings, { radius: 3 });
    tools.registerCancellation(() => cancellations++);
    removeReplacement();
    assert.equal(tools.getSnapshot(), null);
    assert.equal(cancellations, 2);
    assert.equal(tools.activate(definition.id, 'a'), false);
});

test('custom tools isolate per editor, validate targets, cancel before switching, and remember independent settings', t => {
    const first=customTool('test.path'), second=customTool('test.collider');
    t.after(registerEditorTool(first));t.after(registerEditorTool(second));
    const nodes={a:{id:'a',components:{path:{type:'Path',properties:{}}}},locked:{id:'locked',locked:true,components:{path:{type:'Path',properties:{}}}},unsupported:{id:'unsupported'}};
    let enabled=true;
    const tools=createEditorToolController(id=>nodes[id],()=>enabled), other=createEditorToolController(id=>nodes[id]);
    assert.equal(tools.activate(first.id,'locked'),false);
    assert.equal(tools.activate(first.id,'unsupported'),false);
    assert.equal(tools.activate('missing','a'),false);
    assert.equal(tools.activate(first.id,'a'),true);
    const firstKey=tools.getSnapshot().key;
    tools.setSettings({spacing:5});
    assert.equal(other.getSnapshot(),null);
    const cancelled=[];
    const cleanup=tools.registerCancellation(()=>cancelled.push(tools.getSnapshot().definition.id));
    tools.activate(second.id,'a');
    assert.deepEqual(cancelled,[first.id],'old interaction cancelled while its session still owns the target');
    assert.deepEqual(tools.getSnapshot().settings,{spacing:2});
    assert.notEqual(tools.getSnapshot().key,firstKey);
    cleanup();
    tools.activate(first.id,'a');assert.deepEqual(tools.getSnapshot().settings,{spacing:5});
    assert.equal(nodes.locked.locked,true,'isolation never mutates document lock flags');
    nodes.a.locked=true;tools.validate();assert.equal(tools.getSnapshot(),null);
    nodes.a.locked=false;tools.activate(first.id,'a');
    enabled=false;tools.validate();assert.equal(tools.getSnapshot(),null);
    assert.equal(tools.activate(first.id,'a'),false);
    enabled=true;tools.activate(first.id,'a');delete nodes.a;tools.validate();assert.equal(tools.getSnapshot(),null);
});

test('tool registration cleanup and stale session cancellations cannot affect a replacement', t => {
    const old=customTool('test.replaced'), replacement=customTool('test.replaced');
    const release=registerEditorTool(old);t.after(registerEditorTool(replacement));release();
    assert.equal(getEditorTool(old.id),replacement);
    const tools=createEditorToolController(()=>({id:'a',components:{path:{type:'Path',properties:{}}}}));
    tools.activate(old.id,'a');const staleKey=tools.getSnapshot().key;
    tools.end();tools.activate(old.id,'a');
    let cancelled=0;tools.registerCancellation(()=>cancelled++,staleKey);tools.cancelInteraction();
    assert.equal(cancelled,0);
});

test('registered node presets create independent trees through normal document history', async t => {
    const custom={id:'test.assembly',label:'Assembly',category:'Custom',create:()=>({id:crypto.randomUUID(),name:'Assembly',children:[{id:crypto.randomUUID(),name:'Child'}]})};
    const oldRelease=registerEditorNodePreset({...custom,label:'Old'});t.after(registerEditorNodePreset(custom));oldRelease();
    assert.equal(getEditorNodePresets().find(p=>p.id===custom.id),custom);
    for(const preset of getEditorNodePresets()) {
        const a=preset.create(),b=preset.create();
        assert.notEqual(a.id,b.id,preset.id);
        assert.notEqual(a,b);
    }
    const store=createPrefabStore({root:{id:'root'}}),history=createPrefabHistory(store);
    t.after(history.connect());
    const node=custom.create();store.getState().addChild('root',node);
    await Promise.resolve();
    assert.ok(store.getState().nodesById[node.children[0].id]);
    history.undo();assert.equal(store.getState().nodesById[node.id],undefined);
    history.redo();assert.ok(store.getState().nodesById[node.id]);
});

test('registered tools appear in the inspector and stale view callbacks cannot change a new session', async t => {
    const {createElement:h}=await import('react');
    const {renderToStaticMarkup}=await import('react-dom/server');
    const {EditorToolsContext,useEditorToolSession}=await import('../../src/editor/tools/EditorTools.ts');
    const {EditorToolActions}=await import('../../src/editor/tools/EditorToolActions.tsx');
    const definition=customTool('test.async');t.after(registerEditorTool(definition));
    const node={id:'target',components:{path:{type:'Path',properties:{}}}};
    const tools=createEditorToolController(()=>node);
    const html=renderToStaticMarkup(h(EditorToolsContext.Provider,{value:tools},h(EditorToolActions,{node})));
    assert.match(html,/Path editor/);
    tools.activate(definition.id,node.id);
    let old;
    function Probe(){old=useEditorToolSession(definition.id);return null;}
    renderToStaticMarkup(h(EditorToolsContext.Provider,{value:tools},h(Probe)));
    tools.end();tools.activate(definition.id,node.id);
    old.setSettings({spacing:999});old.setError('stale failure');old.end();
    assert.deepEqual(tools.getSnapshot().settings,{spacing:2});
    assert.equal(tools.getSnapshot().error,null);
});


class Canvas extends EventTarget {
    captured=new Set();
    setPointerCapture(id){this.captured.add(id);}
    hasPointerCapture(id){return this.captured.has(id);}
    releasePointerCapture(id){this.captured.delete(id);}
}
function send(canvas,type,props={}) {
    const event=Object.assign(new Event(type,{cancelable:true}),{pointerId:1,pointerType:'mouse',button:0,buttons:1,...props});
    canvas.dispatchEvent(event);return event;
}
test('non-terrain tools share capture, navigation, coalesced samples and exactly-once completion',()=>{
    const canvas=new Canvas(),windowTarget=new EventTarget(),controls={enabled:true},ends=[],moves=[];
    const binding=attachPointerTool(canvas,{begin:()=>true,move:e=>moves.push(e.clientX),end:commit=>ends.push(commit),onError:error=>{throw error;}},{windowTarget,controls:()=>controls});
    assert.equal(send(canvas,'pointerdown',{pointerType:'touch'}).defaultPrevented,false);
    assert.equal(send(canvas,'pointerdown',{altKey:true}).defaultPrevented,false);
    send(canvas,'pointerdown',{clientX:0});assert.equal(controls.enabled,false);
    send(canvas,'pointermove',{getCoalescedEvents:()=>[{clientX:1},{clientX:2}]});
    assert.deepEqual(moves,[0,1,2]);
    send(canvas,'pointerup',{pointerId:2});assert.equal(ends.length,0);
    send(canvas,'pointerup');send(canvas,'lostpointercapture');assert.deepEqual(ends,[true]);
    assert.equal(controls.enabled,true);assert.equal(canvas.captured.size,0);
    send(canvas,'pointerdown');windowTarget.dispatchEvent(new Event('blur'));
    assert.deepEqual(ends,[true,false]);assert.equal(controls.enabled,true);
    send(canvas,'pointerdown');binding.dispose();assert.deepEqual(ends,[true,false,false]);
    send(canvas,'pointerdown');assert.equal(canvas.captured.size,0,'disposed listener cannot acquire input');
});

test('failed preview or commit releases pointer and restores the original navigation state',()=>{
    const canvas=new Canvas(),windowTarget=new EventTarget(),controls={enabled:false},errors=[],ends=[];
    let throwOnMove=true;
    const binding=attachPointerTool(canvas,{begin:()=>true,move:()=>{if(throwOnMove)throw new Error('preview');},
        end:commit=>{ends.push(commit);if(commit)throw new Error('commit');},onError:error=>errors.push(error.message)}, {windowTarget,controls:()=>controls});
    send(canvas,'pointerdown');assert.deepEqual(ends,[false]);assert.deepEqual(errors,['preview']);
    assert.equal(canvas.captured.size,0);assert.equal(controls.enabled,false);
    throwOnMove=false;send(canvas,'pointerdown');send(canvas,'pointerup');
    assert.deepEqual(errors,['preview','commit']);assert.equal(canvas.captured.size,0);assert.equal(controls.enabled,false);
    binding.dispose();
});
