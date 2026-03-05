import React, { useState, useEffect } from 'react';

const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

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

    const progress = timeLeft / duration;
    const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
    const isLow = timeLeft < 60;

    return (
        <div className="timer-container">
            <svg className="timer-ring" viewBox="0 0 200 200" aria-hidden="true">
                <circle
                    className="timer-ring-bg"
                    cx="100"
                    cy="100"
                    r={RADIUS}
                />
                <circle
                    className={`timer-ring-progress${isLow ? ' low' : ''}`}
                    cx="100"
                    cy="100"
                    r={RADIUS}
                    style={{
                        strokeDasharray: CIRCUMFERENCE,
                        strokeDashoffset,
                    }}
                />
            </svg>
            <div className={`timer-display${isLow ? ' low' : ''}`}>{formattedTime}</div>
        </div>
    );
}
