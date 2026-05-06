import { useState, useEffect } from 'react';

function formatDuration(ms: number): string {
    if (ms <= 0) return '0s';
    const totalSeconds = Math.floor(ms / 1000);
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export function useCountdown(targetIso: string): string {
    const [display, setDisplay] = useState('');

    useEffect(() => {
        const update = () => {
            const diff = new Date(targetIso).getTime() - Date.now();
            setDisplay(formatDuration(Math.abs(diff)));
        };
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [targetIso]);

    return display;
}
