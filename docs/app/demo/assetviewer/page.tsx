"use client";
import { useEffect, useState } from "react";
import { loadAssetManifest, ModelListViewer, SoundListViewer, TextureListViewer } from "react-three-game/editor";
import { BASE_PATH } from "../../basePath";

export default function AssetViewerPage() {
    const basePath = BASE_PATH;
    const [textures, setTextures] = useState<string[]>([]);
    const [models, setModels] = useState<string[]>([]);
    const [sounds, setSounds] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        void loadAssetManifest(basePath).then(manifest => {
            if (!active) return;
            setTextures(manifest.textures);
            setModels(manifest.models);
            setSounds(manifest.sound);
        }).catch(error => { if (active) setError(error.message); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [basePath]);

    if (error) return <div role="alert" className="p-4 text-red-300">{error}</div>;

    if (loading) {
        return <div className="p-4 text-gray-300">Loading assets...</div>;
    }

    return (
        <div className="p-2 text-gray-300 overflow-y-auto min-h-screen text-sm w-64 bg-gray-900 border-r border-gray-700">
                <h1 className="text-lg mb-2 font-bold">Asset Viewer</h1>

                <h2 className="text-sm mt-4 mb-1 font-semibold">Textures ({textures.length})</h2>
                <TextureListViewer files={textures} basePath={basePath} onSelect={() => { }} />

                <h2 className="text-sm mt-4 mb-1 font-semibold">Models ({models.length})</h2>
                <ModelListViewer files={models} basePath={basePath} onSelect={() => { }} />

                {sounds.length > 0 && (
                    <>
                        <h2 className="text-sm mt-4 mb-1 font-semibold">Sounds ({sounds.length})</h2>
                        <SoundListViewer files={sounds} onSelect={() => { }} />
                    </>
                )}
        </div>
    );
}
