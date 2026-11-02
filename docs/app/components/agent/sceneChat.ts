import { createSceneToolGuide, type SceneTool, type SceneToolResult } from 'react-three-game/editor';

/** Chat transport policy only; scene concepts and workflows come from the shared guide. */
export const sceneChatSystemPrompt = [
    'You edit the live 3D scene using the supplied tools. Carry out requested edits through tools and report only changes confirmed by their results.',
    JSON.stringify((({ tools, examples, ...knowledge }) => knowledge)(createSceneToolGuide())),
    'Images returned by tools are shown to the user. They are sent to you only when vision is enabled. Without image input, do not claim visual inspection. Summarize actual changes and unresolved errors briefly.',
].join('\n');

export interface SceneChatConfig { endpoint: string; model: string; apiKey?: string; vision?: boolean }
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type ImagePart = { type: 'image_url'; image_url: { url: string } };
type TextPart = { type: 'text'; text: string };
export type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | (TextPart | ImagePart)[] | null; tool_calls?: ToolCall[]; tool_call_id?: string; reasoning_content?: string };
export type SceneChatEvent =
    | { type: 'user' | 'assistant' | 'delta' | 'status' | 'error'; text: string }
    | { type: 'request'; round: number; durationMs: number; usage?: unknown }
    | { type: 'toolStart'; id: string; name: string; arguments: string }
    | { type: 'toolEnd'; id: string; name: string; result: SceneToolResult; durationMs: number };

/** Accept a server root, /v1 base URL, or full chat-completions URL. */
export function sceneChatBaseURL(endpoint: string) {
    const url = new URL(endpoint.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('Use an HTTP(S) server URL without credentials, query or fragment.');
    let path = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
    if (!path.endsWith('/v1')) path += '/v1';
    url.pathname = path;
    return url.toString().replace(/\/$/, '');
}
const headers = (config: SceneChatConfig) => ({ 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) });
async function checkResponse(response: Response) {
    if (!response.ok) throw Error(`Model server returned ${response.status}: ${(await response.text()).slice(0, 1600)}`);
}
export async function listSceneChatModels(config: SceneChatConfig, signal?: AbortSignal, request: typeof fetch = fetch): Promise<string[]> {
    const response = await request(`${sceneChatBaseURL(config.endpoint)}/models`, { headers: headers(config), signal });
    await checkResponse(response);
    const body = await response.json();
    return Array.isArray(body.data) ? body.data.map((item: { id?: unknown }) => item.id).filter((id: unknown): id is string => typeof id === 'string') : [];
}

async function completion(response: Response, onDelta: (text: string) => void, signal: AbortSignal, onProgress: (text: string) => void) {
    await checkResponse(response);
    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        const body = await response.json(), choice = body.choices?.[0];
        if (!choice?.message) throw Error('Model server returned no assistant message.');
        return { message: choice.message, finish: choice.finish_reason, usage: body.usage };
    }
    if (!response.body) throw Error('Model server returned an empty stream.');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    const message: { content: string; reasoning_content: string; tool_calls: ToolCall[] } = { content: '', reasoning_content: '', tool_calls: [] };
    let buffer = '', finish: string | undefined, usage: unknown, lastProgress = 0, completed = false;
    const readEvent = (event: string) => {
        const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim();
        if (!data) return;
        if (data === '[DONE]') { completed = true; return; }
        const body = JSON.parse(data);
        if (body.error) throw Error(body.error.message ?? JSON.stringify(body.error));
        if (body.usage) usage = body.usage;
        const choice = body.choices?.[0];
        if (!choice) return;
        finish = choice.finish_reason ?? finish;
        const delta = choice.delta ?? {};
        if (typeof delta.content === 'string') { message.content += delta.content; onDelta(delta.content); }
        if (typeof delta.reasoning_content === 'string') message.reasoning_content += delta.reasoning_content;
        for (const call of delta.tool_calls ?? []) {
            const index = call.index ?? 0;
            if (!Number.isInteger(index) || index < 0 || index >= 64) throw Error('Invalid tool-call index from model server.');
            const current = message.tool_calls[index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } };
            if (call.id) current.id = call.id;
            if (call.function?.name) current.function.name += call.function.name;
            if (call.function?.arguments) current.function.arguments += call.function.arguments;
        }
        if (performance.now() - lastProgress > 1000) {
            lastProgress = performance.now();
            const calls = message.tool_calls.filter(Boolean);
            onProgress(calls.length ? `Generating ${calls.map(call => call.function.name || 'tool call').join(', ')} · ${calls.reduce((sum, call) => sum + call.function.arguments.length, 0)} argument characters`
                : message.reasoning_content ? `Model thinking · ${message.reasoning_content.length} characters received` : `Model responding · ${message.content.length} characters received`);
        }
    };
    const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    try {
        while (true) {
            signal.throwIfAborted();
            const { value, done } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            buffer = buffer.replace(/\r\n/g, '\n');
            let boundary;
            while (!completed && (boundary = buffer.indexOf('\n\n')) !== -1) { readEvent(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); }
            if (completed) break;
            if (done) { if (buffer.trim()) readEvent(buffer); break; }
        }
        signal.throwIfAborted();
        if (!completed && !finish) throw Error('Model stream ended before completion. No partial tool calls were executed.');
        return { message, finish, usage };
    } finally {
        signal.removeEventListener('abort', abort);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}

/** Endpoint-agnostic chat loop over the exact scene/WebMCP catalog. No eval,
 * argument repair, hidden scene mutations, or separate editing implementation. */
