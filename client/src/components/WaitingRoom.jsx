import React, { useEffect, useState } from 'react';
import { getJoinLink, MIN_PLAYERS } from '../roomHelpers';

export default function WaitingRoom({
    room,
    myPlayerId,
    isHost,
    selectedDifficulty,
    onDifficultyChange,
    onStartGame,
    onLeaveRoom
}) {
    const [shareStatus, setShareStatus] = useState('');
    const playerCount = room.players.length;
    const playersNeeded = Math.max(0, MIN_PLAYERS - playerCount);
    const canStart = playersNeeded === 0;

    useEffect(() => {
        if (!shareStatus) return undefined;
        const timeout = setTimeout(() => setShareStatus(''), 2500);
        return () => clearTimeout(timeout);
    }, [shareStatus]);

    const handleShare = async () => {
        const link = getJoinLink(room.code);

        if (navigator.share) {
            try {
                await navigator.share({ title: 'Join my Insider game', text: `Room code ${room.code}`, url: link });
                return;
            } catch (error) {
                if (error?.name === 'AbortError') return;
            }
        }

        try {
            await navigator.clipboard.writeText(link);
            setShareStatus('LINK COPIED');
        } catch {
            setShareStatus('COPY FAILED, SHARE THE CODE INSTEAD');
        }
    };

    return (
        <div className="waiting-room">
            <div className="room-code-panel">
                <span className="room-code-label">ROOM CODE</span>
                <span className="room-code-value" aria-label={`Room code ${room.code.split('').join(' ')}`}>{room.code}</span>
                <button type="button" className="btn secondary share-btn" onClick={handleShare}>
                    SHARE INVITE LINK
                </button>
                <span className="share-status" role="status">{shareStatus}</span>
            </div>

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
                        <label htmlFor="round-difficulty">ROUND DIFFICULTY:</label>
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
