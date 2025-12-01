import React, { useState } from 'react';
import { socket } from '../socket';

export default function VotingScreen({ room }) {
    const [selectedSuspect, setSelectedSuspect] = useState(null);
    const [hasVoted, setHasVoted] = useState(false);
    const myId = socket.id;

    const handleVote = () => {
        if (selectedSuspect) {
            socket.emit('submitVote', { roomCode: room.code, suspectId: selectedSuspect });
            setHasVoted(true);
        }
    };

    // Filter out Master from voting list? Spec says "A list of all players (except the Master) appears".
    // So we filter out the Master.
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
                        className={`candidate-card ${selectedSuspect === p.id ? 'selected' : ''}`}
                        onClick={() => !hasVoted && setSelectedSuspect(p.id)}
                    >
                        <span className="candidate-name">{p.name}</span>
                        {/* Show if this player has voted (optional, based on room.votes keys) */}
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
