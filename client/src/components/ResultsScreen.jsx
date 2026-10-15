import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import { getPlayerName, getRole, getRoleLabel } from '../roomHelpers';

// The reveal runs in stages so everyone sees the outcome together and has
// time to take it in before the vote breakdown appears:
//   countdown (3, 2, 1) -> beat -> hero (who won) -> details (who voted for whom)
// A time-out has no vote to count down to, so it starts at the hero.
const COUNT_STEP_MS = 1000;
const BEAT_MS = 700;
const HERO_HOLD_MS = 5000;
const TIMEOUT_HERO_HOLD_MS = 4000;
const PUSH_UP_MS = 900;

function buildSchedule(startStage) {
    if (startStage === 'details') return [];
    if (startStage === 'hero') return [[TIMEOUT_HERO_HOLD_MS, 'details']];

    const heroAt = COUNT_STEP_MS * 3 + BEAT_MS;
    return [
        [COUNT_STEP_MS, 'count-2'],
        [COUNT_STEP_MS * 2, 'count-1'],
        [COUNT_STEP_MS * 3, 'beat'],
        [heroAt, 'hero'],
        [heroAt + HERO_HOLD_MS, 'details']
    ];
}

// Remembers which rounds this tab has already watched, so a refresh during
// the results goes straight to the breakdown instead of replaying it.
function readSeen(key) {
    try {
        return sessionStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}

function markSeen(key) {
    try {
        sessionStorage.setItem(key, '1');
    } catch {
        // Storage can be unavailable in private browsing; replaying is harmless.
    }
}

function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function voteLabel(count) {
    return `${count} ${count === 1 ? 'VOTE' : 'VOTES'}`;
}

// Splits the headline into letters for a staggered entrance, keeping each
// word together so it only wraps between words.
function AnimatedTitle({ text, className }) {
    let letterIndex = 0;
    return (
        <h1 className={className} aria-label={text}>
            {text.split(' ').map((word, wordIndex) => (
                <React.Fragment key={wordIndex}>
                    {wordIndex > 0 && ' '}
                    <span className="result-title-word" aria-hidden="true">
                        {word.split('').map((letter) => (
                            <span key={letterIndex} className="result-title-letter" style={{ '--i': letterIndex++ }}>
                                {letter}
                            </span>
                        ))}
                    </span>
                </React.Fragment>
            ))}
        </h1>
    );
}

function Countdown({ stage }) {
    const count = stage.startsWith('count-') ? stage.slice(-1) : null;
    return (
        <div className={`reveal-countdown ${stage === 'beat' ? 'leaving' : ''}`} aria-live="assertive">
            <p className="reveal-countdown-label">THE VOTES ARE IN</p>
            <div className="reveal-countdown-dial">
                <svg className="reveal-countdown-ring" viewBox="0 0 120 120" aria-hidden="true">
                    <circle className="reveal-countdown-track" cx="60" cy="60" r="54" />
                    {count && <circle key={count} className="reveal-countdown-sweep" cx="60" cy="60" r="54" />}
                </svg>
                {count && <span key={count} className="reveal-countdown-number">{count}</span>}
            </div>
        </div>
    );
}

export default function ResultsScreen({ room, myPlayerId }) {
    const [error, setError] = useState('');
    const isGameOver = room.state === 'GAME_OVER';
    const revealKey = `insider-reveal:${room.code}:${room.quizStartTime}`;
    const [startStage] = useState(() => {
        if (readSeen(revealKey)) return 'details';
        return isGameOver ? 'hero' : 'count-3';
    });
    const [stage, setStage] = useState(startStage);
    const heroRef = useRef(null);
    const heroRectBefore = useRef(null);

    useEffect(() => {
        const timeouts = buildSchedule(startStage).map(([delay, nextStage]) => setTimeout(() => {
            if (nextStage === 'hero') {
                try {
                    navigator.vibrate?.([40, 60, 120]);
                } catch {
                    // Vibration is a nice-to-have.
                }
            }
            if (nextStage === 'details') {
                heroRectBefore.current = heroRef.current?.getBoundingClientRect() || null;
                markSeen(revealKey);
            }
            setStage(nextStage);
        }, delay));
        return () => timeouts.forEach(clearTimeout);
    }, [startStage, revealKey]);

    // Slide the headline from the centre of the screen up to its place
    // above the breakdown (measure where it was, then animate from there).
    useLayoutEffect(() => {
        const before = heroRectBefore.current;
        const hero = heroRef.current;
        if (stage !== 'details' || !before || !hero || prefersReducedMotion()) return;
        heroRectBefore.current = null;
        const after = hero.getBoundingClientRect();
        const deltaY = before.top - after.top;
        if (Math.abs(deltaY) < 1) return;
        hero.animate(
            [{ transform: `translateY(${deltaY}px)` }, { transform: 'translateY(0)' }],
            { duration: PUSH_UP_MS, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' }
        );
    }, [stage]);

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

    const insiderId = Object.keys(room.roles || {}).find(id => room.roles[id] === 'INSIDER');
    const insiderName = getPlayerName(room, insiderId);

    if (stage.startsWith('count-') || stage === 'beat') {
        return (
            <div className="results-screen stage-countdown">
                <Countdown stage={stage} />
            </div>
        );
    }

    const showDetails = stage === 'details';
    const animateDetails = startStage !== 'details';
    let detailIndex = 0;
    const nextDetail = () => ({ '--i': detailIndex++ });

    return (
        <div className={`results-screen stage-${stage} ${isWinner ? 'win' : 'lose'} ${animateDetails ? 'animated' : ''}`}>
            <header className={`result-hero ${titleClass}`} ref={heroRef}>
                <span className="result-hero-bloom" aria-hidden="true" />
                <AnimatedTitle text={title} className={`result-title ${titleClass}`} />
                {reason && <p className="result-reason">{reason}</p>}
                {insiderName && (
                    <p className="result-insider">
                        <span className="result-insider-label">THE INSIDER WAS</span>
                        <span className="result-insider-name">{insiderName}</span>
                    </p>
                )}
            </header>

            {showDetails && (
                <section className="result-details" aria-label="Round breakdown">
                    {room.secretWord && (
                        <div className="result-summary result-detail" style={nextDetail()}>
                            <div className="result-summary-row">
                                <span className="result-summary-label">THE WORD WAS</span>
                                <span className="result-summary-word">{room.secretWord}</span>
                            </div>
                        </div>
                    )}

                    <div className="roles-reveal-list">
                        {room.players.map(p => {
                            const role = getRole(room, p.id);
                            const roleClass = role ? role.toLowerCase() : 'unknown';
                            const votes = room.voteResults ? (room.voteResults[p.id] || 0) : 0;
                            const isAccused = !isGameOver && room.accusedId === p.id;
                            const votedForId = room.votes?.[p.id];
                            const votedFor = votedForId ? getPlayerName(room, votedForId) : null;

                            return (
                                <div
                                    key={p.id}
                                    className={`result-card result-detail ${roleClass} ${isAccused ? 'accused' : ''}`}
                                    style={nextDetail()}
                                >
                                    <div className="player-info">
                                        <span className="player-name-row">
                                            <span className="player-name">
                                                {p.name}{p.id === myPlayerId && ' (YOU)'}
                                            </span>
                                            <span className={`player-role ${roleClass}`}>{getRoleLabel(role)}</span>
                                        </span>
                                        {!isGameOver && (
                                            <span className="player-voted-for">
                                                {votedFor ? `VOTED FOR ${votedFor}` : 'DID NOT VOTE'}
                                            </span>
                                        )}
                                    </div>
                                    {!isGameOver && role !== 'MASTER' && (
                                        <div className={`vote-count ${votes === 0 ? 'none' : ''}`}>
                                            {isAccused && <span className="accused-tag">ACCUSED</span>}
                                            {voteLabel(votes)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {error && <div className="error-banner">{error}</div>}

                    <div className="play-again-controls result-detail" style={nextDetail()}>
                        {isHost ? (
                            <button type="button" className="btn primary" onClick={handleBackToLobby}>BACK TO LOBBY</button>
                        ) : (
                            <p className="waiting-msg">WAITING FOR THE HOST TO START A NEW ROUND...</p>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}
