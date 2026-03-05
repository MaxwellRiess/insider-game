import React, { useState } from 'react';
import { socket } from '../socket';

export default function Lobby({ onJoin, savedSession, resumeError, onClearSavedSession }) {
    const [name, setName] = useState(savedSession?.playerName || '');
    const [roomCode, setRoomCode] = useState(savedSession?.roomCode || '');
    const [error, setError] = useState('');
    const [mode, setMode] = useState('menu'); // menu, join

    const handleCreate = () => {
        if (!name) {
            setError('Please enter your name');
            return;
        }

        socket.emit('createRoom', { playerName: name }, (response) => {
            if (response.error) {
                setError(response.error);
            } else {
                onJoin(response);
            }
        });
    };

    const handleJoin = () => {
        if (!name || !roomCode) {
            setError('Please enter name and room code');
            return;
        }

        socket.emit('joinRoom', { roomCode, playerName: name }, (response) => {
            if (response.error) {
                setError(response.error);
            } else {
                onJoin(response);
            }
        });
    };

    const activeError = error || resumeError;

    return (
        <div className="lobby-container">
            <h1 className="title"><span className="title-label">Digital</span>Insider</h1>

            {activeError && <div className="error-banner">{activeError}</div>}

            {mode === 'menu' && (
                <div className="menu-buttons">
                    <input
                        type="text"
                        placeholder="ENTER YOUR NAME"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                    />
                    <button className="btn primary" onClick={handleCreate}>CREATE ROOM</button>
                    <button className="btn secondary" onClick={() => setMode('join')}>JOIN ROOM</button>
                    {savedSession && (
                        <button
                            className="btn text"
                            onClick={() => {
                                setRoomCode(savedSession.roomCode || '');
                                setMode('join');
                            }}
                        >
                            REJOIN LAST ROOM
                        </button>
                    )}
                    {savedSession && (
                        <button className="btn text" onClick={onClearSavedSession}>CLEAR SAVED SESSION</button>
                    )}
                </div>
            )}

            {mode === 'join' && (
                <div className="join-view">
                    <input
                        type="text"
                        placeholder="ROOM CODE (4 LETTERS)"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                        maxLength={4}
                        className="input-field"
                    />
                    <button className="btn primary" onClick={handleJoin}>ENTER ROOM</button>
                    <button className="btn text" onClick={() => setMode('menu')}>BACK</button>
                </div>
            )}
        </div>
    );
}
