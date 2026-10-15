import { useEffect, useState } from 'react';

// Seconds remaining from startTime (ms epoch) over durationSeconds.
export default function useCountdown(startTime, durationSeconds) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 200);
        return () => clearInterval(interval);
    }, []);

    if (!startTime || !durationSeconds) return 0;
    const elapsed = (now - startTime) / 1000;
    return Math.max(0, durationSeconds - elapsed);
}

export function formatSeconds(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
