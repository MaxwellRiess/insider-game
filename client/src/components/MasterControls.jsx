import React from 'react';
import { socket } from '../socket';

export default function MasterControls({ roomCode }) {
    const sendAnswer = (answer) => {
        socket.emit('submitAnswer', { roomCode, answer });
    };

    const triggerCorrect = () => {
        if (confirm('Are you sure they found the correct word?')) {
            socket.emit('triggerCorrect', roomCode);
        }
    };

    return (
        <div className="master-controls">
            <div className="answer-buttons">
                <button className="btn answer-btn yes" onClick={() => sendAnswer('YES')}>YES</button>
                <button className="btn answer-btn no" onClick={() => sendAnswer('NO')}>NO</button>
                <button className="btn answer-btn idk" onClick={() => sendAnswer('IDK')}>DON'T KNOW</button>
            </div>
            <button className="btn primary correct-btn" onClick={triggerCorrect}>CORRECT ANSWER FOUND</button>
        </div>
    );
}
