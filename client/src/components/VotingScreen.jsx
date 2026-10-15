import React, { useState } from 'react';
import { socket } from '../socket';
import { getMasterId, getVoterIds } from '../roomHelpers';
import useCountdown, { formatSeconds } from '../useCountdown';

export default function VotingScreen({ room, myPlayerId }) {
    const [selectedSuspect, setSelectedSuspect] = useState(null);
    const [error, setError] = useState('');
    const voterIds = getVoterIds(room);
    const committedVote = room.myVote;
    const hasVoted = Boolean(committedVote) || voterIds.includes(myPlayerId);
    const activeSelection = committedVote || selectedSuspect;

    const timeLeft = useCountdown(room.votingStartTime, (room.votingDuration || 0) / 1000);
    const isLow = timeLeft < 30;

    const handleVote = () => {
        if (selectedSuspect && !hasVoted) {
            socket.emit('submitVote', { roomCode: room.code, suspectId: selectedSuspect }, (response) => {
                setError(response?.error || '');
            });
        }
    };

    const masterId = getMasterId(room);
    const candidates = room.players.filter(p => p.id !== masterId && p.id !== myPlayerId);

    return (
        <div className="voting-screen">
            <h1>WHO IS THE INSIDER?</h1>
            <p className={`voting-countdown${isLow ? ' low' : ''}`} role="timer">
                {formatSeconds(timeLeft)} <span>LEFT TO VOTE</span>
            </p>
            <p className="timer-hint">THE WORD WAS FOUND. DISCUSS, THEN VOTE.</p>

            <div className="candidates-list" role="radiogroup" aria-label="Suspects">
                {candidates.map(p => {
                    const isSelected = activeSelection === p.id;
                    return (
                        <button
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            key={p.id}
                            className={`candidate-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelectedSuspect(p.id)}
                            disabled={hasVoted}
                        >
                            <span className="candidate-name">{p.name}</span>
                            {isSelected && <span className="voted-badge">{hasVoted ? 'YOUR VOTE' : 'SELECTED'}</span>}
                        </button>
                    );
                })}
            </div>

            {!hasVoted ? (
                <button
                    type="button"
                    className="btn primary vote-btn"
                    disabled={!selectedSuspect}
                    onClick={handleVote}
                >
                    SUBMIT VOTE
                </button>
            ) : (
                <p className="waiting-msg">WAITING FOR OTHERS TO VOTE...</p>
            )}

            {error && <div className="error-banner" role="alert">{error}</div>}

            <div className="vote-status">
                <p className="vote-status-heading">
                    VOTES IN: {voterIds.length}/{room.players.length}
                </p>
                <ul className="vote-status-list">
                    {room.players.map(p => {
                        const voted = voterIds.includes(p.id);
                        return (
                            <li key={p.id} className={`vote-status-item ${voted ? 'voted' : ''}`}>
                                <span aria-hidden="true">{voted ? '✓' : '…'}</span>
                                {p.name}{p.id === masterId && ' (MASTER)'}
                                <span className="visually-hidden">{voted ? ' has voted' : ' has not voted yet'}</span>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}
