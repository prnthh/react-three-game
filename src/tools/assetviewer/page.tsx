import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Stage, View, PerspectiveCamera } from "@react-three/drei";
import { Suspense, useEffect, useState, useRef } from "react";
import { TextureLoader } from "three";
import { loadModel } from "../dragdrop/modelLoader";

// view models and textures in manifest, onselect callback

const styles: Record<string, any> = {
    errorIcon: { color: '#fca5a5', fontSize: 12 }, // text-red-400 text-xs
    flexFillRelative: { flex: 1, position: 'relative' },
    bottomLabel: { backgroundColor: 'rgba(0,0,0,0.6)', fontSize: 10, padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' },
    iconLarge: { fontSize: 20 }
};

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
            style={{
                maxWidth: 60,
                aspectRatio: '1 / 1',
                backgroundColor: '#1f2937', /* gray-800 */
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            <div style={{ fontSize: 24 }}>📁</div>
            <div style={{ fontSize: 10, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', padding: '0 4px', marginTop: 4 }}>{name}</div>
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
    const { folders, filesInCurrentPath } = getItemsInPath(files, currentPath);

    return (
        <div>
            {currentPath && (
                <button
                    onClick={() => {
                        const pathParts = currentPath.split('/').filter(Boolean);
                        pathParts.pop();
                        setCurrentPath(pathParts.join('/'));
                    }}
                    style={{ marginBottom: 4, padding: '4px 8px', backgroundColor: '#1f2937', color: 'inherit', fontSize: 12, cursor: 'pointer', border: 'none' }}
                >
                    ← Back
                </button>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {folders.map((folder) => (
                    <FolderTile
                        key={folder}
                        name={folder}
                        onClick={() => setCurrentPath(currentPath ? `${currentPath}/${folder}` : folder)}
                    />
                ))}
                {filesInCurrentPath.map((file) => (
                    <div key={file}>
                        {renderCard(file, onSelect)}
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
                style={{ aspectRatio: '1 / 1', backgroundColor: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => onSelect(file)}
            >
                <div style={styles.errorIcon}>✗</div>
            </div>
        );
    }

    return (
        <div
            ref={ref}
            style={{ maxWidth: 60, aspectRatio: '1 / 1', backgroundColor: '#1f2937', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
            onClick={() => onSelect(file)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div style={{ flex: 1, position: 'relative' }}>
                {isInView ? (
                    <View style={{ width: '100%', height: '100%' }}>
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
            <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', fontSize: 10, padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
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
                style={{ aspectRatio: '1 / 1', backgroundColor: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => onSelect(file)}
            >
                <div style={styles.errorIcon}>✗</div>
            </div>
        );
    }

    return (
        <div
            ref={ref}
            style={{ maxWidth: 60, aspectRatio: '1 / 1', backgroundColor: '#111827', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
            onClick={() => onSelect(file)}
        >
            <div style={styles.flexFillRelative}>
                {isInView ? (
                    <View style={{ width: '100%', height: '100%' }}>
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
            <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', fontSize: 10, padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
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
            style={{ aspectRatio: '1 / 1', backgroundColor: '#374151', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
        >
            <div style={styles.iconLarge}>🔊</div>
            <div style={{ fontSize: 12, padding: '0 4px', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center', width: '100%' }}>{fileName}</div>
        </div>
    );
}

// Single Asset Viewer Components - display only one selected asset
export function SingleTextureViewer({ file, basePath = "" }: { file?: string; basePath?: string }) {
    if (!file) return null;
    return (
        <>
            <TextureCard file={file} basePath={basePath} onSelect={() => { }} />
            <SharedCanvas />
        </>
    );
}

export function SingleModelViewer({ file, basePath = "" }: { file?: string; basePath?: string }) {
    if (!file) return null;
    return (
        <>
            <ModelCard file={file} basePath={basePath} onSelect={() => { }} />
            <SharedCanvas />
        </>
    );
}

export function SingleSoundViewer({ file, basePath = "" }: { file?: string; basePath?: string }) {
    if (!file) return null;
    return <SoundCard file={file} basePath={basePath} onSelect={() => { }} />;
}

// Shared Canvas Component - can be used independently in any viewer
export function SharedCanvas() {
    return (
        <Canvas
            shadows
            dpr={[1, 1.5]}
            camera={{ position: [0, 0, 3], fov: 45, near: 0.1, far: 1000 }}
            style={{
                position: 'absolute',
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
