import React, { useState } from 'react';
import { socket } from '../socket';

export default function MasterControls({ roomCode }) {
    const [error, setError] = useState('');

    const handleAck = (response) => {
        setError(response?.error || '');
    };

    const sendAnswer = (answer) => {
        socket.emit('submitAnswer', { roomCode, answer }, handleAck);
    };

    const triggerCorrect = () => {
        if (confirm('Are you sure they found the correct word?')) {
            socket.emit('triggerCorrect', roomCode, handleAck);
        }
    };

    return (
        <div className="master-controls">
            <div className="answer-buttons">
                <button type="button" className="btn answer-btn yes" onClick={() => sendAnswer('YES')}>YES</button>
                <button type="button" className="btn answer-btn no" onClick={() => sendAnswer('NO')}>NO</button>
                <button type="button" className="btn answer-btn idk" onClick={() => sendAnswer('IDK')}>DON'T KNOW</button>
            </div>
            <button type="button" className="btn primary correct-btn" onClick={triggerCorrect}>CORRECT ANSWER FOUND</button>
            {error && <div className="error-banner" role="alert">{error}</div>}
        </div>
    );
}
