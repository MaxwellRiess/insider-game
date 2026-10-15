import React, { useEffect, useRef } from 'react';

export default function PlayerLog({ log }) {
    const listRef = useRef(null);

    // Keep the newest answer in view by scrolling the list itself.
    // scrollIntoView would scroll the whole page down to the log.
    useEffect(() => {
        const list = listRef.current;
        if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    }, [log]);

    return (
        <div className="player-log">
            <h3>QUESTION LOG</h3>
            <div className="log-list" ref={listRef}>
                {log.length === 0 && <p className="empty-log">No questions asked yet.</p>}
                {log.map((entry) => (
                    <div key={entry.id} className={`log-entry ${entry.answer.toLowerCase()}`}>
                        <span className="log-id">#{entry.id}</span>
                        <span className="log-answer">{entry.answer}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