export class SceneChatSession {
    readonly messages: ChatMessage[] = [{ role: 'system', content: sceneChatSystemPrompt }];
    readonly events: (SceneChatEvent & { at: string })[] = [];
    private running = false;
    constructor(readonly tools: readonly SceneTool[], private request: typeof fetch = (input, init) => fetch(input, init)) {}
    transcript(config: SceneChatConfig) {
        return { version: 1, endpoint: config.endpoint, model: config.model, vision: !!config.vision,
            tools: this.tools.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })), messages: this.messages, events: this.events };
    }
    async run(text: string, config: SceneChatConfig, onEvent: (event: SceneChatEvent) => void, signal: AbortSignal,
        limits = { rounds: 16, calls: 64 }) {
        if (this.running) throw Error('A scene-agent turn is already running.');
        if (!text.trim() || !config.model.trim()) throw Error('Enter a message and model ID.');
        const base = sceneChatBaseURL(config.endpoint);
        signal.throwIfAborted();
        this.running = true;
        const emit = (event: SceneChatEvent) => { if (event.type !== 'delta') this.events.push({ ...event, at: new Date().toISOString() }); onEvent(event); };
        this.messages.push({ role: 'user', content: text }); emit({ type: 'user', text });
        let calls = 0;
        try {
            for (let round = 0; round < limits.rounds; round++) {
                signal.throwIfAborted(); emit({ type: 'status', text: `Waiting for model · round ${round + 1}` });
                const started = performance.now();
                const response = await this.request(`${base}/chat/completions`, {
                    method: 'POST', headers: headers(config), signal,
                    body: JSON.stringify({ model: config.model, messages: this.messages.map(message => !config.vision && Array.isArray(message.content)
                        ? { ...message, content: message.content.filter(part => part.type === 'text') } : message),
                    tools: this.tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })),
                    tool_choice: 'auto', temperature: 0.2, max_tokens: 4096, stream: true }),
                });
                const output = await completion(response, text => emit({ type: 'delta', text }), signal, text => emit({ type: 'status', text }));
                emit({ type: 'request', round: round + 1, durationMs: performance.now() - started, usage: output.usage });
                if (output.finish === 'length') throw Error('Model reached its output-token limit before finishing. No partial tool calls were executed.');
                const raw = output.message;
                const toolCalls: ToolCall[] = (raw.tool_calls ?? []).filter(Boolean).map((call: ToolCall, index: number) => ({
                    id: call.id || `call_${this.messages.length}_${index}`, type: 'function',
                    function: { name: call.function?.name ?? '', arguments: typeof call.function?.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function?.arguments ?? {}) },
                }));
                const content = typeof raw.content === 'string' ? raw.content : '';
                this.messages.push({ role: 'assistant', content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
                    ...(raw.reasoning_content ? { reasoning_content: raw.reasoning_content } : {}) });
                emit({ type: 'assistant', text: content });
                if (!toolCalls.length) {
                    if (!content) throw Error('Model returned neither an answer nor tool calls. Check its tool-use template in LM Studio.');
                    return;
                }
                const captures: ImagePart[] = [];
                let completed = 0;
                try {
                    for (const call of toolCalls) {
                        signal.throwIfAborted();
                        if (++calls > limits.calls) throw Error(`Stopped after ${limits.calls} tool calls. Review the trace before continuing.`);
                        emit({ type: 'toolStart', id: call.id, name: call.function.name, arguments: call.function.arguments });
                        const toolStarted = performance.now();
                        let result: SceneToolResult;
                        try {
                            const args = JSON.parse(call.function.arguments);
                            if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('Tool arguments must be a JSON object.');
                            const tool = this.tools.find(tool => tool.name === call.function.name);
                            if (!tool) throw Error(`Unknown tool: ${call.function.name}. Use a supplied scene tool.`);
                            result = await tool.execute(args, { signal });
                        } catch (error) {
                            if (signal.aborted) throw error;
                            result = { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
                        }
                        emit({ type: 'toolEnd', id: call.id, name: call.function.name, result, durationMs: performance.now() - toolStarted });
                        const texts = result.content.filter(block => block.type === 'text').map(block => block.text);
                        for (const image of result.content.filter(block => block.type === 'image')) {
                            texts.push(config.vision ? 'Capture image follows after the tool results.' : 'Capture shown to the user. Vision is disabled; no image was sent to the model.');
                            if (config.vision) captures.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
                        }
                        let reply = JSON.stringify({ isError: !!result.isError, text: texts.join('\n') });
                        if (reply.length > 32000) reply = JSON.stringify({ truncated: true, text: reply.slice(0, 30000), instruction: 'Query fewer IDs or a smaller page for the remaining data.' });
                        this.messages.push({ role: 'tool', tool_call_id: call.id, content: reply }); completed++;
                    }
                } catch (error) {
                    // Keep the protocol valid for a later turn after Stop or a step limit.
                    for (const call of toolCalls.slice(completed)) this.messages.push({ role: 'tool', tool_call_id: call.id,
                        content: JSON.stringify({ isError: true, text: 'Turn stopped before this call completed. Previously committed scene edits remain; inspect scene_info before continuing.' }) });
                    throw error;
                }
                if (captures.length) this.messages.push({ role: 'user', content: [{ type: 'text', text: 'Scene capture(s) from the preceding tool calls:' }, ...captures] });
            }
            throw Error(`Stopped after ${limits.rounds} model rounds. Review the trace before continuing.`);
        } catch (error) {
            emit({ type: 'error', text: signal.aborted ? 'Stopped. Completed scene edits remain in undo history.' : error instanceof Error ? error.message : String(error) });
            throw error;
        } finally { this.running = false; }
    }
}
