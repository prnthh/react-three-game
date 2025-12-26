"use client";

import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Stage, View, PerspectiveCamera } from "@react-three/drei";
import { Suspense, useEffect, useState, useRef } from "react";
import { TextureLoader } from "three";
import { loadModel } from "../dragdrop/modelLoader";

// view models and textures in manifest, onselect callback

function getItemsInPath(files: string[], currentPath: string) {
    // Remove the leading category folder (e.g., /textures/, /models/, /sounds/)
    const filesWithoutCategory = files.map(file => {
        const parts = file.split('/').filter(Boolean);
        return parts.length > 1 ? '/' + parts.slice(1).join('/') : '';
    }).filter(Boolean);

    const prefix = currentPath ? `/${currentPath}/` : '/';
    const relevantFiles = filesWithoutCategory.filter(file => file.startsWith(prefix));

    const folders = new Set<string>();
    const filesInCurrentPath: string[] = [];

    relevantFiles.forEach((file, index) => {
        const relativePath = file.slice(prefix.length);
        const parts = relativePath.split('/').filter(Boolean);

        if (parts.length > 1) {
            folders.add(parts[0]);
        } else if (parts[0]) {
            // Return the original file path
            filesInCurrentPath.push(files[filesWithoutCategory.indexOf(file)]);
        }
    });

    return { folders: Array.from(folders), filesInCurrentPath };
}

function FolderTile({ name, onClick }: { name: string; onClick: () => void }) {
    return (
        <div
            onClick={onClick}
            className="aspect-square bg-gray-800 cursor-pointer hover:bg-gray-700 flex flex-col items-center justify-center"
        >
            <div className="text-3xl">📁</div>
            <div className="text-xs text-center truncate w-full px-1 mt-1">{name}</div>
        </div>
    );
}

function useInView() {
    const [isInView, setIsInView] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsInView(entry.isIntersecting);
            },
            { rootMargin: '100px' }
        );

        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => {
            if (ref.current) {
                observer.unobserve(ref.current);
            }
        };
    }, []);

    return { ref, isInView };
}

interface AssetListViewerProps {
    files: string[];
    selected?: string;
    onSelect: (file: string) => void;
    renderCard: (file: string, onSelect: (file: string) => void) => React.ReactNode;
}

