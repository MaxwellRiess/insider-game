import React from 'react';
import InvitePanel from './InvitePanel';
import { MIN_PLAYERS } from '../roomHelpers';

export default function WaitingRoom({
    room,
    myPlayerId,
    isHost,
    selectedDifficulty,
    onDifficultyChange,
    onStartGame,
    onLeaveRoom
}) {
    const playerCount = room.players.length;
    const playersNeeded = Math.max(0, MIN_PLAYERS - playerCount);
    const canStart = playersNeeded === 0;

    const notice = typeof room.notice === 'string' ? room.notice.trim() : '';

    return (
        <div className="waiting-room">
            {notice && (
                <div className="notice-banner" role="status">
                    <span className="notice-banner-label">ROUND ENDED EARLY</span>
                    <span className="notice-banner-text">{notice}</span>
                </div>
            )}

            <InvitePanel roomCode={room.code} />

            <h2>WAITING FOR PLAYERS</h2>
            <p className="player-count-hint">
                {canStart
                    ? `${playerCount} PLAYERS READY`
                    : `${playerCount}/${MIN_PLAYERS} PLAYERS, NEED ${playersNeeded} MORE`}
            </p>

            <ul className="player-list">
                {room.players.map(p => (
                    <li key={p.id} className={`player-card ${p.isHost ? 'host' : ''} ${p.connected ? '' : 'offline'}`}>
                        <span className="player-card-name">{p.name}{p.id === myPlayerId && ' (YOU)'}</span>
                        <span className="player-card-tags">
                            {p.isHost && <span className="player-tag">HOST</span>}
                            {!p.connected && <span className="player-tag muted">OFFLINE</span>}
                        </span>
                    </li>
                ))}
            </ul>

            {isHost ? (
                <div className="start-controls">
                    <div className="setting-group">
                        <label htmlFor="round-difficulty">DIFFICULTY</label>
                        <select
                            id="round-difficulty"
                            value={selectedDifficulty}
                            onChange={(e) => onDifficultyChange(e.target.value)}
                            className="input-field"
                        >
                            <option value="Easy">EASY</option>
                            <option value="Medium">MEDIUM</option>
                            <option value="Hard">HARD</option>
                        </select>
                    </div>
                    <button
                        type="button"
                        className="btn primary start-btn"
                        onClick={onStartGame}
                        disabled={!canStart}
                    >
                        {canStart ? 'START GAME' : `NEED ${MIN_PLAYERS} PLAYERS TO START`}
                    </button>
                </div>
            ) : (
                <div className="start-controls">
                    <p className="waiting-msg">WAITING FOR THE HOST TO START...</p>
                    <button type="button" className="btn text" onClick={onLeaveRoom}>LEAVE ROOM</button>
                </div>
            )}
        </div>
    );
}
