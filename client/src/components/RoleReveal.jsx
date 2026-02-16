import React, { useState } from 'react';
import { socket } from '../socket';

export default function RoleReveal({ room, myPlayerId }) {
    const myRole = myPlayerId ? room.roles[myPlayerId] : null;
    const secretWord = room.secretWord;
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    let roleWord = '';
    let roleLabelClass = '';
    let subText = '';
    let instruction = '';
    let waitingText = 'WAITING FOR MASTER TO BEGIN ROUND...';
    let roleClass = '';
    let showsSecretWord = false;

    switch (myRole) {
        case 'MASTER':
            roleWord = 'MASTER';
            roleLabelClass = 'master';
            showsSecretWord = true;
            instruction = 'WAIT FOR QUESTIONS';
            waitingText = 'PRESS BEGIN ROUND WHEN EVERYONE IS READY';
            roleClass = 'role-master';
            break;
        case 'INSIDER':
            roleWord = 'INSIDER';
            roleLabelClass = 'insider';
            showsSecretWord = true;
            instruction = 'GUIDE THE COMMONS TO THE ANSWER WITHOUT BEING CAUGHT';
            roleClass = 'role-insider';
            break;
        case 'COMMON':
            roleWord = 'COMMONER';
            roleLabelClass = 'common';
            subText = 'YOU DO NOT KNOW THE WORD';
            instruction = 'ASK YES/NO QUESTIONS TO FIND THE WORD';
            roleClass = 'role-common';
            break;
        default:
            roleWord = 'SPECTATOR';
            roleLabelClass = 'spectator';
            break;
    }

    const handleBeginRound = () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        socket.emit('beginRound', room.code, (response) => {
            setIsSubmitting(false);
            if (response?.error) {
                setError(response.error);
            } else {
                setError('');
            }
        });
    };

    return (
        <div className={`role-reveal-container ${roleClass}`}>
            <h1 className="role-title">
                YOU ARE THE <span className={`role-name ${roleLabelClass}`}>{roleWord}</span>
            </h1>
            <div className="role-card">
                {showsSecretWord ? (
                    <div className="secret-word-block">
                        <p className="secret-word-label">SECRET WORD:</p>
                        <p className="secret-word-value">{secretWord}</p>
                    </div>
                ) : (
                    <p className="sub-text">{subText}</p>
                )}
                <p className="instruction">{instruction}</p>
            </div>
            {myRole === 'MASTER' ? (
                <button className="btn primary" onClick={handleBeginRound} disabled={isSubmitting}>
                    BEGIN ROUND
                </button>
            ) : (
                <p className="timer-hint">{waitingText}</p>
            )}
            {error && <div className="error-banner">{error}</div>}
        </div>
    );
}
