import React, { useState } from 'react';
import { socket } from '../socket';
import { getPlayerName, getRole, getRoleLabel } from '../roomHelpers';

function voteLabel(count) {
    return `${count} ${count === 1 ? 'VOTE' : 'VOTES'}`;
}

export default function ResultsScreen({ room, myPlayerId }) {
    const [error, setError] = useState('');
    const isGameOver = room.state === 'GAME_OVER';
    const myRole = getRole(room, myPlayerId);
    const isHost = Boolean(room.players.find(p => p.id === myPlayerId)?.isHost);

    const isWinner = !isGameOver && (
        (room.winner === 'COMMONS' && myRole !== 'INSIDER') ||
        (room.winner === 'INSIDER' && myRole === 'INSIDER')
    );

    const handleBackToLobby = () => {
        socket.emit('resetGame', room.code, (response) => {
            setError(response?.error || '');
        });
    };

    let title;
    let titleClass;
    let reason;
    if (isGameOver) {
        title = "TIME'S UP";
        titleClass = 'timeout';
        reason = 'NOBODY FOUND THE WORD. EVERYONE LOSES.';
    } else if (room.winner === 'COMMONS') {
        title = 'COMMONS WIN!';
        titleClass = 'commons';
        reason = room.winReason;
    } else {
        title = 'INSIDER WINS!';
        titleClass = 'insider';
        reason = room.winReason;
    }

    const accusedName = getPlayerName(room, room.accusedId)
        || (room.winReason === 'VOTE TIED' ? 'NOBODY (TIE)' : 'NOBODY');

    return (
        <div className={`results-screen ${isWinner ? 'win' : 'lose'}`}>
            <h1 className={`result-title ${titleClass}`}>{title}</h1>
            {reason && <p className="result-reason">{reason}</p>}

            <div className="result-summary">
                {room.secretWord && (
                    <div className="result-summary-row">
                        <span className="result-summary-label">THE WORD WAS</span>
                        <span className="result-summary-word">{room.secretWord}</span>
                    </div>
                )}
                {!isGameOver && (
                    <div className="result-summary-row">
                        <span className="result-summary-label">ACCUSED</span>
                        <span className="result-summary-value">{accusedName}</span>
                    </div>
                )}
            </div>

            <div className="roles-reveal-list">
                {room.players.map(p => {
                    const role = getRole(room, p.id);
                    const roleClass = role ? role.toLowerCase() : 'unknown';
                    const votes = room.voteResults ? (room.voteResults[p.id] || 0) : 0;
                    const isAccused = !isGameOver && room.accusedId === p.id;

                    return (
                        <div key={p.id} className={`result-card ${roleClass} ${isAccused ? 'accused' : ''}`}>
                            <div className="player-info">
                                <span className="player-name">
                                    {p.name}{p.id === myPlayerId && ' (YOU)'}
                                </span>
                                <span className={`player-role ${roleClass}`}>{getRoleLabel(role)}</span>
                            </div>
                            {!isGameOver && role !== 'MASTER' && (
                                <div className="vote-count">
                                    {isAccused && <span className="accused-tag">ACCUSED</span>}
                                    {voteLabel(votes)}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="play-again-controls">
                {isHost ? (
                    <button type="button" className="btn primary" onClick={handleBackToLobby}>BACK TO LOBBY</button>
                ) : (
                    <p className="waiting-msg">WAITING FOR THE HOST TO START A NEW ROUND...</p>
                )}
            </div>
        </div>
    );
}
