import React, { useState } from 'react';
import { socket } from '../socket';

export default function Lobby({ onJoin }) {
    const [name, setName] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');
    const [mode, setMode] = useState('menu'); // menu, join, create

    const [difficulty, setDifficulty] = useState('Easy');

    const handleCreate = () => {
        if (!name) {
            setError('Please enter your name');
            return;
        }
        socket.emit('createRoom', { playerName: name, settings: { wordPack: difficulty } }, (response) => {
            if (response.error) {
                setError(response.error);
            } else {
                onJoin(response.room);
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
                onJoin(response.room);
            }
        });
    };

    return (
        <div className="lobby-container">
            <h1 className="title">DIGITAL INSIDER</h1>

            {error && <div className="error-banner">{error}</div>}

            {mode === 'menu' && (
                <div className="menu-buttons">
                    <input
                        type="text"
                        placeholder="ENTER YOUR NAME"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                    />
                    <button className="btn primary" onClick={() => setMode('create')}>CREATE ROOM</button>
                    <button className="btn secondary" onClick={() => setMode('join')}>JOIN ROOM</button>
                </div>
            )}

            {mode === 'create' && (
                <div className="create-view">
                    <p>Creating room as <strong>{name}</strong>...</p>

                    <div className="setting-group">
                        <label>DIFFICULTY:</label>
                        <select
                            value={difficulty}
                            onChange={(e) => setDifficulty(e.target.value)}
                            className="input-field"
                        >
                            <option value="Easy">EASY</option>
                            <option value="Medium">MEDIUM</option>
                            <option value="Hard">HARD</option>
                        </select>
                    </div>

                    <button className="btn primary" onClick={handleCreate}>CONFIRM CREATE</button>
                    <button className="btn text" onClick={() => setMode('menu')}>BACK</button>
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
