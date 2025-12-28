"use client";

import { useEffect, useState, useRef } from "react";

const OPENAI_KEY_STORAGE_KEY = "react-three-game.openaiApiKey";

type JsonValue = null | boolean | number | string | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type ChatMessage = {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
    canvasImage?: string;
    patch?: any;
    prefabSnapshot?: any;
    error?: string;
    applied?: boolean;
    streaming?: boolean;
};

function isPlainObject(v: unknown): v is Record<string, any> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function tryExtractJson(text: string): any {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Model returned an empty response.");

    // If the model returns fenced code blocks, prefer the first JSON block.
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fenced?.[1]?.trim() || trimmed;

    try {
        return JSON.parse(candidate);
    } catch {
        // Fallback: try to extract the first JSON object or array.
        const objMatch = candidate.match(/\{[\s\S]*\}/);
        const arrMatch = candidate.match(/\[[\s\S]*\]/);
        const match = objMatch ?? arrMatch;
        if (!match) {
            throw new Error("Model output was not valid JSON.");
        }
        return JSON.parse(match[0]);
    }
}

/**
 * Deep-merge helper with a prefab-friendly rule:
 * - Objects merge recursively
 * - Arrays: default is to REPLACE unless the patch explicitly uses {$append: [...]}
 * - Supports targeted updates by ID for array elements
 */
function mergePrefab(base: any, patch: any): any {
    if (!isPlainObject(patch)) {
        // Primitive / array patch replaces base.
        return patch;
    }

    // Special operator for arrays: { "$append": [...] } or { "$delete": [...] }
    if (Object.keys(patch).length === 1 && "$append" in patch) {
        const toAppend = (patch as any).$append;
        if (!Array.isArray(toAppend)) return base;
        return Array.isArray(base) ? [...base, ...toAppend] : [...toAppend];
    }
    if (Object.keys(patch).length === 1 && "$delete" in patch) {
        const toDelete = (patch as any).$delete;
        if (!Array.isArray(toDelete) || !Array.isArray(base)) return base;
        return base.filter((item: any) => {
            if (isPlainObject(item) && typeof item.id === "string") {
                return !toDelete.includes(item.id);
            }
            return true;
        });
    }

    if (Array.isArray(base)) {
        // Handle array of patches - if patch is array, check if it contains ID-based updates
        if (Array.isArray(patch)) {
            // Check if this looks like ID-based selective updates
            const patchById = new Map<string, any>();
            let hasIdPatches = false;

            for (const item of patch) {
                if (isPlainObject(item) && typeof item.id === "string") {
                    patchById.set(item.id, item);
                    hasIdPatches = true;
                }
            }

            if (hasIdPatches) {
                // Apply ID-based patches to matching elements
                return base.map((baseItem: any) => {
                    if (isPlainObject(baseItem) && typeof baseItem.id === "string") {
                        const patchItem = patchById.get(baseItem.id);
                        if (patchItem) {
                            return mergePrefab(baseItem, patchItem);
                        }
                    }
                    return baseItem;
                });
            }
        }

        // Common case: patching an array property with {$append:[...]} or {$delete:[...]}
        if (isPlainObject(patch) && Object.keys(patch).length === 1 && "$append" in patch) {
            const toAppend = (patch as any).$append;
            if (!Array.isArray(toAppend)) return base;
            return [...base, ...toAppend];
        }
        if (isPlainObject(patch) && Object.keys(patch).length === 1 && "$delete" in patch) {
            const toDelete = (patch as any).$delete;
            if (!Array.isArray(toDelete)) return base;
            return base.filter((item: any) => {
                if (isPlainObject(item) && typeof item.id === "string") {
                    return !toDelete.includes(item.id);
                }
                return true;
            });
        }

        // Otherwise, treat as replacement.
        return patch;
    }

    const out: any = isPlainObject(base) ? { ...base } : {};
    for (const [k, v] of Object.entries(patch)) {
        const bv = (out as any)[k];
        if (Array.isArray(bv) && isPlainObject(v) && Object.keys(v).length === 1 && ("$append" in v || "$delete" in v)) {
            // Allow array append/delete patches: { children: { "$append": [...] } } or { children: { "$delete": [...] } }
            (out as any)[k] = mergePrefab(bv, v);
        } else if (isPlainObject(v) && isPlainObject(bv)) {
            (out as any)[k] = mergePrefab(bv, v);
        } else if (Array.isArray(v)) {
            // Enhanced: merge arrays with ID-based targeting
            (out as any)[k] = mergePrefab(bv, v);
        } else {
            (out as any)[k] = v;
        }
    }
    return out;
}

