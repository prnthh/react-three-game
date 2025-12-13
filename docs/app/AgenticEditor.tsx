"use client";

import { useEffect, useState } from "react";

const OPENAI_KEY_STORAGE_KEY = "react-three-game.openaiApiKey";

type JsonValue = null | boolean | number | string | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

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
 */
function mergePrefab(base: any, patch: any): any {
    if (!isPlainObject(patch)) {
        // Primitive / array patch replaces base.
        return patch;
    }

    // Special operator for arrays: { "$append": [...] }
    if (Object.keys(patch).length === 1 && "$append" in patch) {
        const toAppend = (patch as any).$append;
        if (!Array.isArray(toAppend)) return base;
        return Array.isArray(base) ? [...base, ...toAppend] : [...toAppend];
    }

    if (Array.isArray(base)) {
        // Common case: patching an array property with {$append:[...]}
        if (Object.keys(patch).length === 1 && "$append" in patch) {
            const toAppend = (patch as any).$append;
            if (!Array.isArray(toAppend)) return base;
            return [...base, ...toAppend];
        }
        // Otherwise, treat as replacement.
        return patch;
    }

    const out: any = isPlainObject(base) ? { ...base } : {};
    for (const [k, v] of Object.entries(patch)) {
        const bv = (out as any)[k];
        if (Array.isArray(bv) && isPlainObject(v) && Object.keys(v).length === 1 && "$append" in v) {
            // Allow array append patches: { children: { "$append": [...] } }
            (out as any)[k] = mergePrefab(bv, v);
        } else if (isPlainObject(v) && isPlainObject(bv)) {
            (out as any)[k] = mergePrefab(bv, v);
        } else if (Array.isArray(v)) {
            // By default arrays replace to avoid accidental huge duplications.
            (out as any)[k] = v;
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

function stableStringify(v: any): string {
    const seen = new WeakSet<object>();
    return JSON.stringify(v, function (key, value) {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) return "[Circular]";
            seen.add(value);
        }
        return value;
    });
}

type AgenticEditorProps = {
    /** Current prefab JSON (owned by the page). */
    prefab: any;
    /** Update callback to replace the prefab JSON (owned by the page). */
    onPrefabChange: (nextPrefab: any) => void;
};

export default function AgenticEditor({
    prefab,
    onPrefabChange,
}: AgenticEditorProps) {
    const [openAiKey, setOpenAiKey] = useState<string>("");
    const [prompt, setPrompt] = useState<string>("");
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [aiRaw, setAiRaw] = useState<string>("");
    const [aiPatchPreview, setAiPatchPreview] = useState<any | null>(null);
    const [applyMode, setApplyMode] = useState<"merge" | "replace">("merge");
    const [previewMeta, setPreviewMeta] = useState<{
        beforeChildren: number | null;
        afterChildren: number | null;
        addedChildIds: string[];
    } | null>(null);

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

    useEffect(() => {
        // If the user changes prompt/key, clear stale preview errors.
        if (aiError) setAiError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prompt]);

    async function generatePrefabFromPrompt() {
        setAiError(null);
        setAiRaw("");
        setAiPatchPreview(null);
        setPreviewMeta(null);
        const key = openAiKey.trim();
        if (!key) {
            setAiError("Enter your OpenAI API key first.");
            return;
        }

        const userPrompt = prompt.trim();
        if (!userPrompt) {
            setAiError("Enter a prompt describing the prefab you want.");
            return;
        }

        setIsGenerating(true);
        try {
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
                    temperature: 0.2,
                    messages: [
                        {
                            role: "system",
                            content:
                                "You are an expert at generating react-three-game prefab edits as JSON patches.",
                        },
                        {
                            role: "user",
                            content:
                                `You will be given the current prefab JSON. Produce a SINGLE JSON object that represents a PATCH to apply.\n\nGoal: ${userPrompt}\n\nRules:\n- Output ONLY JSON (no markdown).\n- Prefer returning a patch that modifies ONLY the parts needed.\n- To add new items to an array without replacing it, use: {"$append": [ ... ]}.\n- If your patch touches transforms, keep them local (position/rotation/scale arrays; rotation in radians).\n- IDs should be stable simple strings; do not invent UUIDs unless necessary.\n\nCurrent prefab (for context):\n${JSON.stringify(prefab)}\n`,
                        },
                    ],
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`OpenAI error ${res.status}: ${text}`);
            }

            const data = await res.json();
            const content: unknown = data?.choices?.[0]?.message?.content;
            if (typeof content !== "string" || !content.trim()) {
                throw new Error("OpenAI returned an empty response.");
            }

            setAiRaw(content);

            const parsedPatch = normalizePatchForPrefab(tryExtractJson(content));
            if (!parsedPatch || typeof parsedPatch !== "object") {
                throw new Error("Parsed patch was not an object.");
            }

            // Build a preview of the next prefab without committing yet.
            const nextPrefab =
                applyMode === "replace" ? parsedPatch : mergePrefab(prefab, parsedPatch);

            const beforeChildren = Array.isArray((prefab as any)?.root?.children)
                ? (prefab as any).root.children.length
                : null;
            const afterChildren = Array.isArray((nextPrefab as any)?.root?.children)
                ? (nextPrefab as any).root.children.length
                : null;
            const beforeIds = new Set(
                Array.isArray((prefab as any)?.root?.children)
                    ? (prefab as any).root.children
                          .map((c: any) => (typeof c?.id === "string" ? c.id : null))
                          .filter(Boolean)
                    : []
            );
            const addedChildIds = Array.isArray((nextPrefab as any)?.root?.children)
                ? (nextPrefab as any).root.children
                      .map((c: any) => (typeof c?.id === "string" ? c.id : null))
                      .filter((id: any) => typeof id === "string" && !beforeIds.has(id))
                      .slice(0, 8)
                : [];
            setPreviewMeta({ beforeChildren, afterChildren, addedChildIds });

            // If merge produced no changes, surface a helpful warning.
            if (applyMode === "merge") {
                try {
                    const before = stableStringify(prefab);
                    const after = stableStringify(nextPrefab);
                    if (before === after) {
                        throw new Error(
                            "Patch preview produced no changes. If you meant to add nodes, ensure your patch targets root.children (or return {\"$append\":[...]} with valid node objects)."
                        );
                    }
                } catch (e: any) {
                    // stableStringify should be safe, but don't block preview on failures.
                    if (e?.message) setAiError(e.message);
                }
            }

            // Minimal normalization: ensure required fields exist to avoid editor crashes.
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
                    "Patch produced an invalid prefab: root.children must be an array. If you meant to append, use { root: { children: { \"$append\": [ ... ] } } }."
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

            setAiPatchPreview({ patch: parsedPatch, nextPrefab });
        } catch (e: any) {
            setAiError(e?.message ?? String(e));
        } finally {
            setIsGenerating(false);
        }
    }

    function applyPreview() {
        if (!aiPatchPreview?.nextPrefab) return;
        onPrefabChange(aiPatchPreview.nextPrefab);
        setAiPatchPreview(null);
        setPreviewMeta(null);
    }

    return (
        <>
            <div className="pointer-events-auto w-[360px] rounded-lg border border-gray-200 bg-white/90 p-3 text-sm text-black shadow backdrop-blur dark:border-gray-800 dark:bg-black/70 dark:text-white">
                <div className="mb-2 font-medium">AI Prefab Generator</div>

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

                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
                    <span>Apply mode</span>
                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1">
                            <input
                                type="radio"
                                name="applyMode"
                                checked={applyMode === "merge"}
                                onChange={() => setApplyMode("merge")}
                            />
                            <span>Merge patch</span>
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
                    </div>
                </div>

                <label className="mb-1 block text-xs text-gray-600 dark:text-gray-300">
                    Prompt
                </label>
                <textarea
                    className="mb-2 w-full resize-none rounded border border-gray-300 bg-white px-2 py-1 text-black outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-black dark:text-white"
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. A small room with a checker floor and a red spotlight"
                />

                <div className="flex items-center justify-between gap-2">
                    <button
                        className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50"
                        onClick={generatePrefabFromPrompt}
                        disabled={isGenerating}
                        type="button"
                    >
                        {isGenerating ? "Generating…" : "Generate"}
                    </button>

                    <button
                        className="rounded bg-emerald-600 px-3 py-1.5 text-white disabled:opacity-50"
                        onClick={applyPreview}
                        disabled={isGenerating || !aiPatchPreview?.nextPrefab}
                        type="button"
                        title={
                            aiPatchPreview?.nextPrefab
                                ? "Apply the previewed patch"
                                : "Generate a preview first"
                        }
                    >
                        Apply
                    </button>

                    <button
                        className="rounded border border-gray-300 px-3 py-1.5 text-black disabled:opacity-50 dark:border-gray-700 dark:text-white"
                        onClick={() => {
                            setAiError(null);
                            setPrompt("");
                            setAiRaw("");
                            setAiPatchPreview(null);
                        }}
                        disabled={isGenerating}
                        type="button"
                    >
                        Clear
                    </button>
                </div>

                {aiPatchPreview ? (
                    <div className="mt-2 rounded border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-800 dark:border-gray-800 dark:bg-black/30 dark:text-gray-200">
                        <div className="mb-1 font-medium">Preview ready</div>
                        <div className="space-y-1">
                            <div>
                                Patch keys: <span className="font-mono">{Object.keys(aiPatchPreview.patch ?? {}).join(", ") || "(none)"}</span>
                            </div>
                            <div>
                                Root children:{" "}
                                <span className="font-mono">
                                    {previewMeta?.beforeChildren ?? "?"} → {previewMeta?.afterChildren ?? "?"}
                                </span>
                            </div>
                            {previewMeta?.addedChildIds?.length ? (
                                <div>
                                    Added ids:{" "}
                                    <span className="font-mono">{previewMeta.addedChildIds.join(", ")}</span>
                                </div>
                            ) : null}
                        </div>
                        <details className="mt-2">
                            <summary className="cursor-pointer select-none">Show patch JSON</summary>
                            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px] text-black dark:bg-black dark:text-white">
                                {JSON.stringify(aiPatchPreview.patch, null, 2)}
                            </pre>
                        </details>
                    </div>
                ) : null}

                {aiRaw ? (
                    <details className="mt-2">
                        <summary className="cursor-pointer select-none text-xs text-gray-600 dark:text-gray-300">
                            Show raw model output
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-gray-200 bg-white p-2 font-mono text-[11px] text-black dark:border-gray-800 dark:bg-black dark:text-white">
                            {aiRaw}
                        </pre>
                    </details>
                ) : null}

                {aiError ? (
                    <div className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                        {aiError}
                    </div>
                ) : null}
            </div>
        </>
    );
}
