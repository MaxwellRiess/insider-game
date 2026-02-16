import React, { useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import Lobby from './components/Lobby';
import RoleReveal from './components/RoleReveal';
import GameTimer from './components/GameTimer';
import MasterControls from './components/MasterControls';
import PlayerLog from './components/PlayerLog';
import VotingScreen from './components/VotingScreen';
import ResultsScreen from './components/ResultsScreen';
import { clearSession, getSavedSession, saveSession } from './session';
import './index.css';

function App() {
  const [room, setRoom] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [savedSession, setSavedSession] = useState(() => getSavedSession());
  const [resumeError, setResumeError] = useState('');
  const [roomActionError, setRoomActionError] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('Easy');
  const [hostMenuOpen, setHostMenuOpen] = useState(false);
  const attemptedResumeSocketId = useRef(null);
  const savedSessionRef = useRef(savedSession);
  const hostMenuRef = useRef(null);

  const getResumeErrorMessage = (error) => {
    const silentErrors = new Set([
      'Room not found',
      'Session not found for this room',
      'Missing resume credentials'
    ]);

    if (!error || silentErrors.has(error)) {
      return '';
    }

    return error;
  };

  const clearSavedSession = (message = '') => {
    clearSession();
    setSavedSession(null);
    setResumeError(message);
  };

  const handleJoinResponse = (response) => {
    if (!response || !response.room || !response.playerId || !response.sessionToken) {
      return;
    }

    const nextSession = {
      roomCode: response.room.code,
      playerId: response.playerId,
      sessionToken: response.sessionToken,
      playerName: response.playerName
    };

    saveSession(nextSession);
    setSavedSession(nextSession);
    setResumeError('');
    setRoomActionError('');
    setSelectedDifficulty(response.room.settings?.wordPack || 'Easy');
    setRoom(response.room);
    attemptedResumeSocketId.current = socket.id;
  };

  useEffect(() => {
    savedSessionRef.current = savedSession;
  }, [savedSession]);

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onRoomUpdate(updatedRoom) {
      const currentSession = savedSessionRef.current;
      if (currentSession?.playerId) {
        const stillInRoom = updatedRoom.players.some(player => player.id === currentSession.playerId);
        if (!stillInRoom) {
          setRoom(null);
          clearSavedSession('You are no longer in the room.');
          return;
        }
      }

      setRoom(updatedRoom);
      setHostMenuOpen(false);
    }

    function onRoomClosed() {
      setRoom(null);
      setHostMenuOpen(false);
      clearSavedSession('The host has ended the room.');
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('roomUpdate', onRoomUpdate);
    socket.on('roomClosed', onRoomClosed);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('roomUpdate', onRoomUpdate);
      socket.off('roomClosed', onRoomClosed);
    };
  }, []);

  useEffect(() => {
    if (!isConnected || room || !savedSession) {
      return;
    }

    if (attemptedResumeSocketId.current === socket.id) {
      return;
    }

    attemptedResumeSocketId.current = socket.id;

    socket.emit(
      'resumeSession',
      { roomCode: savedSession.roomCode, sessionToken: savedSession.sessionToken },
      (response) => {
        if (!response || response.error) {
          setRoom(null);
          clearSavedSession(getResumeErrorMessage(response?.error));
          return;
        }

        handleJoinResponse(response);
      }
    );
  }, [isConnected, room, savedSession]);

  useEffect(() => {
    if (!hostMenuOpen) {
      return undefined;
    }

    const closeIfOutside = (event) => {
      if (!hostMenuRef.current) {
        return;
      }

      if (!hostMenuRef.current.contains(event.target)) {
        setHostMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', closeIfOutside);
    document.addEventListener('touchstart', closeIfOutside);

    return () => {
      document.removeEventListener('mousedown', closeIfOutside);
      document.removeEventListener('touchstart', closeIfOutside);
    };
  }, [hostMenuOpen]);

  const handleStartGame = () => {
    if (!room) return;

    socket.emit(
      'startGame',
      { roomCode: room.code, settings: { wordPack: selectedDifficulty } },
      (response) => {
        if (response?.error) {
          setRoomActionError(response.error);
        } else {
          setRoomActionError('');
        }
      }
    );
  };

  const handleResetRoom = () => {
    if (!room) return;
    if (!window.confirm('Reset this room to the lobby?')) return;

    socket.emit('resetGame', room.code, (response) => {
      if (response?.error) {
        setRoomActionError(response.error);
      } else {
        setRoomActionError('');
        setHostMenuOpen(false);
      }
    });
  };

  const handleCloseRoom = () => {
    if (!room) return;
    if (!window.confirm('Close this room for everyone?')) return;

    socket.emit('closeRoom', room.code, (response) => {
      if (response?.error) {
        setRoomActionError(response.error);
      } else {
        setRoomActionError('');
        setHostMenuOpen(false);
        setRoom(null);
        clearSavedSession('The host has ended the room.');
      }
    });
  };

  if (!isConnected) {
    return <div className="loading">{room ? 'RECONNECTING...' : 'CONNECTING TO SERVER...'}</div>;
  }

  if (!room) {
    return (
      <Lobby
        onJoin={handleJoinResponse}
        savedSession={savedSession}
        resumeError={resumeError}
        onClearSavedSession={() => clearSavedSession('')}
      />
    );
  }

  const myPlayerId = savedSession?.playerId;
  const myPlayer = room.players.find(player => player.id === myPlayerId);
  const isHost = Boolean(myPlayer?.isHost);
  const isMaster = Boolean(myPlayerId && room.roles && room.roles[myPlayerId] === 'MASTER');

  return (
    <div className="app-container">
      <div className="status-bar">
        <div className="status-left">
          <span>ROOM: {room.code}</span>
          {isHost && (
            <div className="host-menu" ref={hostMenuRef}>
              <button
                type="button"
                className="host-menu-trigger"
                onClick={() => setHostMenuOpen((open) => !open)}
                aria-label="Room options"
              >
                •••
              </button>
              {hostMenuOpen && (
                <div className="host-menu-panel">
                  <button type="button" className="host-menu-item" onClick={handleResetRoom}>RESET ROOM</button>
                  <button type="button" className="host-menu-item danger" onClick={handleCloseRoom}>CLOSE ROOM</button>
                </div>
              )}
            </div>
          )}
        </div>
        <span>PLAYERS: {room.players.length}</span>
      </div>

      {roomActionError && <div className="error-banner">{roomActionError}</div>}

      {room.state === 'LOBBY' && (
        <div className="waiting-room">
          <h2>WAITING FOR PLAYERS</h2>
          <div className="player-list">
            {room.players.map(p => (
              <div key={p.id} className={`player-card ${p.isHost ? 'host' : ''}`}>
                {p.name} {p.isHost && '(HOST)'} {!p.connected && '(OFFLINE)'}
              </div>
            ))}
          </div>

          {isHost && (
            <div className="start-controls">
              <div className="setting-group">
                <label>ROUND DIFFICULTY:</label>
                <select
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value)}
                  className="input-field"
                >
                  <option value="Easy">EASY</option>
                  <option value="Medium">MEDIUM</option>
                  <option value="Hard">HARD</option>
                </select>
              </div>
              <button className="btn primary start-btn" onClick={handleStartGame}>START GAME</button>
            </div>
          )}
        </div>
      )}

      {room.state === 'ROLE_REVEAL' && (
        <RoleReveal room={room} myPlayerId={myPlayerId} />
      )}

      {room.state === 'QUIZ' && (
        <div className="quiz-view">
          <GameTimer startTime={room.quizStartTime} duration={room.settings.timerDuration} />

          {isMaster ? (
            <MasterControls roomCode={room.code} />
          ) : (
            <div className="common-view">
              <p>ASK QUESTIONS!</p>
              <p>WAIT FOR MASTER RESPONSE</p>
            </div>
          )}

          <PlayerLog log={room.questionLog || []} />
        </div>
      )}

      {room.state === 'VOTING' && (
        <VotingScreen room={room} myPlayerId={myPlayerId} />
      )}

      {room.state === 'RESULT' && (
        <ResultsScreen room={room} myPlayerId={myPlayerId} />
      )}
    </div>
  );
}

export default App;
