import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Placement = 'bottom-start' | 'bottom-end' | 'left-start' | 'right-start';

export function Dropdown({
    trigger,
    children,
    placement = 'bottom-end',
    offset = 6,
    zIndex = 1000,
}: {
    trigger: (props: { ref: React.RefObject<HTMLButtonElement | null>; isOpen: boolean; toggle: () => void; close: () => void; }) => ReactNode;
    children: ReactNode | ((close: () => void) => ReactNode);
    placement?: Placement;
    offset?: number;
    zIndex?: number;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const close = () => setIsOpen(false);
    const toggle = () => setIsOpen(prev => !prev);

    useLayoutEffect(() => {
        if (!isOpen || !triggerRef.current || !panelRef.current || typeof window === 'undefined') return;

        const updatePosition = () => {
            const triggerRect = triggerRef.current?.getBoundingClientRect();
            const panelRect = panelRef.current?.getBoundingClientRect();
            if (!triggerRect || !panelRect) return;

            let left = triggerRect.left;
            let top = triggerRect.bottom + offset;

            if (placement === 'bottom-end') {
                left = triggerRect.right - panelRect.width;
                top = triggerRect.bottom + offset;
            } else if (placement === 'bottom-start') {
                left = triggerRect.left;
                top = triggerRect.bottom + offset;
            } else if (placement === 'left-start') {
                left = triggerRect.left - panelRect.width - offset;
                top = triggerRect.top;
            } else if (placement === 'right-start') {
                left = triggerRect.right + offset;
                top = triggerRect.top;
            }

            left = Math.max(8, Math.min(left, window.innerWidth - panelRect.width - 8));
            top = Math.max(8, Math.min(top, window.innerHeight - panelRect.height - 8));

            setPosition({ left, top });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [isOpen, placement, offset]);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (triggerRef.current?.contains(target)) return;
            if (panelRef.current?.contains(target)) return;
            close();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    return (
        <>
            {trigger({ ref: triggerRef, isOpen, toggle, close })}
            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={panelRef}
                    onMouseLeave={close}
                    style={{
                        position: 'fixed',
                        left: position?.left ?? -9999,
                        top: position?.top ?? -9999,
                        zIndex,
                    }}
                >
                    {typeof children === 'function' ? children(close) : children}
                </div>,
                document.body
            )}
        </>
    );
}