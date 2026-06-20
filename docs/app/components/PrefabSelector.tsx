"use client";

import { useEffect, useState } from "react";

import { withBasePath } from "../basePath";

type PrefabSelectorProps<T> = {
    selectedName?: string;
    onSelect: (prefab: T, name: string) => void;
    className?: string;
};

function normalizePrefabName(entry: string) {
    return entry.replace(/^.*\//, "").replace(/\.json$/, "");
}

function mergePrefabNames(manifestEntries: readonly string[], fallbackOptions: readonly string[]) {
    const seen = new Set<string>();
    const merged: string[] = [];

    for (const prefabName of [...manifestEntries.map(normalizePrefabName), ...fallbackOptions]) {
        if (!prefabName || seen.has(prefabName)) {
            continue;
        }

        seen.add(prefabName);
        merged.push(prefabName);
    }

    return merged;
}

function ensureSelectedName(prefabNames: readonly string[], selectedName?: string) {
    if (!selectedName || prefabNames.includes(selectedName)) {
        return [...prefabNames];
    }

    return [selectedName, ...prefabNames];
}

export default function PrefabSelector<T>({
    selectedName,
    onSelect,
    className = "bg-white text-black",
}: PrefabSelectorProps<T>) {
    const [prefabNames, setPrefabNames] = useState<string[]>([]);

    useEffect(() => {
        let cancelled = false;

        void fetch(withBasePath("/prefabs/manifest.json"))
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load prefab manifest (${response.status})`);
                }

                return response.json() as Promise<unknown>;
            })
            .then((entries) => {
                if (cancelled) {
                    return;
                }

                const manifestEntries = Array.isArray(entries)
                    ? entries.filter((entry): entry is string => typeof entry === "string")
                    : [];

                setPrefabNames(mergePrefabNames(manifestEntries, []));
            })
            .catch(() => {
                if (!cancelled) {
                    setPrefabNames([]);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const options = ensureSelectedName(prefabNames, selectedName);

    return (
        <select
            className={className}
            value={selectedName ?? ""}
            onChange={(event) => {
                const prefabName = event.target.value;
                if (!prefabName) {
                    return;
                }

                void fetch(withBasePath(`/prefabs/${prefabName}.json`))
                    .then((response) => {
                        if (!response.ok) {
                            throw new Error(`Failed to load prefab ${prefabName} (${response.status})`);
                        }

                        return response.json() as Promise<T>;
                    })
                    .then((prefab) => onSelect(prefab, prefabName));
            }}
        >
            <option value="">- select prefab -</option>
            {options.map((prefabName) => (
                <option key={prefabName} value={prefabName}>{prefabName}</option>
            ))}
        </select>
    );
}