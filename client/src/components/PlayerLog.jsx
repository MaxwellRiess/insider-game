import React, { useEffect, useRef } from 'react';

export default function PlayerLog({ log }) {
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [log]);

    return (
        <div className="player-log">
            <h3>QUESTION LOG</h3>
            <div className="log-list">
                {log.length === 0 && <p className="empty-log">No questions asked yet.</p>}
                {log.map((entry) => (
                    <div key={entry.id} className={`log-entry ${entry.answer.toLowerCase()}`}>
                        <span className="log-id">#{entry.id}</span>
                        <span className="log-answer">{entry.answer}</span>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
