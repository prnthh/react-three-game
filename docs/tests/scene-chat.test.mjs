import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneChatSession, sceneChatBaseURL } from '../app/components/agent/sceneChat.ts';
const json = message => new Response(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: args } });
const result = { content: [{ type: 'text', text: 'ok' }] };

test('normalizes supported endpoint forms and rejects credentials', () => {
 for (const url of ['http://localhost:1234', 'http://localhost:1234/v1/', 'http://localhost:1234/v1/chat/completions']) assert.equal(sceneChatBaseURL(url), 'http://localhost:1234/v1');
 assert.throws(() => sceneChatBaseURL('http://secret@localhost'));
});
test('executes sequentially, feeds real errors back, and excludes API key from transcript', async () => {
 const requests = [], executed = [];
 const session = new SceneChatSession([{ name: 'scene_info', description: 'info', inputSchema: {type:'object'}, execute: async args => { executed.push(args); return result; } }], async (_, init) => {
  requests.push(JSON.parse(init.body));
  return requests.length === 1 ? json({ tool_calls: [call('a','missing','{}'), call('b','scene_info','{"x":1}')] }) : json({ content: 'Done' });
 });
 await session.run('edit', { endpoint:'http://localhost:1234', model:'test', apiKey:'secret' }, () => {}, new AbortController().signal);
 assert.deepEqual(executed,[{x:1}]);
 assert.match(requests[1].messages.find(m => m.tool_call_id === 'a').content,/Unknown tool/);
 assert.equal(requests[0].tools[0].function.name,'scene_info');
 assert.ok(!JSON.stringify(session.transcript({endpoint:'http://localhost',model:'test',apiKey:'secret'})).includes('secret'));
});
test('assembles fragmented SSE content and tool arguments across CRLF boundaries', async () => {
 const lines = [ {choices:[{delta:{tool_calls:[{index:0,id:'a',function:{name:'scene_info',arguments:'{'}}]}}]}, {choices:[{delta:{tool_calls:[{index:0,function:{arguments:'}'}}]},finish_reason:'tool_calls'}]} ];
 const raw = lines.map(v => `data: ${JSON.stringify(v)}\r\n\r\n`).join('') + 'data: [DONE]\r\n\r\n';
 let requests=0, executions=0;
 const session = new SceneChatSession([{name:'scene_info',description:'info',inputSchema:{},execute:async()=>{executions++;return result;}}], async()=> ++requests === 1 ? new Response(new ReadableStream({start(c){for(const char of raw)c.enqueue(new TextEncoder().encode(char));c.close();}}),{headers:{'content-type':'text/event-stream'}}) : json({content:'Done'}));
 await session.run('edit',{endpoint:'http://localhost',model:'test'},()=>{},new AbortController().signal);
 assert.equal(executions,1);
});
test('truncated output never executes partial tools', async () => {
 let executed=false;
 const session = new SceneChatSession([{name:'x',inputSchema:{},execute:async()=>{executed=true;return result;}}],async()=>new Response(JSON.stringify({choices:[{message:{tool_calls:[call('a','x','{}')]},finish_reason:'length'}]})));
 await assert.rejects(session.run('edit',{endpoint:'http://localhost',model:'test'},()=>{},new AbortController().signal),/token limit/);assert.equal(executed,false);
});
test('stop keeps pending tool replies valid for a later turn', async () => {
 const abort = new AbortController();
 const session = new SceneChatSession([{name:'x',inputSchema:{},execute:async()=>{abort.abort();return result;}}],async()=>json({tool_calls:[call('a','x','{}'),call('b','x','{}')]}));
 await assert.rejects(session.run('edit',{endpoint:'http://localhost',model:'test'},()=>{},abort.signal));
 assert.deepEqual(session.messages.filter(m=>m.role==='tool').map(m=>m.tool_call_id),['a','b']);
});
test('vision images follow all tool replies and are omitted by default', async () => {
 for (const vision of [false,true]) {
  const requests=[];
  const session=new SceneChatSession([{name:'capture',inputSchema:{},execute:async()=>({content:[{type:'image',mimeType:'image/png',data:'IMAGE'}]})}],async(_,init)=>{requests.push(JSON.parse(init.body));return requests.length===1?json({tool_calls:[call('a','capture','{}'),call('b','capture','{}')]}):json({content:'done'});});
  await session.run('capture',{endpoint:'http://localhost',model:'test',vision},()=>{},new AbortController().signal);
  const messages=requests[1].messages;
  assert.ok(!messages.filter(m=>m.role==='tool').some(m=>m.content.includes('base64')));
  assert.equal(messages.some(m=>Array.isArray(m.content)),vision);
  if(vision)assert.equal(messages.at(-2).role,'tool');
 }
});

test('default browser transport does not bind fetch to the session', async () => {
 const original = globalThis.fetch;
 globalThis.fetch = function () { assert.equal(this, undefined); return Promise.resolve(json({ content: 'Ready' })); };
 try {
  await new SceneChatSession([]).run('hello',{endpoint:'http://localhost',model:'test'},()=>{},new AbortController().signal);
 } finally { globalThis.fetch = original; }
});

test('an interrupted stream cannot execute a tool call even when its partial arguments happen to be valid JSON', async () => {
 let executions = 0, requests = 0;
 const data = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, ...call('a', 'edit', '{}') }] } }] })}\n\n`;
 const session = new SceneChatSession([{ name: 'edit', inputSchema: {}, execute: async () => { executions++; return result; } }],
  async () => ++requests === 1 ? new Response(data, { headers: { 'content-type': 'text/event-stream' } }) : json({ content: 'Done' }));
 await assert.rejects(session.run('edit', { endpoint: 'http://localhost', model: 'test' }, () => {}, new AbortController().signal), /stream ended before completion/i);
 assert.equal(executions, 0);
});

test('the DONE event completes a response without waiting for the server to close the connection', async () => {
 let canceled = false;
 const data = `data: ${JSON.stringify({ choices: [{ delta: { content: 'Done' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`;
 const session = new SceneChatSession([], async () => new Response(new ReadableStream({
  start(controller) { controller.enqueue(new TextEncoder().encode(data)); },
  cancel() { canceled = true; },
 }), { headers: { 'content-type': 'text/event-stream' } }));
 await session.run('hello', { endpoint: 'http://localhost', model: 'test' }, () => {}, AbortSignal.timeout(1500));
 assert.equal(canceled, true);
 assert.equal(session.messages.at(-1).content, 'Done');
});
