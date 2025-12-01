import React, { useState, useEffect } from 'react';

export default function GameTimer({ startTime, duration }) {
    const [timeLeft, setTimeLeft] = useState(duration);

    useEffect(() => {
        const interval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const remaining = Math.max(0, duration - elapsed);
            setTimeLeft(remaining);
        }, 100);

        return () => clearInterval(interval);
    }, [startTime, duration]);

    const minutes = Math.floor(timeLeft / 60);
    const seconds = Math.floor(timeLeft % 60);
    const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    return (
        <div className="timer-container">
            <div className="timer-display">{formattedTime}</div>
        </div>
    );
}
