import React from 'react';
import { socket } from '../socket';

export default function ResultsScreen({ room }) {
    const isWinner = (room.winner === 'COMMONS' && room.roles[socket.id] !== 'INSIDER') ||
        (room.winner === 'INSIDER' && room.roles[socket.id] === 'INSIDER');

    const [difficulty, setDifficulty] = React.useState(room.settings.wordPack || 'Easy');

    const handlePlayAgain = () => {
        socket.emit('resetGame', { roomCode: room.code, settings: { wordPack: difficulty } });
    };

    return (
        <div className={`results-screen ${isWinner ? 'win' : 'lose'}`}>
            <h1 className="result-title">{room.winner} WIN!</h1>
            <p className="result-reason">{room.winReason}</p>

            <div className="roles-reveal-list">
                {room.players.map(p => {
                    const role = room.roles[p.id];
                    const votes = room.voteResults ? (room.voteResults[p.id] || 0) : 0;
                    const isAccused = room.accusedId === p.id;

                    return (
                        <div key={p.id} className={`result-card ${role.toLowerCase()} ${isAccused ? 'accused' : ''}`}>
                            <div className="player-info">
                                <span className="player-name">{p.name}</span>
                                <span className="player-role">{role}</span>
                            </div>
                            <div className="vote-count">
                                {votes} VOTES
                            </div>
                        </div>
                    );
                })}
            </div>

            {room.players.find(p => p.id === socket.id)?.isHost && (
                <div className="play-again-controls">
                    <div className="setting-group">
                        <label>NEXT ROUND DIFFICULTY:</label>
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
                    <button className="btn primary" onClick={handlePlayAgain}>PLAY AGAIN</button>
                </div>
            )}
        </div>
    );
}
