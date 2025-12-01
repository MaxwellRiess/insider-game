import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import Lobby from './components/Lobby';
import RoleReveal from './components/RoleReveal';
import GameTimer from './components/GameTimer';
import MasterControls from './components/MasterControls';
import PlayerLog from './components/PlayerLog';
import VotingScreen from './components/VotingScreen';
import ResultsScreen from './components/ResultsScreen';
import './index.css';

function App() {
  const [room, setRoom] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onRoomUpdate(updatedRoom) {
      setRoom(updatedRoom);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('roomUpdate', onRoomUpdate);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('roomUpdate', onRoomUpdate);
    };
  }, []);

  const handleStartGame = () => {
    if (room) {
      socket.emit('startGame', room.code);
    }
  };

  if (!isConnected) {
    return <div className="loading">CONNECTING TO SERVER...</div>;
  }

  if (!room) {
    return <Lobby onJoin={setRoom} />;
  }

  const myId = socket.id;
  const isMaster = room.roles && room.roles[myId] === 'MASTER';

  return (
    <div className="app-container">
      <div className="status-bar">
        <span>ROOM: {room.code}</span>
        <span>PLAYERS: {room.players.length}</span>
      </div>

      {room.state === 'LOBBY' && (
        <div className="waiting-room">
          <h2>WAITING FOR PLAYERS</h2>
          <div className="player-list">
            {room.players.map(p => (
              <div key={p.id} className={`player-card ${p.isHost ? 'host' : ''}`}>
                {p.name} {p.isHost && '(HOST)'}
              </div>
            ))}
          </div>
          {/* Show Start button only for host */}
          {room.players.find(p => p.id === socket.id)?.isHost && (
            <button className="btn primary start-btn" onClick={handleStartGame}>START GAME</button>
          )}
        </div>
      )}

      {room.state === 'ROLE_REVEAL' && (
        <RoleReveal room={room} />
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
        <VotingScreen room={room} />
      )}

      {room.state === 'RESULT' && (
        <ResultsScreen room={room} />
      )}
    </div>
  );
}

export default App;
