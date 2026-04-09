const { randomUUID } = require('crypto');
const { generateRoomCode } = require('./utils');

const DISCONNECT_GRACE_MS = 5 * 60 * 1000;
const STALE_ROOM_CHECK_MS = 60 * 1000; // check every minute
const STALE_ROOM_THRESHOLD_MS = 10 * 60 * 1000; // remove after 10 minutes of full inactivity

class GameManager {
    constructor(io) {
        this.io = io;
        this.rooms = new Map(); // roomCode -> Room State
        this.disconnectGraceMs = DISCONNECT_GRACE_MS;

        this.staleRoomInterval = setInterval(() => {
            this.cleanupStaleRooms();
        }, STALE_ROOM_CHECK_MS);
    }

    cleanupStaleRooms() {
        const now = Date.now();
        for (const [roomCode, room] of this.rooms) {
            const allDisconnected = room.players.every(p => !p.connected);
            if (!allDisconnected) continue;

            const mostRecentActivity = Math.max(
                ...room.players.map(p => p.lastSeenAt || 0)
            );
            if (now - mostRecentActivity < STALE_ROOM_THRESHOLD_MS) continue;

            if (room.timerTimeout) clearTimeout(room.timerTimeout);
            if (room.votingTimeout) clearTimeout(room.votingTimeout);
            for (const player of room.players) {
                if (player.disconnectTimeout) clearTimeout(player.disconnectTimeout);
            }

            this.rooms.delete(roomCode);
        }
    }

    createRoom(settings = {}) {
        let roomCode;
        do {
            roomCode = generateRoomCode();
        } while (this.rooms.has(roomCode));

        const newRoom = {
            code: roomCode,
            hostId: null,
            players: [], // { id, socketId, sessionToken, name, avatar, isHost, connected, lastSeenAt }
            state: 'LOBBY', // LOBBY, ROLE_REVEAL, QUIZ, VOTING, RESULT
            settings: {
                timerDuration: 300, // 5 mins
                wordPack: settings.wordPack || 'Easy'
            },
            secretWord: null,
            roles: {}, // playerId -> role
            votes: {}
        };

        this.rooms.set(roomCode, newRoom);
        return newRoom;
    }

    ensureHost(room) {
        if (room.players.length === 0) {
            room.hostId = null;
            return;
        }

        let host = room.players.find(p => p.id === room.hostId);
        if (!host) {
            host = room.players[0];
            room.hostId = host.id;
        }

        room.players.forEach((player) => {
            player.isHost = player.id === room.hostId;
        });
    }

    findPlayerBySocketId(socketId) {
        for (const room of this.rooms.values()) {
            const player = room.players.find(p => p.socketId === socketId);
            if (player) {
                return { room, player };
            }
        }
        return null;
    }

    joinRoom(socketId, roomCode, playerName, existingSessionToken = null) {
        const room = this.rooms.get(roomCode);
        if (!room) {
            return { error: 'Room not found' };
        }
        if (room.state !== 'LOBBY') {
            return { error: 'Game already in progress' };
        }
        if (room.players.some(p => p.name === playerName)) {
            return { error: 'Name already taken' };
        }

        const newPlayer = {
            id: randomUUID(),
            socketId,
            sessionToken: existingSessionToken || randomUUID(),
            name: playerName,
            avatar: 'default',
            isHost: room.players.length === 0,
            connected: true,
            lastSeenAt: Date.now(),
            disconnectTimeout: null
        };

        if (newPlayer.isHost) {
            room.hostId = newPlayer.id;
        }

        room.players.push(newPlayer);
        this.ensureHost(room);

        return { room, player: newPlayer };
    }

    resumeSession(roomCode, sessionToken, socketId) {
        const room = this.rooms.get(roomCode);
        if (!room) {
            return { error: 'Room not found' };
        }

        const player = room.players.find(p => p.sessionToken === sessionToken);
        if (!player) {
            return { error: 'Session not found for this room' };
        }

        if (player.disconnectTimeout) {
            clearTimeout(player.disconnectTimeout);
            player.disconnectTimeout = null;
        }

        if (player.socketId && player.socketId !== socketId) {
            const previousSocket = this.io.sockets.sockets.get(player.socketId);
            if (previousSocket) {
                previousSocket.leave(roomCode);
            }
        }

        player.socketId = socketId;
        player.connected = true;
        player.lastSeenAt = Date.now();
        this.ensureHost(room);

        return { room, player };
    }

    getRoom(roomCode) {
        return this.rooms.get(roomCode);
    }

