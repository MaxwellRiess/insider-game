import React, { useState } from 'react';
import { socket } from '../socket';

export default function VotingScreen({ room, myPlayerId }) {
    const [selectedSuspect, setSelectedSuspect] = useState(null);
    const committedVote = myPlayerId ? room.votes?.[myPlayerId] : null;
    const hasVoted = Boolean(committedVote);
    const activeSelection = hasVoted ? committedVote : selectedSuspect;

    const handleVote = () => {
        if (selectedSuspect && !hasVoted) {
            socket.emit('submitVote', { roomCode: room.code, suspectId: selectedSuspect });
        }
    };

    const masterId = Object.keys(room.roles).find(id => room.roles[id] === 'MASTER');
    const candidates = room.players.filter(p => p.id !== masterId);

    return (
        <div className="voting-screen">
            <h1>WHO IS THE INSIDER?</h1>
            <p className="timer-hint">DISCUSS AND VOTE</p>

            <div className="candidates-list">
                {candidates.map(p => (
                    <div
                        key={p.id}
                        className={`candidate-card ${activeSelection === p.id ? 'selected' : ''}`}
                        onClick={() => !hasVoted && setSelectedSuspect(p.id)}
                    >
                        <span className="candidate-name">{p.name}</span>
                        {room.votes && room.votes[p.id] && <span className="voted-badge">VOTED</span>}
                    </div>
                ))}
            </div>

            {!hasVoted ? (
                <button
                    className="btn primary vote-btn"
                    disabled={!selectedSuspect}
                    onClick={handleVote}
                >
                    SUBMIT VOTE
                </button>
            ) : (
                <p className="waiting-msg">WAITING FOR OTHERS TO VOTE...</p>
            )}
        </div>
    );
}
