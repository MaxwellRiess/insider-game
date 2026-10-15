import React, { useState } from 'react';
import { socket } from '../socket';
import { getRole } from '../roomHelpers';
import SecretReveal from './SecretReveal';

export default function RoleReveal({ room, myPlayerId }) {
    const myRole = getRole(room, myPlayerId);
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
            instruction = 'ANSWER QUESTIONS WITH YES, NO OR DON\'T KNOW';
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
            <SecretReveal
                className="role-reveal-cover"
                coverLabel="TAP TO SEE YOUR ROLE"
                coverHint="KEEP YOUR SCREEN HIDDEN FROM OTHERS"
            >
                <span className="role-title">
                    YOU ARE THE <span className={`role-name ${roleLabelClass}`}>{roleWord}</span>
                </span>
                <span className="role-card">
                    {showsSecretWord ? (
                        <span className="secret-word-block">
                            <span className="secret-word-label">SECRET WORD:</span>
                            <span className="secret-word-value">{secretWord}</span>
                        </span>
                    ) : (
                        <span className="sub-text">{subText}</span>
                    )}
                    <span className="instruction">{instruction}</span>
                </span>
            </SecretReveal>
            {myRole === 'MASTER' ? (
                <button type="button" className="btn primary" onClick={handleBeginRound} disabled={isSubmitting}>
                    BEGIN ROUND
                </button>
            ) : (
                <p className="timer-hint">{waitingText}</p>
            )}
            {error && <div className="error-banner">{error}</div>}
        </div>
    );
}
