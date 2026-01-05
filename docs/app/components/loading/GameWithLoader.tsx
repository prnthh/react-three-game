"use client";

import { ReactElement, cloneElement, useState } from "react";
import LoadingSpinner from "./loading";

export default function GameWithLoader({ children }: { children: ReactElement<{ onCanvasReady?: () => void }> }) {
    const [isCanvasReady, setIsCanvasReady] = useState(false);

    return (
        <>
            {!isCanvasReady && <LoadingSpinner />}
            {cloneElement(children, { onCanvasReady: () => setIsCanvasReady(true) })}
        </>
    );
}
