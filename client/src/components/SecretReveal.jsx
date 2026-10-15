import React, { useEffect, useState } from 'react';

// Hides its children behind a cover until tapped, so players sitting
// side by side can't read each other's screens. Tap again to hide.
// The cover and content share one grid cell so they can dissolve into
// each other; the hidden layer is made invisible, not just transparent.
export default function SecretReveal({ coverLabel, coverHint, autoHideMs = 0, className = '', children }) {
    const [revealed, setRevealed] = useState(false);

    useEffect(() => {
        if (!revealed || !autoHideMs) return undefined;
        const timeout = setTimeout(() => setRevealed(false), autoHideMs);
        return () => clearTimeout(timeout);
    }, [revealed, autoHideMs]);

    return (
        <button
            type="button"
            className={`secret-reveal ${revealed ? 'revealed' : 'hidden'} ${className}`}
            onClick={() => setRevealed(value => !value)}
            aria-expanded={revealed}
        >
            <span className="secret-reveal-cover" aria-hidden={revealed}>
                <span className="secret-reveal-label">{coverLabel}</span>
                {coverHint && <span className="secret-reveal-hint">{coverHint}</span>}
            </span>
            <span className="secret-reveal-content" aria-hidden={!revealed}>
                {children}
                <span className="secret-reveal-hint">TAP TO HIDE</span>
            </span>
        </button>
    );
}