    startGame(roomCode, settings = {}) {
        const room = this.rooms.get(roomCode);
        if (!room) return { error: 'Room not found' };
        if (room.players.length < 4) return { error: 'Need at least 4 players' };

        if (settings.wordPack) {
            room.settings.wordPack = settings.wordPack;
        }

        room.roles = {};
        room.votes = {};

        // Assign Roles
        const players = [...room.players];
        for (let i = players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [players[i], players[j]] = [players[j], players[i]];
        }

        const masterId = players[0].id;
        room.roles[masterId] = 'MASTER';

        const insiderId = players[1].id;
        room.roles[insiderId] = 'INSIDER';

        for (let i = 2; i < players.length; i++) {
            room.roles[players[i].id] = 'COMMON';
        }

        const words = require('./words');
        const difficulty = room.settings.wordPack;
        const filteredWords = words.filter(w => w.difficulty === difficulty);
        const pool = filteredWords.length > 0 ? filteredWords : words;

        const randomWord = pool[Math.floor(Math.random() * pool.length)];
        room.secretWord = randomWord.word;

        room.state = 'ROLE_REVEAL';

        return { room };
    }

    beginRound(roomCode, socketId) {
        const room = this.rooms.get(roomCode);
        if (!room) return { error: 'Room not found' };
        if (room.state !== 'ROLE_REVEAL') return { error: 'Round cannot be started right now' };

        const located = this.findPlayerBySocketId(socketId);
        if (!located || located.room.code !== roomCode) {
            return { error: 'Player is not in this room' };
        }

        const role = room.roles[located.player.id];
        if (role !== 'MASTER') {
            return { error: 'Only the Master can begin the round' };
        }

        this.startQuiz(roomCode);
        return { room };
    }

    startQuiz(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        room.state = 'QUIZ';
        room.quizStartTime = Date.now();
        room.questionLog = [];
        this.emitRoomUpdate(roomCode);

        const durationMs = room.settings.timerDuration * 1000;

        if (room.timerTimeout) clearTimeout(room.timerTimeout);

        room.timerTimeout = setTimeout(() => {
            this.endQuiz(roomCode, false);
        }, durationMs);
    }

    submitAnswer(roomCode, answer) {
        const room = this.rooms.get(roomCode);
        if (!room || room.state !== 'QUIZ') return;

        const logEntry = {
            id: room.questionLog.length + 1,
            answer,
            timestamp: Date.now()
        };

        room.questionLog.push(logEntry);
        this.emitRoomUpdate(roomCode);
    }

    triggerCorrectAnswer(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room || room.state !== 'QUIZ') return;

