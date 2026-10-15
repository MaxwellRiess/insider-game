import React, { useEffect, useState } from 'react';

// Hides its children behind a cover until tapped, so players sitting
// side by side can't read each other's screens. Tap again to hide.
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
            {revealed ? (
                <>
                    {children}
                    <span className="secret-reveal-hint">TAP TO HIDE</span>
                </>
            ) : (
                <>
                    <span className="secret-reveal-label">{coverLabel}</span>
                    {coverHint && <span className="secret-reveal-hint">{coverHint}</span>}
                </>
            )}
        </button>
    );
}
