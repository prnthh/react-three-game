"use client";
import { memo, useEffect, useState } from "react";
import { loadAssetManifest, ModelListViewer, SoundListViewer, TextureListViewer, SingleModelViewer, SingleTextureViewer, SharedCanvas } from "react-three-game/editor";
import { BASE_PATH, withBasePath } from "../../basePath";

type Selection = { kind: 'texture' | 'model' | 'sound'; file: string };

export default function AssetViewerPage() {
    const basePath = BASE_PATH;
    const [textures, setTextures] = useState<string[]>([]);
    const [models, setModels] = useState<string[]>([]);
    const [sounds, setSounds] = useState<string[]>([]);
    const [selected, setSelected] = useState<Selection | null>(null);
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

    return <><main className="flex h-screen flex-col bg-gray-900 text-sm text-gray-300 sm:flex-row">
        <AssetBrowser textures={textures} models={models} sounds={sounds} onSelect={setSelected} />
        <section aria-label="Selected asset preview" className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-auto p-6">
            {selected ? <>
                <h2 className="mb-1 break-all text-lg font-semibold text-white">{selected.file.split('/').pop()}</h2>
                <p className="mb-6 break-all text-xs text-gray-400">{selected.file}</p>
                {selected.kind === 'sound'
                    ? <audio key={selected.file} aria-label="Sound preview" controls autoPlay preload="metadata"
                        src={withBasePath(selected.file)} className="w-full max-w-xl" />
                    : <div className="aspect-square w-full max-w-[65vh]">
                        {selected.kind === 'model'
                            ? <SingleModelViewer key={selected.file} file={selected.file} basePath={basePath} size="100%" />
                            : <SingleTextureViewer key={selected.file} file={selected.file} basePath={basePath} size="100%" />}
                    </div>}
            </> : <p className="text-gray-400">Choose a texture, model or sound from the browser.</p>}
        </section>
    </main><SharedCanvas /></>;
}

// Selection changes only the large preview; folder navigation and thumbnails stay mounted.
const AssetBrowser = memo(function AssetBrowser({ textures, models, sounds, onSelect }: {
    textures: string[]; models: string[]; sounds: string[]; onSelect: (selection: Selection) => void;
}) {
    return (
        <aside aria-label="Asset browser" className="max-h-[45vh] shrink-0 overflow-y-auto border-b border-gray-700 p-4 sm:max-h-none sm:w-72 sm:border-r sm:border-b-0">
            <h1 className="mb-2 text-lg font-semibold text-white">Asset Viewer</h1>
            <p className="mb-5 text-xs text-gray-400">Select an asset to preview it.</p>
            <h2 className="mt-5 mb-2 font-semibold">Textures ({textures.length})</h2>
            <div><TextureListViewer files={textures} basePath={BASE_PATH} onSelect={file => onSelect({ kind: 'texture', file })} /></div>
            <h2 className="mt-5 mb-2 font-semibold">Models ({models.length})</h2>
            <div><ModelListViewer files={models} basePath={BASE_PATH} onSelect={file => onSelect({ kind: 'model', file })} /></div>
            <h2 className="mt-5 mb-2 font-semibold">Sounds ({sounds.length})</h2>
            <SoundListViewer files={sounds} onSelect={file => onSelect({ kind: 'sound', file })} />
        </aside>
    );
});
