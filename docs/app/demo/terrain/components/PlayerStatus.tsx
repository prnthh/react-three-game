import { createContext } from 'react';

export const PlayerStatusContext = createContext<(message: string | null) => void>(() => {});

export function PlayerStatus({ message }: { message: string | null }) {
    return message ? <div role="status" aria-label="Character controls" style={{ position: 'absolute', left: 12, bottom: 12,
        maxWidth: 180, padding: 8, background: '#111c', color: 'white', fontSize: 12, pointerEvents: 'none', borderRadius: 6 }}>
        {message}
    </div> : null;
}