function AssetListViewer({ files, selected, onSelect, renderCard }: AssetListViewerProps) {
    const [currentPath, setCurrentPath] = useState('');
    const [showPicker, setShowPicker] = useState(false);
    const { folders, filesInCurrentPath } = getItemsInPath(files, currentPath);

    const showCompactView = selected && !showPicker;

    if (showCompactView) {
        return (
            <div className="flex gap-1 items-center">
                {renderCard(selected, onSelect)}
                <button
                    onClick={() => setShowPicker(true)}
                    className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-xs"
                >
                    Change
                </button>
            </div>
        );
    }

    return (
        <div>
            {currentPath && (
                <button
                    onClick={() => {
                        const pathParts = currentPath.split('/').filter(Boolean);
                        pathParts.pop();
                        setCurrentPath(pathParts.join('/'));
                    }}
                    className="mb-1 px-2 py-1 bg-gray-800 hover:bg-gray-700 text-xs"
                >
                    ← Back
                </button>
            )}
            <div className="grid grid-cols-3 gap-1">
                {folders.map((folder) => (
                    <FolderTile
                        key={folder}
                        name={folder}
                        onClick={() => setCurrentPath(currentPath ? `${currentPath}/${folder}` : folder)}
                    />
                ))}
                {filesInCurrentPath.map((file) => (
                    <div key={file}>
                        {renderCard(file, (f) => {
                            onSelect(f);
                            if (selected) setShowPicker(false);
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

interface TextureListViewerProps {
    files: string[];
    selected?: string;
    onSelect: (file: string) => void;
    basePath?: string;
}

export function TextureListViewer({ files, selected, onSelect, basePath = "" }: TextureListViewerProps) {
    return (
        <>
            <AssetListViewer
                files={files}
                selected={selected}
                onSelect={onSelect}
                renderCard={(file, onSelectHandler) => (
                    <TextureCard file={file} basePath={basePath} onSelect={onSelectHandler} />
                )}
            />
            <SharedCanvas />
        </>
    );
}

function TextureCard({ file, onSelect, basePath = "" }: { file: string; onSelect: (file: string) => void; basePath?: string }) {
    const [error, setError] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const { ref, isInView } = useInView();
    const fullPath = basePath ? `/${basePath}${file}` : file;

    if (error) {
        return (
            <div
                ref={ref}
                className="aspect-square bg-gray-700 cursor-pointer hover:bg-gray-600 flex items-center justify-center"
                onClick={() => onSelect(file)}
            >
                <div className="text-red-400 text-xs">✗</div>
            </div>
        );
    }

    return (
        <div
            ref={ref}
            className="aspect-square bg-gray-800 cursor-pointer hover:bg-gray-700 flex flex-col"
            onClick={() => onSelect(file)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex-1 relative">
                {isInView ? (
                    <View className="w-full h-full">
                        <PerspectiveCamera makeDefault position={[0, 0, 2.5]} fov={50} />
                        <Suspense fallback={null}>
                            <ambientLight intensity={0.8} />
                            <pointLight position={[5, 5, 5]} intensity={0.5} />
                            <TextureSphere url={fullPath} onError={() => setError(true)} />
                            <OrbitControls
                                enableZoom={false}
                                enablePan={false}
                                autoRotate={isHovered}
                                autoRotateSpeed={2}
                            />
                        </Suspense>
                    </View>
                ) : null}
            </div>
            <div className="bg-black/60 text-[10px] px-1 truncate text-center">
                {file.split('/').pop()}
            </div>
        </div>
    );
}

function TextureSphere({ url, onError }: { url: string; onError?: () => void }) {
    const texture = useLoader(TextureLoader, url, undefined, (error) => {
        console.error('Failed to load texture:', url, error);
        onError?.();
    });
    return (
        <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[1, 32, 32]} />
            <meshStandardMaterial map={texture} />
        </mesh>
    );
}

interface ModelListViewerProps {
    files: string[];
    selected?: string;
    onSelect: (file: string) => void;
    basePath?: string;
}

export function ModelListViewer({ files, selected, onSelect, basePath = "" }: ModelListViewerProps) {
    return (
        <>
            <AssetListViewer
                files={files}
                selected={selected}
                onSelect={onSelect}
                renderCard={(file, onSelectHandler) => (
                    <ModelCard file={file} basePath={basePath} onSelect={onSelectHandler} />
                )}
            />
            <SharedCanvas />
        </>
    );
}

function ModelCard({ file, onSelect, basePath = "" }: { file: string; onSelect: (file: string) => void; basePath?: string }) {
    const [error, setError] = useState(false);
    const { ref, isInView } = useInView();
    const fullPath = basePath ? `/${basePath}${file}` : file;

    if (error) {
        return (
            <div
                ref={ref}
                className="aspect-square bg-gray-700 cursor-pointer hover:bg-gray-600 flex items-center justify-center"
                onClick={() => onSelect(file)}
            >
                <div className="text-red-400 text-xs">✗</div>
            </div>
        );
    }

    return (
        <div
            ref={ref}
            className="aspect-square bg-gray-900 cursor-pointer hover:bg-gray-800 flex flex-col"
            onClick={() => onSelect(file)}
        >
            <div className="flex-1 relative">
                {isInView ? (
                    <View className="w-full h-full">
                        <PerspectiveCamera makeDefault position={[0, 1, 3]} fov={50} />
                        <Suspense fallback={null}>
                            <Stage intensity={0.5} environment="city">
                                <ModelPreview url={fullPath} onError={() => setError(true)} />
                            </Stage>
                            <OrbitControls enableZoom={false} />
                        </Suspense>
                    </View>
                ) : null}
            </div>
            <div className="bg-black/60 text-[10px] px-1 truncate text-center">
                {file.split('/').pop()}
            </div>
        </div>
    );
}

function ModelPreview({ url, onError }: { url: string; onError?: () => void }) {
    const [model, setModel] = useState<any>(null);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    useEffect(() => {
        let cancelled = false;
        setModel(null);

        loadModel(url).then((result) => {
            if (cancelled) return;
            if (result.success && result.model) {
                setModel(result.model);
            } else {
                onErrorRef.current?.();
            }
        });

        return () => { cancelled = true; };
    }, [url]);

    if (!model) return null;
    return <primitive object={model} />;
}

interface SoundListViewerProps {
    files: string[];
    selected?: string;
    onSelect: (file: string) => void;
    basePath?: string;
}

export function SoundListViewer({ files, selected, onSelect, basePath = "" }: SoundListViewerProps) {
    return (
        <AssetListViewer
            files={files}
            selected={selected}
            onSelect={onSelect}
            renderCard={(file, onSelectHandler) => (
                <SoundCard file={file} basePath={basePath} onSelect={onSelectHandler} />
            )}
        />
    );
}

function SoundCard({ file, onSelect, basePath = "" }: { file: string; onSelect: (file: string) => void; basePath?: string }) {
    const fileName = file.split('/').pop() || '';
    const fullPath = basePath ? `/${basePath}${file}` : file;
    return (
        <div
            onClick={() => onSelect(file)}
            className="aspect-square bg-gray-700 cursor-pointer hover:bg-gray-600 flex flex-col items-center justify-center"
        >
            <div className="text-2xl">🔊</div>
            <div className="text-[10px] px-1 mt-1 truncate text-center w-full">{fileName}</div>
        </div>
    );
}

// Shared Canvas Component - can be used independently in any viewer
export function SharedCanvas() {
    return (
        <Canvas
            shadows
            dpr={[1, 1.5]}
            camera={{ position: [0, 0, 3], fov: 45, near: 0.1, far: 1000 }}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                pointerEvents: 'none',
            }}
            eventSource={typeof document !== 'undefined' ? document.getElementById('root') || undefined : undefined}
            eventPrefix="client"
        >
            <View.Port />
        </Canvas>
    );
}
