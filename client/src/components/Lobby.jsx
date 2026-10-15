import React, { useState } from 'react';
import { socket } from '../socket';

function getRoomCodeFromUrl() {
    try {
        const code = new URLSearchParams(window.location.search).get('room');
        if (!code) return '';
        const cleaned = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
        return cleaned.length === 4 ? cleaned : '';
    } catch {
        return '';
    }
}

function clearRoomCodeFromUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('room')) return;
    url.searchParams.delete('room');
    window.history.replaceState(null, '', url.toString());
}

export default function Lobby({ onJoin, savedSession, resumeError, onClearSavedSession }) {
    const [linkedRoomCode] = useState(getRoomCodeFromUrl);
    const [name, setName] = useState(savedSession?.playerName || '');
    const [roomCode, setRoomCode] = useState(linkedRoomCode || savedSession?.roomCode || '');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mode, setMode] = useState(linkedRoomCode ? 'join' : 'menu'); // menu, join

    const trimmedName = name.trim();

    const handleResponse = (response) => {
        setIsSubmitting(false);
        if (response?.error) {
            setError(response.error);
        } else {
            clearRoomCodeFromUrl();
            onJoin(response);
        }
    };

    const handleCreate = (event) => {
        event.preventDefault();
        if (isSubmitting) return;
        if (!trimmedName) {
            setError('Please enter your name');
            return;
        }

        setIsSubmitting(true);
        socket.emit('createRoom', { playerName: trimmedName }, handleResponse);
    };

    const handleJoin = (event) => {
        event.preventDefault();
        if (isSubmitting) return;
        if (!trimmedName || roomCode.length !== 4) {
            setError('Please enter your name and the 4-letter room code');
            return;
        }

        setIsSubmitting(true);
        socket.emit('joinRoom', { roomCode, playerName: trimmedName }, handleResponse);
    };

    const switchMode = (nextMode) => {
        setError('');
        setMode(nextMode);
    };

    const activeError = error || resumeError;

    const nameField = (
        <>
            <label htmlFor="player-name" className="visually-hidden">Your name</label>
            <input
                id="player-name"
                type="text"
                placeholder="ENTER YOUR NAME"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                autoComplete="nickname"
                autoCapitalize="words"
                className="input-field"
            />
        </>
    );

    return (
        <div className="lobby-container">
            <h1 className="title"><span className="title-label">Digital</span>Insider</h1>

            {activeError && <div className="error-banner" role="alert">{activeError}</div>}

            {mode === 'menu' && (
                <form className="menu-buttons" onSubmit={handleCreate}>
                    {nameField}
                    <button type="submit" className="btn primary" disabled={isSubmitting}>CREATE ROOM</button>
                    <button type="button" className="btn secondary" onClick={() => switchMode('join')}>JOIN ROOM</button>
                    {savedSession && (
                        <button
                            type="button"
                            className="btn text"
                            onClick={() => {
                                setRoomCode(savedSession.roomCode || '');
                                switchMode('join');
                            }}
                        >
                            REJOIN LAST ROOM
                        </button>
                    )}
                    {savedSession && (
                        <button type="button" className="btn text" onClick={onClearSavedSession}>CLEAR SAVED SESSION</button>
                    )}
                </form>
            )}

            {mode === 'join' && (
                <form className="join-view" onSubmit={handleJoin}>
                    {linkedRoomCode && roomCode === linkedRoomCode && (
                        <p className="join-invite">YOU'VE BEEN INVITED TO ROOM <strong>{linkedRoomCode}</strong></p>
                    )}
                    {nameField}
                    <label htmlFor="room-code" className="visually-hidden">Room code</label>
                    <input
                        id="room-code"
                        type="text"
                        placeholder="ROOM CODE (4 LETTERS)"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                        maxLength={4}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        className="input-field room-code-input"
                    />
                    <button type="submit" className="btn primary" disabled={isSubmitting}>ENTER ROOM</button>
                    <button type="button" className="btn text" onClick={() => switchMode('menu')}>BACK</button>
                </form>
            )}
        </div>
    );
}
