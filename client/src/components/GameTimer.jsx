import React from 'react';
import useCountdown, { formatSeconds } from '../useCountdown';

const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function GameTimer({ startTime, duration }) {
    const timeLeft = useCountdown(startTime, duration);

    const progress = duration ? timeLeft / duration : 0;
    const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
    const isLow = timeLeft < 60;

    return (
        <div className="timer-container" role="timer" aria-label={`${formatSeconds(timeLeft)} remaining`}>
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
            <div className={`timer-display${isLow ? ' low' : ''}`} aria-hidden="true">{formatSeconds(timeLeft)}</div>
        </div>
    );
}
