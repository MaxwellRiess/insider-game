import React from 'react';
import { socket } from '../socket';

export default function ResultsScreen({ room, myPlayerId }) {
    const myRole = myPlayerId ? room.roles[myPlayerId] : null;
    const isWinner = (room.winner === 'COMMONS' && myRole !== 'INSIDER') ||
        (room.winner === 'INSIDER' && myRole === 'INSIDER');

    const handlePlayAgain = () => {
        socket.emit('resetGame', room.code);
    };

    const winnerClass = room.winner === 'COMMONS' ? 'commons' : 'insider';

    return (
        <div className={`results-screen ${isWinner ? 'win' : 'lose'}`}>
            <h1 className={`result-title ${winnerClass}`}>{room.winner} WIN!</h1>
            <p className="result-reason">{room.winReason}</p>

            <div className="roles-reveal-list">
                {room.players.map(p => {
                    const role = room.roles[p.id] || 'COMMON';
                    const roleClass = role.toLowerCase();
                    const votes = room.voteResults ? (room.voteResults[p.id] || 0) : 0;
                    const isAccused = room.accusedId === p.id;

                    return (
                        <div key={p.id} className={`result-card ${roleClass} ${isAccused ? 'accused' : ''}`}>
                            <div className="player-info">
                                <span className="player-name">{p.name}</span>
                                <span className={`player-role ${roleClass}`}>{role}</span>
                            </div>
                            <div className="vote-count">
                                {votes} VOTES
                            </div>
                        </div>
                    );
                })}
            </div>

            {room.players.find(p => p.id === myPlayerId)?.isHost && (
                <div className="play-again-controls">
                    <button className="btn primary" onClick={handlePlayAgain}>BACK TO LOBBY</button>
                </div>
            )}
        </div>
    );
}
