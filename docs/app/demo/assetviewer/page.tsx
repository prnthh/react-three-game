"use client";
import { useEffect, useState } from "react";
import { ModelListViewer, SharedCanvas, SoundListViewer, TextureListViewer } from "react-three-game";

export default function AssetViewerPage({ basePath = "" }: { basePath?: string } = {}) {
    const [textures, setTextures] = useState<string[]>([]);
    const [models, setModels] = useState<string[]>([]);
    const [sounds, setSounds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            fetch(`${basePath}/textures/manifest.json`).then(r => r.json()),
            fetch(`${basePath}/models/manifest.json`).then(r => r.json()),
            fetch(`${basePath}/sound/manifest.json`).then(r => r.json()).catch(() => [])
        ]).then(([textureData, modelData, soundData]) => {
            setTextures(textureData);
            setModels(modelData);
            setSounds(soundData);
            setLoading(false);
        });
    }, [basePath]);

    if (loading) {
        return <div className="p-4 text-gray-300">Loading manifests...</div>;
    }

    return (
        <>
            <div className="p-2 text-gray-300 overflow-y-auto min-h-screen text-sm w-64 bg-gray-900 border-r border-gray-700">
                <h1 className="text-lg mb-2 font-bold">Asset Viewer</h1>

                <h2 className="text-sm mt-4 mb-1 font-semibold">Textures ({textures.length})</h2>
                <TextureListViewer files={textures} basePath={basePath} onSelect={(file) => console.log('Selected texture:', file)} />

                <h2 className="text-sm mt-4 mb-1 font-semibold">Models ({models.length})</h2>
                <ModelListViewer files={models} basePath={basePath} onSelect={(file) => console.log('Selected model:', file)} />

                {sounds.length > 0 && (
                    <>
                        <h2 className="text-sm mt-4 mb-1 font-semibold">Sounds ({sounds.length})</h2>
                        <SoundListViewer files={sounds} basePath={basePath} onSelect={(file) => console.log('Selected sound:', file)} />
                    </>
                )}
            </div>
            <SharedCanvas />
        </>
    );
}