function isAppendOnlyPatch(patch: any): patch is { $append: any[] } {
    return (
        isPlainObject(patch) &&
        Object.keys(patch).length === 1 &&
        "$append" in patch &&
        Array.isArray((patch as any).$append)
    );
}

function looksLikePrefabNode(v: any): boolean {
    return isPlainObject(v) && typeof v.id === "string" && isPlainObject(v.components);
}

/**
 * Convenience: if the model returns a bare {"$append": [...]} patch,
 * interpret it as appending children to prefab.root.children.
 */
function normalizePatchForPrefab(patch: any): any {
    if (!isAppendOnlyPatch(patch)) return patch;
    const append = (patch as any).$append;
    if (append.length === 0) return patch;
    // If it looks like prefab nodes, treat as root children append.
    if (append.every(looksLikePrefabNode)) {
        return { root: { children: { $append: append } } };
    }
    return patch;
}

/**
 * Validates a patch to ensure it won't crash the editor
 */
function validatePatch(patch: any): void {
    function validateNode(node: any, path: string): void {
        if (!isPlainObject(node)) return;

        // If this looks like a prefab node, validate it
        if (typeof node.id === "string") {
            if (!isPlainObject(node.components)) {
                throw new Error(`Node at ${path} has id "${node.id}" but missing or invalid components object`);
            }

            // Validate transform if present
            const transform = node.components.transform;
            if (transform) {
                if (!isPlainObject(transform.properties)) {
                    throw new Error(`Node "${node.id}" has invalid transform properties`);
                }
                const props = transform.properties;

                // For $append operations, require complete transform
                if (path.includes("$append")) {
                    if (!Array.isArray(props.position) || props.position.length !== 3) {
                        throw new Error(`Node "${node.id}" in $append must have complete position [x,y,z]`);
                    }
                    if (!Array.isArray(props.rotation) || props.rotation.length !== 3) {
                        throw new Error(`Node "${node.id}" in $append must have complete rotation [x,y,z]`);
                    }
                    if (!Array.isArray(props.scale) || props.scale.length !== 3) {
                        throw new Error(`Node "${node.id}" in $append must have complete scale [x,y,z]`);
                    }
                }

                // General validation
                if (props.position && !Array.isArray(props.position)) {
                    throw new Error(`Node "${node.id}" has invalid position (must be array)`);
                }
                if (props.rotation && !Array.isArray(props.rotation)) {
                    throw new Error(`Node "${node.id}" has invalid rotation (must be array)`);
                }
                if (props.scale && !Array.isArray(props.scale)) {
                    throw new Error(`Node "${node.id}" has invalid scale (must be array)`);
                }
            }

            // Validate children if present
            if (node.children !== undefined && !Array.isArray(node.children)) {
                throw new Error(`Node "${node.id}" has invalid children (must be array)`);
            }
        }

        // Recursively validate nested objects and arrays
        for (const [key, value] of Object.entries(node)) {
            if (key === "$append" && Array.isArray(value)) {
                value.forEach((item, i) => validateNode(item, `${path}.$append[${i}]`));
            } else if (Array.isArray(value)) {
                value.forEach((item, i) => validateNode(item, `${path}.${key}[${i}]`));
            } else if (isPlainObject(value)) {
                validateNode(value, `${path}.${key}`);
            }
        }
    }

    validateNode(patch, "patch");
}

type AgenticEditorProps = {
    /** Current prefab JSON (owned by the page). */
    prefab: any;
    /** Update callback to replace the prefab JSON (owned by the page). */
    onPrefabChange: (nextPrefab: any) => void;
    /** Optional: Ref to the canvas element for screenshot capture. */
    canvasRef?: React.RefObject<HTMLCanvasElement>;
};

