"use client";

import { useRef, useState, useEffect } from "react";
import { PrefabEditor, registerComponent } from "react-three-game";
import type { Prefab, PrefabEditorRef } from "react-three-game";
import { parseQuakeMap, quakeMapToPrefab } from "./quakeMapParser";
import QuakeBrushComponent from "./QuakeBrushComponent";

registerComponent(QuakeBrushComponent);

export default function QuakeMapDemo() {
    const editorRef = useRef<PrefabEditorRef | null>(null);
    const [mapPrefab, setMapPrefab] = useState<Prefab | null>(null);
    const [loading, setLoading] = useState(true);

    // Load and parse DM1 map
    useEffect(() => {
        fetch("/maps/dm1.map")
            .then((res) => res.text())
            .then((mapText) => {
                console.log("Parsing DM1 map...");
                const entities = parseQuakeMap(mapText);
                console.log(`Parsed ${entities.length} entities`);

                const prefab = quakeMapToPrefab(entities);
                console.log(`Generated ${prefab.root.children?.length || 0} objects`);

                setMapPrefab(prefab);
                setLoading(false);
            })
            .catch((err) => {
                console.error("Failed to load map:", err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-lg text-[#ffaa44]">
                Loading DM1 map...
            </div>
        );
    }

    if (!mapPrefab) {
        return (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-lg text-[#ff4444]">
                Failed to load map
            </div>
        );
    }

    return (
        <>
            {/* Info overlay */}
            <div className="absolute left-2.5 top-2.5 z-[900] rounded-lg bg-black/70 p-3 font-mono text-xs text-[#ffaa44]">
                <div className="mb-2 font-bold">
                    Quake DM1
                </div>
                <div className="text-[11px] text-[#ccaa88]">
                    <div>Place of Two Deaths</div>
                    <div>{mapPrefab.root.children?.length || 0} brushes</div>
                </div>
            </div>

            <div className="h-screen w-screen">

                {/* Map in editor mode */}
                <PrefabEditor ref={editorRef} initialPrefab={mapPrefab} />
            </div>
        </>
    );
}
