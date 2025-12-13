"use client";

import { useState } from "react";

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

    async function generatePrefabFromPrompt() {
        setAiError(null);
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
                                "You are an expert at generating react-three-game prefab JSON. Output ONLY valid JSON. No markdown, no commentary.",
                        },
                        {
                            role: "user",
                            content:
                                `Generate a prefab JSON object that matches this description.\n\nDescription: ${userPrompt}\n\nRequirements:\n- Return a single JSON object with keys: id and root\n- root must have: id, enabled, visible, components, children\n- Always include a Transform component in root.components.transform\n- Use arrays for position/rotation/scale (rotation in radians)\n- Keep ids as simple strings; no UUID required\n- Ensure the JSON is parseable\n`,
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

            let parsed: any;
            try {
                parsed = JSON.parse(content);
            } catch {
                // Fallback: try to extract the first JSON object.
                const match = content.match(/\{[\s\S]*\}/);
                if (!match) {
                    throw new Error("Model output was not valid JSON.");
                }
                parsed = JSON.parse(match[0]);
            }

            if (!parsed || typeof parsed !== "object") {
                throw new Error("Parsed prefab was not an object.");
            }
            if (!parsed.root || typeof parsed.root !== "object") {
                throw new Error("Prefab is missing required 'root' object.");
            }

            // Minimal normalization: ensure required fields exist to avoid editor crashes.
            parsed.id = parsed.id ?? "ai-prefab";
            parsed.root.id = parsed.root.id ?? "root";
            parsed.root.enabled = parsed.root.enabled ?? true;
            parsed.root.visible = parsed.root.visible ?? true;
            parsed.root.components = parsed.root.components ?? {};
            parsed.root.children = parsed.root.children ?? [];
            parsed.root.components.transform =
                parsed.root.components.transform ?? {
                    type: "Transform",
                    properties: {
                        position: [0, 0, 0],
                        rotation: [0, 0, 0],
                        scale: [1, 1, 1],
                    },
                };

            onPrefabChange(parsed);
        } catch (e: any) {
            setAiError(e?.message ?? String(e));
        } finally {
            setIsGenerating(false);
        }
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
                        className="rounded border border-gray-300 px-3 py-1.5 text-black disabled:opacity-50 dark:border-gray-700 dark:text-white"
                        onClick={() => {
                            setAiError(null);
                            setPrompt("");
                        }}
                        disabled={isGenerating}
                        type="button"
                    >
                        Clear
                    </button>
                </div>

                {aiError ? (
                    <div className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                        {aiError}
                    </div>
                ) : null}
            </div>
        </>
    );
}