export default function AgenticEditor({
    prefab,
    onPrefabChange,
    canvasRef,
}: AgenticEditorProps) {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const [openAiKey, setOpenAiKey] = useState<string>("");
    const [prompt, setPrompt] = useState<string>("");
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [applyMode, setApplyMode] = useState<"merge" | "replace">("merge");
    const [useVision, setUseVision] = useState<boolean>(true);

    // Chat-based state
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const messagesRef = useRef<ChatMessage[]>([]);
    const [prefabHistory, setPrefabHistory] = useState<any[]>([prefab]);
    const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Keep ref in sync with state
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Persist the key between sessions (client-only).
    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(OPENAI_KEY_STORAGE_KEY);
            if (saved) setOpenAiKey(saved);
        } catch {
            // Ignore storage access errors (private mode / blocked storage).
        }
    }, []);

    useEffect(() => {
        try {
            if (!openAiKey) {
                window.localStorage.removeItem(OPENAI_KEY_STORAGE_KEY);
            } else {
                window.localStorage.setItem(OPENAI_KEY_STORAGE_KEY, openAiKey);
            }
        } catch {
            // Ignore storage access errors.
        }
    }, [openAiKey]);

    // Auto-scroll to bottom of messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function captureCanvasImage(): Promise<string | null> {
        if (!canvasRef?.current || !useVision) {
            return null;
        }

        try {
            const canvas = canvasRef.current;
            const imageData = canvas.toDataURL("image/png");
            return imageData;
        } catch (e) {
            console.warn("Failed to capture canvas image:", e);
            return null;
        }
    }

    // Continue conversation without new user input (for auto-iteration)
    async function continueConversation() {
        const key = openAiKey.trim();
        if (!key) return;

        setIsGenerating(true);

        try {
            await makeApiCall(key, null);
        } catch (e: any) {
            const errorMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: "system",
                content: `❌ Error: ${e?.message ?? String(e)}`,
                timestamp: Date.now(),
                error: e?.message ?? String(e),
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsGenerating(false);
        }
    }

    async function sendMessage() {
        const userPrompt = prompt.trim();
        if (!userPrompt) return;

        const key = openAiKey.trim();
        if (!key) {
            const errorMsg: ChatMessage = {
                id: Date.now().toString(),
                role: "system",
                content: "⚠️ Please enter your OpenAI API key first.",
                timestamp: Date.now(),
                error: "No API key",
            };
            setMessages(prev => [...prev, errorMsg]);
            return;
        }

        // Capture canvas before request
        const canvasImage = await captureCanvasImage();

        // Add user message
        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: "user",
            content: userPrompt,
            timestamp: Date.now(),
            canvasImage: canvasImage ?? undefined,
            prefabSnapshot: JSON.parse(JSON.stringify(prefab)),
        };
        setMessages(prev => [...prev, userMessage]);
        setPrompt("");
        setIsGenerating(true);

        try {
            await makeApiCall(key, userPrompt);
        } catch (e: any) {
            const errorMsg: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: "system",
                content: `❌ Error: ${e?.message ?? String(e)}`,
                timestamp: Date.now(),
                error: e?.message ?? String(e),
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsGenerating(false);
        }
    }

    // Core API call logic (used by both sendMessage and continueConversation)
    async function makeApiCall(key: string, userPrompt: string | null) {
        // Build conversation history for the AI
        const apiMessages: any[] = [
            {
                role: "system",
                content: "You are an expert at generating react-three-game prefab edits as JSON patches. You can see the current 3D scene and understand the spatial layout of objects.\n\nYou can work iteratively across multiple turns. After applying a patch, you will receive a screenshot of the result. If the result is not perfect, you can continue making adjustments in subsequent turns until the user's goal is achieved."
            },
        ];

        // Use ref to get latest messages (avoid closure issues)
        const recentMessages = messagesRef.current.slice(-10).filter(m =>
            (m.role === "user" || m.role === "assistant" || m.role === "system") &&
            (m.canvasImage || m.content)
        );

        for (const histMsg of recentMessages) {
            if (histMsg.role === "user" && histMsg.canvasImage) {
                apiMessages.push({
                    role: "user",
                    content: [
                        { type: "text", text: `User request: ${histMsg.content}` },
                        { type: "image_url", image_url: { url: histMsg.canvasImage, detail: "low" } }
                    ]
                });
            } else if (histMsg.role === "assistant" && histMsg.patch) {
                apiMessages.push({
                    role: "assistant",
                    content: JSON.stringify(histMsg.patch)
                });
            } else if (histMsg.role === "system" && histMsg.canvasImage) {
                apiMessages.push({
                    role: "user",
                    content: [
                        { type: "text", text: histMsg.content },
                        { type: "image_url", image_url: { url: histMsg.canvasImage, detail: "low" } }
                    ]
                });
            }
        }

        // Add context prompt (either with new user goal or as continuation)
        if (userPrompt) {
            // New user request - include full prompt with goal
            const canvasImage = await captureCanvasImage();
            const enhancedPrompt = `You will be given the current prefab JSON${canvasImage ? " and a screenshot of the 3D scene" : ""}. Produce a SINGLE JSON object that represents a PATCH to apply.

Goal: ${userPrompt}

${recentMessages.length > 0 ? "You are working iteratively. Review the previous screenshots and patches to understand what has been done so far. Make incremental improvements until the goal is achieved." : ""}

CRITICAL RULES:
1. Output ONLY valid JSON (no text/markdown before or after, no comments)
2. All numbers must be bare numbers, NOT strings: position:[0,1,2] NOT position:["0","1","2"]
3. Each object MUST have a UNIQUE id (cube1, cube2, cube3 - NOT all "cube1")
4. Transform MUST include ALL THREE: position:[x,y,z], rotation:[x,y,z], scale:[x,y,z]
5. NEVER use UUID-like ids from the scene - those are read-only
6. DO NOT include "enabled" or "visible" fields

OPERATIONS:
ADD: {"root":{"children":{"$append":[{id:"cube1",components:{transform:{type:"Transform",properties:{position:[2,0,0],rotation:[0,0,0],scale:[1,1,1]}},mesh:{type:"Mesh",properties:{geometry:"box",material:"standard",color:"#ff0000"}}},children:[]}]}}}
DELETE: {"root":{"children":{"$delete":["id1","id2"]}}}
MODIFY: {"root":{"children":[{id:"cube1",components:{transform:{type:"Transform",properties:{position:[5,0,0],rotation:[0,0,0],scale:[1,1,1]}}}}]}}

COMMON MISTAKES TO AVOID:
❌ "position":["0","1","2"] → ✅ "position":[0,1,2] (numbers not strings!)
❌ Multiple objects with id:"cube1" → ✅ id:"cube1", id:"cube2", id:"cube3" (unique!)
❌ Partial transform → ✅ Include position AND rotation AND scale
❌ Using UUIDs from scene → ✅ Use simple ids or $delete operation

Current prefab:
${JSON.stringify(prefab, null, 2)}
`;

            if (canvasImage) {
                // Use vision model with image
                apiMessages.push({
                    role: "user",
                    content: [
                        { type: "text", text: enhancedPrompt },
                        { type: "image_url", image_url: { url: canvasImage, detail: "low" } }
                    ],
                });
            } else {
                // Text-only fallback
                apiMessages.push({
                    role: "user",
                    content: enhancedPrompt,
                });
            }
        } else {
            // Auto-continue - the evaluation screenshot was already added to conversation history
            // No need to add another message - just let the AI respond to the evaluation
        }

        // NOTE: This calls OpenAI directly from the browser.
        // For production you should proxy via a Next.js route to avoid exposing keys.
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: apiMessages,
                stream: true,
            }),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`OpenAI error ${res.status}: ${text}`);
        }

        // Create streaming assistant message
        const assistantId = (Date.now() + 1).toString();
        const assistantMessage: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
            streaming: true,
        };
        setMessages(prev => [...prev, assistantMessage]);

        // Process the stream
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = "";

        if (!reader) {
            throw new Error("Failed to get response stream reader");
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter(line => line.trim() !== "");

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const data = line.slice(6);
                    if (data === "[DONE]") continue;

                    try {
                        const parsed = JSON.parse(data);

                        // Handle Chat Completions API streaming format
                        const delta = parsed.choices?.[0]?.delta?.content;
                        if (delta) {
                            accumulatedContent += delta;
                            // Update message with streaming content
                            setMessages(prev =>
                                prev.map(m =>
                                    m.id === assistantId
                                        ? { ...m, content: accumulatedContent }
                                        : m
                                )
                            );
                        }
                    } catch (e) {
                        console.warn("Failed to parse streaming chunk:", e);
                    }
                }
            }
        }

        // Stream complete - parse the final content
        if (!accumulatedContent.trim()) {
            throw new Error("Model returned an empty response.");
        }

        // Try to parse as JSON - if it fails, treat as conversational response
        let parsedPatch;
        try {
            parsedPatch = normalizePatchForPrefab(tryExtractJson(accumulatedContent));
        } catch (e) {
            // Not valid JSON - conversational response, stop iteration
            setMessages(prev =>
                prev.map(m =>
                    m.id === assistantId
                        ? {
                            ...m,
                            content: accumulatedContent,
                            streaming: false,
                        }
                        : m
                )
            );
            return; // Stop iteration - let user respond
        }

        if (!parsedPatch || typeof parsedPatch !== "object") {
            // Not a valid patch object - conversational response
            setMessages(prev =>
                prev.map(m =>
                    m.id === assistantId
                        ? {
                            ...m,
                            content: accumulatedContent,
                            streaming: false,
                        }
                        : m
                )
            );
            return; // Stop iteration - let user respond
        }

        // Validate patch structure to prevent crashes
        validatePatch(parsedPatch);

        // Update message with final patch (mark as applied immediately)
        setMessages(prev =>
            prev.map(m =>
                m.id === assistantId
                    ? {
                        ...m,
                        content: `Generated patch with keys: ${Object.keys(parsedPatch).join(", ")}`,
                        patch: parsedPatch,
                        streaming: false,
                        applied: true,
                    }
                    : m
            )
        );

        // Auto-apply the patch
        await applyPatchAuto(parsedPatch);
    }

    async function applyPatchAuto(patch: any) {
        try {
            const nextPrefab =
                applyMode === "replace" ? patch : mergePrefab(prefab, patch);

            // Minimal normalization
            if (!nextPrefab || typeof nextPrefab !== "object") {
                throw new Error("Patch result is not an object.");
            }
            (nextPrefab as any).id = (nextPrefab as any).id ?? prefab?.id ?? "scene";
            (nextPrefab as any).root = (nextPrefab as any).root ?? (prefab as any)?.root;
            if (!(nextPrefab as any).root || typeof (nextPrefab as any).root !== "object") {
                throw new Error("Patch result is missing required 'root' object.");
            }

            (nextPrefab as any).root.id = (nextPrefab as any).root.id ?? "root";
            (nextPrefab as any).root.enabled = (nextPrefab as any).root.enabled ?? true;
            (nextPrefab as any).root.visible = (nextPrefab as any).root.visible ?? true;
            (nextPrefab as any).root.components = (nextPrefab as any).root.components ?? {};
            (nextPrefab as any).root.children = (nextPrefab as any).root.children ?? [];
            if (!Array.isArray((nextPrefab as any).root.children)) {
                throw new Error(
                    "Patch produced an invalid prefab: root.children must be an array."
                );
            }
            (nextPrefab as any).root.components.transform =
                (nextPrefab as any).root.components.transform ?? {
                    type: "Transform",
                    properties: {
                        position: [0, 0, 0],
                        rotation: [0, 0, 0],
                        scale: [1, 1, 1],
                    },
                };

            // Apply to prefab
            onPrefabChange(nextPrefab);

            // Save to history
            setPrefabHistory(prev => [...prev, nextPrefab]);
            setCurrentHistoryIndex(prev => prev + 1);

            // Capture result screenshot and add system message with critic prompt
            const resultImage = await captureCanvasImage();
            const resultMsg: ChatMessage = {
                id: (Date.now() + 2).toString(),
                role: "system",
                content: "✅ Patch applied successfully. Here's the result:\n\nEvaluate the scene:\n- If it fully satisfies the goal: Output ONLY a JSON patch to continue improving\n- If you need clarification or the goal is achieved: Respond conversationally to discuss with the user",
                timestamp: Date.now(),
                canvasImage: resultImage ?? undefined,
            };

            // Add evaluation message to state and ref
            setMessages(prev => [...prev, resultMsg]);
            messagesRef.current = [...messagesRef.current, resultMsg];

            // Auto-continue immediately (ref has latest messages)
            await continueConversation();
        } catch (e: any) {
            const errorMsg: ChatMessage = {
                id: (Date.now() + 2).toString(),
                role: "system",
                content: `❌ Failed to apply patch: ${e?.message ?? String(e)}`,
                timestamp: Date.now(),
                error: e?.message ?? String(e),
            };
            setMessages(prev => [...prev, errorMsg]);
        }
    }

    function rollback() {
        if (currentHistoryIndex <= 0) return;

        const prevIndex = currentHistoryIndex - 1;
        const prevPrefab = prefabHistory[prevIndex];

        onPrefabChange(prevPrefab);
        setCurrentHistoryIndex(prevIndex);

        // Add system message
        const rollbackMsg: ChatMessage = {
            id: Date.now().toString(),
            role: "system",
            content: `↩️ Rolled back to version ${prevIndex + 1}/${prefabHistory.length}`,
            timestamp: Date.now(),
        };
        setMessages(prev => [...prev, rollbackMsg]);
    }

    function clearChat() {
        setMessages([]);
        setPrefabHistory([prefab]);
        setCurrentHistoryIndex(0);
    }

    return (
        <>
            {!isExpanded ? (
                <button
                    className="pointer-events-auto rounded-lg border border-gray-200 bg-white/90 px-4 py-2 text-sm font-medium text-black shadow backdrop-blur hover:bg-white dark:border-gray-800 dark:bg-black/70 dark:text-white dark:hover:bg-black/80"
                    onClick={() => setIsExpanded(true)}
                    type="button"
                >
                    🤖
                </button>
            ) : (
                <div className="pointer-events-auto flex h-[600px] w-[420px] flex-col rounded-lg border border-gray-200 bg-white/90 shadow backdrop-blur dark:border-gray-800 dark:bg-black/70">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-200 p-3 dark:border-gray-800">
                        <div className="font-medium text-black dark:text-white">AI Prefab Editor</div>
                        <button
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            onClick={() => setIsExpanded(false)}
                            type="button"
                            title="Collapse"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Settings */}
                    <div className="border-b border-gray-200 p-3 text-sm dark:border-gray-800">
                        <label className="mb-1 block text-xs text-gray-600 dark:text-gray-300">
                            OpenAI API key
                        </label>
                        <input
                            className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-black outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-black dark:text-white"
                            type="password"
                            value={openAiKey}
                            onChange={(e) => setOpenAiKey(e.target.value)}
                            placeholder="sk-..."
                            autoComplete="off"
                        />

                        <div className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
                            <label className="flex items-center gap-1">
                                <input
                                    type="radio"
                                    name="applyMode"
                                    checked={applyMode === "merge"}
                                    onChange={() => setApplyMode("merge")}
                                />
                                <span>Merge</span>
                            </label>
                            <label className="flex items-center gap-1">
                                <input
                                    type="radio"
                                    name="applyMode"
                                    checked={applyMode === "replace"}
                                    onChange={() => setApplyMode("replace")}
                                />
                                <span>Replace</span>
                            </label>
                            <label className="flex items-center gap-1">
                                <input
                                    type="checkbox"
                                    checked={useVision}
                                    onChange={(e) => setUseVision(e.target.checked)}
                                    disabled={!canvasRef?.current}
                                />
                                <span>Vision {canvasRef?.current ? "✓" : "✗"}</span>
                            </label>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {messages.length === 0 ? (
                            <div className="text-center text-xs text-gray-500 dark:text-gray-400 mt-8">
                                Start by typing a prompt below to edit the scene.
                                <br />
                                Example: "Add a red cube at position [2, 0, 0]"
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`rounded-lg p-2 text-xs ${msg.role === "user"
                                        ? "bg-blue-100 dark:bg-blue-900/30"
                                        : msg.role === "assistant"
                                            ? "bg-gray-100 dark:bg-gray-800/50"
                                            : "bg-yellow-100 dark:bg-yellow-900/30"
                                        }`}
                                >
                                    <div className="mb-1 font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                        <span>{msg.role === "user" ? "You" : msg.role === "assistant" ? "Assistant" : "System"}</span>
                                        {msg.streaming && (
                                            <span className="text-blue-600 dark:text-blue-400 animate-pulse">●</span>
                                        )}
                                    </div>
                                    {msg.role === "assistant" && msg.streaming && !msg.content ? (
                                        <div className="text-gray-600 dark:text-gray-400 italic flex items-center gap-2">
                                            <span className="animate-pulse">●</span>
                                            <span>Thinking...</span>
                                        </div>
                                    ) : msg.role === "assistant" && msg.content && msg.streaming ? (
                                        <details open className="mt-1">
                                            <summary className="cursor-pointer select-none text-gray-600 dark:text-gray-400 font-medium">
                                                Generating response...
                                            </summary>
                                            <div className="mt-2 text-black dark:text-white whitespace-pre-wrap font-mono text-[10px] max-h-48 overflow-auto">
                                                {msg.content}
                                                <span className="animate-pulse">▋</span>
                                            </div>
                                        </details>
                                    ) : (
                                        <div className="text-black dark:text-white whitespace-pre-wrap">
                                            {msg.content}
                                        </div>
                                    )}

                                    {msg.canvasImage && (
                                        <details className="mt-2">
                                            <summary className="cursor-pointer select-none text-gray-600 dark:text-gray-400">
                                                View screenshot
                                            </summary>
                                            <img
                                                src={msg.canvasImage}
                                                alt="Canvas"
                                                className="mt-1 max-w-full rounded border border-gray-300 dark:border-gray-700"
                                            />
                                        </details>
                                    )}

                                    {msg.patch && (
                                        <div className="mt-2 space-y-1">
                                            <details>
                                                <summary className="cursor-pointer select-none text-gray-600 dark:text-gray-400">
                                                    View patch JSON
                                                </summary>
                                                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[10px] text-black dark:bg-black dark:text-white">
                                                    {JSON.stringify(msg.patch, null, 2)}
                                                </pre>
                                            </details>
                                            {msg.applied && (
                                                <div className="text-center text-green-600 dark:text-green-400">
                                                    ✓ Auto-applied
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Toolbar */}
                    <div className="border-t border-gray-200 p-2 flex items-center gap-1 text-xs dark:border-gray-800">
                        <button
                            className="rounded bg-gray-200 px-2 py-1 text-black hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                            onClick={rollback}
                            disabled={currentHistoryIndex <= 0}
                            title="Rollback to previous version"
                            type="button"
                        >
                            ↩️ Rollback
                        </button>
                        <button
                            className="rounded bg-gray-200 px-2 py-1 text-black hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                            onClick={clearChat}
                            title="Clear chat"
                            type="button"
                        >
                            🗑️ Clear
                        </button>
                        <div className="text-gray-500 dark:text-gray-400 ml-auto">
                            v{currentHistoryIndex + 1}/{prefabHistory.length}
                        </div>
                    </div>

                    {/* Input */}
                    <div className="border-t border-gray-200 p-3 dark:border-gray-800">
                        <textarea
                            className="mb-2 w-full resize-none rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-black dark:text-white"
                            rows={2}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage();
                                }
                            }}
                            placeholder="Describe what you want to change..."
                            disabled={isGenerating}
                        />
                        <button
                            className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            onClick={sendMessage}
                            disabled={isGenerating || !prompt.trim()}
                            type="button"
                        >
                            {isGenerating ? "Generating..." : "Send"}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