        this.endQuiz(roomCode, true);
    }

    endQuiz(roomCode, success) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        if (room.timerTimeout) clearTimeout(room.timerTimeout);

        room.quizEndTime = Date.now();
        room.quizSuccess = success;

        if (success) {
            room.state = 'VOTING';
            const elapsed = room.quizEndTime - room.quizStartTime;
            const durationMs = room.settings.timerDuration * 1000;
            const remaining = Math.max(0, durationMs - elapsed);

            room.votingDuration = remaining;
            room.votingStartTime = Date.now();

            room.votingTimeout = setTimeout(() => {
                this.endVoting(roomCode);
            }, remaining);

        } else {
            room.state = 'GAME_OVER';
        }

        this.emitRoomUpdate(roomCode);
    }

    submitVote(roomCode, voterSocketId, suspectId) {
        const located = this.findPlayerBySocketId(voterSocketId);
        if (!located) return;

        const { room, player } = located;
        if (room.code !== roomCode || room.state !== 'VOTING') return;
        if (!room.players.some(p => p.id === suspectId)) return;

        if (!room.votes) room.votes = {};

        room.votes[player.id] = suspectId;

        const votersCount = room.players.length;
        if (Object.keys(room.votes).length >= votersCount) {
            this.endVoting(roomCode);
        } else {
            this.emitRoomUpdate(roomCode);
        }
    }

    endVoting(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        if (room.votingTimeout) clearTimeout(room.votingTimeout);

        const voteCounts = {};
        for (const suspectId of Object.values(room.votes || {})) {
            voteCounts[suspectId] = (voteCounts[suspectId] || 0) + 1;
        }

        let maxVotes = 0;
        let accusedId = null;
        let isTie = false;

        for (const [id, count] of Object.entries(voteCounts)) {
            if (count > maxVotes) {
                maxVotes = count;
                accusedId = id;
                isTie = false;
            } else if (count === maxVotes) {
                isTie = true;
            }
        }

        let winner = '';
        const insiderId = Object.keys(room.roles).find(id => room.roles[id] === 'INSIDER');

        if (isTie) {
            winner = 'INSIDER';
            room.winReason = 'VOTE TIED';
        } else if (accusedId === insiderId) {
            winner = 'COMMONS';
            room.winReason = 'INSIDER CAUGHT';
        } else {
            winner = 'INSIDER';
            room.winReason = 'WRONG ACCUSATION';
        }

        room.state = 'RESULT';
        room.winner = winner;
        room.voteResults = voteCounts;
        room.accusedId = accusedId;

        this.emitRoomUpdate(roomCode);
    }

    resetGame(roomCode, settings = {}) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        if (settings.wordPack) {
            room.settings.wordPack = settings.wordPack;
        }

        room.state = 'LOBBY';
        room.secretWord = null;
        room.roles = {};
        room.votes = {};
        room.questionLog = [];
        room.quizStartTime = null;
        room.quizEndTime = null;
        room.quizSuccess = null;
        room.winner = null;
        room.voteResults = null;
        room.accusedId = null;

        if (room.timerTimeout) clearTimeout(room.timerTimeout);
        if (room.votingTimeout) clearTimeout(room.votingTimeout);

        this.emitRoomUpdate(roomCode);
    }

    isHostSocketForRoom(socketId, roomCode) {
        const located = this.findPlayerBySocketId(socketId);
        if (!located) return false;

        const { room, player } = located;
        return room.code === roomCode && room.hostId === player.id;
    }

    getSanitizedRoom(room) {
        return {
            ...room,
            players: room.players.map(player => ({
                id: player.id,
                name: player.name,
                avatar: player.avatar,
                isHost: player.isHost,
                connected: player.connected,
                lastSeenAt: player.lastSeenAt
            })),
            timerTimeout: undefined,
            votingTimeout: undefined
        };
    }

    emitRoomUpdate(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        const sanitizedRoom = this.getSanitizedRoom(room);
        this.io.to(roomCode).emit('roomUpdate', sanitizedRoom);
    }

    evictPlayer(roomCode, playerId) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        const index = room.players.findIndex(p => p.id === playerId);
        if (index === -1) return;

        const [player] = room.players.splice(index, 1);
        if (player.disconnectTimeout) {
            clearTimeout(player.disconnectTimeout);
        }

        delete room.roles[playerId];
        if (room.votes) {
            delete room.votes[playerId];
            for (const [voterId, suspectId] of Object.entries(room.votes)) {
                if (suspectId === playerId) {
                    delete room.votes[voterId];
                }
            }
        }

        if (room.hostId === playerId) {
            room.hostId = null;
        }

        if (room.players.length === 0) {
            if (room.timerTimeout) clearTimeout(room.timerTimeout);
            if (room.votingTimeout) clearTimeout(room.votingTimeout);
            this.rooms.delete(roomCode);
            return;
        }

        this.ensureHost(room);

        if (room.state === 'VOTING') {
            const votersCount = room.players.length;
            if (Object.keys(room.votes || {}).length >= votersCount) {
                this.endVoting(roomCode);
                return;
            }
        }

        this.emitRoomUpdate(roomCode);
    }

    removePlayer(socketId) {
        const located = this.findPlayerBySocketId(socketId);
        if (!located) {
            return null;
        }

        const { room, player } = located;
        player.connected = false;
        player.lastSeenAt = Date.now();
        player.socketId = null;

        if (player.disconnectTimeout) {
            clearTimeout(player.disconnectTimeout);
        }

        player.disconnectTimeout = setTimeout(() => {
            this.evictPlayer(room.code, player.id);
        }, this.disconnectGraceMs);

        return { roomCode: room.code, room };
    }

    closeRoom(socketId, roomCode) {
        if (!roomCode || typeof roomCode !== 'string') {
            return { error: 'Room code is required' };
        }

        const normalizedRoomCode = roomCode.toUpperCase();
        const room = this.rooms.get(normalizedRoomCode);
        if (!room) {
            return { error: 'Room not found' };
        }

        const located = this.findPlayerBySocketId(socketId);
        if (!located || located.room.code !== normalizedRoomCode) {
            return { error: 'Only players in the room can close it' };
        }

        if (room.hostId !== located.player.id) {
            return { error: 'Only the host can close the room' };
        }

        if (room.timerTimeout) clearTimeout(room.timerTimeout);
        if (room.votingTimeout) clearTimeout(room.votingTimeout);

        for (const player of room.players) {
            if (player.disconnectTimeout) {
                clearTimeout(player.disconnectTimeout);
            }
        }

        this.rooms.delete(normalizedRoomCode);
        return { roomCode: normalizedRoomCode };
    }
}

module.exports = GameManager;
