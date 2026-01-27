"use client";

import { useRef, useState, useEffect } from "react";
import { PrefabEditor } from "react-three-game";
import type { Prefab, PrefabEditorRef } from "react-three-game";
import { parseQuakeMap, quakeMapToPrefab } from "./quakeMapParser";

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
            <div
                style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    color: "#ffaa44",
                    fontFamily: '"Courier New", monospace',
                    fontSize: "18px",
                }}
            >
                Loading DM1 map...
            </div>
        );
    }

    if (!mapPrefab) {
        return (
            <div
                style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    color: "#ff4444",
                    fontFamily: '"Courier New", monospace',
                    fontSize: "18px",
                }}
            >
                Failed to load map
            </div>
        );
    }

    return (
        <>
            {/* Info overlay */}
            <div
                style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    background: "rgba(0, 0, 0, 0.7)",
                    color: "#ffaa44",
                    padding: "12px",
                    borderRadius: "8px",
                    fontFamily: '"Courier New", monospace',
                    fontSize: "12px",
                    zIndex: 900,
                }}
            >
                <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                    Quake DM1
                </div>
                <div style={{ fontSize: "11px", color: "#ccaa88" }}>
                    <div>Place of Two Deaths</div>
                    <div>{mapPrefab.root.children?.length || 0} brushes</div>
                </div>
            </div>

            <div className="w-screen h-screen">

                {/* Map in editor mode */}
                <PrefabEditor ref={editorRef} initialPrefab={mapPrefab} />
            </div>
        </>
    );
}
