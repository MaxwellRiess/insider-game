import React from 'react';
import { socket } from '../socket';

export default function RoleReveal({ room }) {
    const myId = socket.id;
    const myRole = room.roles[myId];
    const secretWord = room.secretWord;

    let roleTitle = '';
    let subText = '';
    let instruction = '';
    let roleClass = '';

    switch (myRole) {
        case 'MASTER':
            roleTitle = 'YOU ARE THE MASTER';
            subText = `THE SECRET WORD IS: ${secretWord}`;
            instruction = 'WAIT FOR QUESTIONS';
            roleClass = 'role-master';
            break;
        case 'INSIDER':
            roleTitle = 'YOU ARE THE INSIDER';
            subText = `THE SECRET WORD IS: ${secretWord}`;
            instruction = 'GUIDE THE COMMONS TO THE ANSWER WITHOUT BEING CAUGHT';
            roleClass = 'role-insider';
            break;
        case 'COMMON':
            roleTitle = 'YOU ARE A COMMONER';
            subText = 'YOU DO NOT KNOW THE WORD';
            instruction = 'ASK YES/NO QUESTIONS TO FIND THE WORD';
            roleClass = 'role-common';
            break;
        default:
            roleTitle = 'SPECTATOR';
            break;
    }

    return (
        <div className={`role-reveal-container ${roleClass}`}>
            <h1 className="role-title">{roleTitle}</h1>
            <div className="role-card">
                <p className="sub-text">{subText}</p>
                <p className="instruction">{instruction}</p>
            </div>
            <p className="timer-hint">GAME STARTING IN 10 SECONDS...</p>
        </div>
    );
}
