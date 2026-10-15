import React, { useEffect } from 'react';

// Matches the animation length of .phase-curtain in index.css.
const CURTAIN_MS = 1800;

export default function PhaseCurtain({ title, subtitle, onDone }) {
    useEffect(() => {
        const timeout = setTimeout(onDone, CURTAIN_MS);
        return () => clearTimeout(timeout);
    }, [onDone]);

    return (
        <div className="phase-curtain" role="status" aria-live="assertive">
            <p className="phase-curtain-title">{title}</p>
            <span className="phase-curtain-rule" aria-hidden="true" />
            {subtitle && <p className="phase-curtain-subtitle">{subtitle}</p>}
        </div>
    );
}
