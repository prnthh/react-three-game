import { Component, createContext, Suspense, useContext, useEffect, type ReactNode } from 'react';
import { ResourceLoadError } from './assetCache.js';

const AtomicAssets = createContext(false);

interface AssetBoundaryProps {
    children: ReactNode;
    atomic?: boolean;
    subscribeToRetry?: (retry: () => void) => () => void;
    onError?: (error: ResourceLoadError) => void;
}

function FailedAssets({ subscribeToRetry, retry }: Pick<AssetBoundaryProps, 'subscribeToRetry'> & { retry: () => void }) {
    useEffect(() => subscribeToRetry?.(retry), [subscribeToRetry, retry]);
    return null;
}

class AssetErrorBoundary extends Component<AssetBoundaryProps, { error: ResourceLoadError | null }> {
    state: { error: ResourceLoadError | null } = { error: null };
    static getDerivedStateFromError(error: unknown) {
        if (!(error instanceof ResourceLoadError)) throw error;
        return { error };
    }
    componentDidCatch(error: ResourceLoadError) {
        if (this.props.onError) this.props.onError(error);
        else console.warn('[Assets]', error);
    }
    retry = () => {
        this.state.error?.retry();
        this.setState({ error: null });
    };
    render() {
        return this.state.error
            ? <FailedAssets subscribeToRetry={this.props.subscribeToRetry} retry={this.retry} />
            : this.props.children;
    }
}

/** Capture surfaces need a complete subtree; ordinary nodes may resolve independently. */
export function AssetBoundary({ children, atomic = false, ...failureProps }: AssetBoundaryProps) {
    const inherited = useContext(AtomicAssets);
    if (inherited) return children;
    return <AssetErrorBoundary {...failureProps}><Suspense fallback={null}>
        {atomic ? <AtomicAssets.Provider value>{children}</AtomicAssets.Provider> : children}
    </Suspense></AssetErrorBoundary>;
}
