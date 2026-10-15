const { randomUUID } = require('crypto');
const { generateRoomCode } = require('./utils');
const words = require('./words');

const DISCONNECT_GRACE_MS = 5 * 60 * 1000;
// How long a disconnected host keeps the role before it passes to another
// player, so a page refresh or a brief signal drop does not cost them it.
// HOST_HANDOVER_GRACE_MS can shorten it for local testing.
const HOST_HANDOVER_GRACE_MS = Number(process.env.HOST_HANDOVER_GRACE_MS) || 30 * 1000;
const STALE_ROOM_CHECK_MS = 60 * 1000; // check every minute
const STALE_ROOM_THRESHOLD_MS = 10 * 60 * 1000; // remove after 10 minutes of full inactivity
const MIN_VOTING_MS = 60 * 1000;
const MAX_NAME_LENGTH = 20;

const WORD_PACKS = ['Easy', 'Medium', 'Hard'];
const ANSWERS = ['YES', 'NO', 'IDK'];
// States in which every role, the word and all votes are public.
const REVEALED_STATES = new Set(['RESULT', 'GAME_OVER']);
// States in which a round is under way and needs its Master and Insider.
const ROUND_STATES = new Set(['ROLE_REVEAL', 'QUIZ', 'VOTING']);
const KEY_ROLE_NAMES = { MASTER: 'Master', INSIDER: 'Insider' };

class GameManager {
    constructor(io) {
        this.io = io;
        this.rooms = new Map(); // roomCode -> Room State
        this.socketIndex = new Map(); // socketId -> { roomCode, playerId }
        this.disconnectGraceMs = DISCONNECT_GRACE_MS;
        this.hostHandoverGraceMs = HOST_HANDOVER_GRACE_MS;

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

            this.destroyRoom(roomCode);
        }
    }

    destroyRoom(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        this.clearRoomTimers(room);
        this.clearHostHandover(room);
        for (const player of room.players) {
            if (player.disconnectTimeout) clearTimeout(player.disconnectTimeout);
            if (player.socketId) this.socketIndex.delete(player.socketId);
        }

        this.rooms.delete(roomCode);
    }

    clearRoomTimers(room) {
        if (room.timerTimeout) clearTimeout(room.timerTimeout);
        if (room.votingTimeout) clearTimeout(room.votingTimeout);
        room.timerTimeout = null;
        room.votingTimeout = null;
    }

    clearHostHandover(room) {
        if (room.hostHandoverTimeout) clearTimeout(room.hostHandoverTimeout);
        room.hostHandoverTimeout = null;
    }

    // Gives a disconnected host a grace period to come back before the
    // role moves to another player.
    scheduleHostHandover(room) {
        this.clearHostHandover(room);
        room.hostHandoverTimeout = setTimeout(() => {
            room.hostHandoverTimeout = null;
            if (this.rooms.get(room.code) !== room) return;
            this.ensureHost(room);
            this.emitRoomUpdate(room.code);
        }, this.hostHandoverGraceMs);
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
            state: 'LOBBY', // LOBBY, ROLE_REVEAL, QUIZ, VOTING, RESULT, GAME_OVER
            settings: {
                timerDuration: 300, // 5 mins
                wordPack: WORD_PACKS.includes(settings.wordPack) ? settings.wordPack : 'Easy'
            },
            secretWord: null,
            roles: {}, // playerId -> role
            votes: {},
            notice: null, // shown in the lobby, e.g. why the last round ended early
            hostHandoverTimeout: null
        };

        this.rooms.set(roomCode, newRoom);
        return newRoom;
    }

    // Keeps a connected host whenever possible. Falls back to any player
    // only when nobody is connected. A disconnected host keeps the role
    // while their handover grace period is running.
    ensureHost(room) {
        if (room.players.length === 0) {
            room.hostId = null;
            return;
        }

        const host = room.players.find(p => p.id === room.hostId);
        if (host?.connected) {
            this.clearHostHandover(room);
        }
        if (!host || (!host.connected && !room.hostHandoverTimeout)) {
            const replacement = room.players.find(p => p.connected) || host || room.players[0];
            room.hostId = replacement.id;
        }

        room.players.forEach((player) => {
            player.isHost = player.id === room.hostId;
        });
    }

    findPlayerBySocketId(socketId) {
        const entry = this.socketIndex.get(socketId);
        if (!entry) return null;

        const room = this.rooms.get(entry.roomCode);
        const player = room?.players.find(p => p.id === entry.playerId);
        if (!player || player.socketId !== socketId) {
            this.socketIndex.delete(socketId);
            return null;
        }

        return { room, player };
    }

    // Validates a display name. Returns the trimmed name or null.
    normaliseName(playerName) {
        if (typeof playerName !== 'string') return null;
        const name = playerName.trim().replace(/\s+/g, ' ');
        if (name.length < 1 || name.length > MAX_NAME_LENGTH) return null;
        return name;
    }

    joinRoom(socketId, roomCode, playerName) {
        const room = this.rooms.get(roomCode);
        if (!room) {
            return { error: 'Room not found' };
        }
        if (room.state !== 'LOBBY') {
            return { error: 'Game already in progress' };
        }

        const name = this.normaliseName(playerName);
        if (!name) {
            return { error: `Name must be 1 to ${MAX_NAME_LENGTH} characters` };
        }
        const lowerName = name.toLowerCase();
        if (room.players.some(p => p.name.toLowerCase() === lowerName)) {
            return { error: 'Name already taken' };
        }

        const newPlayer = {
            id: randomUUID(),
            socketId,
            sessionToken: randomUUID(),
            name,
            avatar: 'default',
            isHost: false,
            connected: true,
            lastSeenAt: Date.now(),
            disconnectTimeout: null
        };

        room.players.push(newPlayer);
        this.socketIndex.set(socketId, { roomCode: room.code, playerId: newPlayer.id });
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
            this.socketIndex.delete(player.socketId);
            const previousSocket = this.io.sockets.sockets.get(player.socketId);
            if (previousSocket) {
                previousSocket.leave(roomCode);
            }
        }

        player.socketId = socketId;
        player.connected = true;
        player.lastSeenAt = Date.now();
        this.socketIndex.set(socketId, { roomCode: room.code, playerId: player.id });
        this.ensureHost(room);

        return { room, player };
    }

    getRoom(roomCode) {
        return this.rooms.get(roomCode);
    }

    startGame(roomCode, settings = {}) {
        const room = this.rooms.get(roomCode);
        if (!room) return { error: 'Room not found' };
        if (room.state !== 'LOBBY') return { error: 'Game already in progress' };
        if (room.players.length < 4) return { error: 'Need at least 4 players' };

        if (WORD_PACKS.includes(settings.wordPack)) {
            room.settings.wordPack = settings.wordPack;
        }

        this.clearRoomTimers(room);
        room.roles = {};
        room.votes = {};
        room.winner = null;
        room.winReason = null;
        room.voteResults = null;
        room.accusedId = null;
        room.notice = null;

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

        const difficulty = room.settings.wordPack;
        const filteredWords = words.filter(w => w.difficulty === difficulty);
        const pool = filteredWords.length > 0 ? filteredWords : words;

        const randomWord = pool[Math.floor(Math.random() * pool.length)];
        room.secretWord = randomWord.word;

        room.state = 'ROLE_REVEAL';

        return { room };
    }

    isMasterSocketForRoom(socketId, roomCode) {
        const located = this.findPlayerBySocketId(socketId);
        if (!located || located.room.code !== roomCode) return false;
        return located.room.roles[located.player.id] === 'MASTER';
    }

    beginRound(roomCode, socketId) {
        const room = this.rooms.get(roomCode);
        if (!room) return { error: 'Room not found' };
        if (room.state !== 'ROLE_REVEAL') return { error: 'Round cannot be started right now' };

        if (!this.isMasterSocketForRoom(socketId, roomCode)) {
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

    submitAnswer(roomCode, socketId, answer) {
        const room = this.rooms.get(roomCode);
        if (!room) return { error: 'Room not found' };
        if (room.state !== 'QUIZ') return { error: 'The quiz is not running' };
        if (!this.isMasterSocketForRoom(socketId, roomCode)) {
            return { error: 'Only the Master can answer' };
        }
        if (!ANSWERS.includes(answer)) return { error: 'Invalid answer' };

        const logEntry = {
            id: room.questionLog.length + 1,
            answer,
            timestamp: Date.now()
        };

        room.questionLog.push(logEntry);
        this.emitRoomUpdate(roomCode);
        return { ok: true };
    }

    triggerCorrectAnswer(roomCode, socketId) {
        const room = this.rooms.get(roomCode);
        if (!room) return { error: 'Room not found' };
        if (room.state !== 'QUIZ') return { error: 'The quiz is not running' };
        if (!this.isMasterSocketForRoom(socketId, roomCode)) {
            return { error: 'Only the Master can confirm the word' };
        }

        this.endQuiz(roomCode, true);
        return { ok: true };
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
            const remaining = Math.max(MIN_VOTING_MS, durationMs - elapsed);

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
        if (!located) return { error: 'Player is not in a room' };

        const { room, player } = located;
        if (room.code !== roomCode) return { error: 'Player is not in this room' };
        if (room.state !== 'VOTING') return { error: 'Voting is not open' };
        if (!room.players.some(p => p.id === suspectId)) return { error: 'Unknown player' };
        if (room.roles[suspectId] === 'MASTER') return { error: 'The Master cannot be accused' };

        if (!room.votes) room.votes = {};

        room.votes[player.id] = suspectId;

        if (this.allConnectedVoted(room)) {
            this.endVoting(roomCode);
        } else {
            this.emitRoomUpdate(roomCode);
        }
        return { ok: true };
    }

    // True once every connected player has voted. Offline players do not
    // hold up the vote, but any vote they cast before dropping still counts.
    allConnectedVoted(room) {
        const votes = room.votes || {};
        const connected = room.players.filter(p => p.connected);
        return connected.length > 0 && connected.every(p => votes[p.id]);
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

        if (Object.keys(voteCounts).length === 0) {
            winner = 'INSIDER';
            room.winReason = 'NO VOTES CAST';
        } else if (isTie) {
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
        room.accusedId = isTie ? null : accusedId;

        this.emitRoomUpdate(roomCode);
    }

    resetGame(roomCode, settings = {}) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        if (WORD_PACKS.includes(settings.wordPack)) {
            room.settings.wordPack = settings.wordPack;
        }

        this.returnToLobby(room, null);
    }

    // Clears all round state and sends everyone back to the lobby.
    returnToLobby(room, notice) {
        room.state = 'LOBBY';
        room.notice = notice;
        room.secretWord = null;
        room.roles = {};
        room.votes = {};
        room.questionLog = [];
        room.quizStartTime = null;
        room.quizEndTime = null;
        room.quizSuccess = null;
        room.votingStartTime = null;
        room.votingDuration = null;
        room.winner = null;
        room.winReason = null;
        room.voteResults = null;
        room.accusedId = null;

        this.clearRoomTimers(room);

        this.emitRoomUpdate(room.code);
    }

    isHostSocketForRoom(socketId, roomCode) {
        const located = this.findPlayerBySocketId(socketId);
        if (!located) return false;

        const { room, player } = located;
        return room.code === roomCode && room.hostId === player.id;
    }

    // Builds the room view for one player. Secrets are only included where
    // that player is allowed to see them.
    getSanitizedRoom(room, viewerId) {
        const revealed = REVEALED_STATES.has(room.state);
        const myRole = room.roles[viewerId] || null;
        const knowsWord = revealed || myRole === 'MASTER' || myRole === 'INSIDER';
        const masterId = Object.keys(room.roles).find(id => room.roles[id] === 'MASTER') || null;
        const votes = room.votes || {};

        const view = {
            code: room.code,
            hostId: room.hostId,
            state: room.state,
            settings: room.settings,
            players: room.players.map(player => ({
                id: player.id,
                name: player.name,
                avatar: player.avatar,
                isHost: player.isHost,
                connected: player.connected,
                lastSeenAt: player.lastSeenAt
            })),
            myId: viewerId,
            myRole,
            masterId,
            secretWord: knowsWord ? room.secretWord : null,
            questionLog: room.questionLog || [],
            quizStartTime: room.quizStartTime || null,
            quizEndTime: room.quizEndTime || null,
            quizSuccess: room.quizSuccess ?? null,
            votingStartTime: room.votingStartTime || null,
            votingDuration: room.votingDuration || null,
            votedPlayerIds: Object.keys(votes),
            myVote: votes[viewerId] || null,
            notice: room.notice || null
        };

        if (revealed) {
            view.roles = room.roles;
            view.votes = votes;
            view.winner = room.winner || null;
            view.winReason = room.winReason || null;
            view.voteResults = room.voteResults || null;
            view.accusedId = room.accusedId || null;
        }

        return view;
    }

    emitRoomUpdate(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        for (const player of room.players) {
            if (!player.connected || !player.socketId) continue;
            this.io.to(player.socketId).emit('roomUpdate', this.getSanitizedRoom(room, player.id));
        }
    }

    evictPlayer(roomCode, playerId) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        const index = room.players.findIndex(p => p.id === playerId);
        if (index === -1) return;

        const role = room.roles[playerId];
        const [player] = room.players.splice(index, 1);
        if (player.disconnectTimeout) {
            clearTimeout(player.disconnectTimeout);
        }
        if (player.socketId) {
            this.socketIndex.delete(player.socketId);
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
            this.clearHostHandover(room);
        }

        if (room.players.length === 0) {
            this.destroyRoom(roomCode);
            return;
        }

        this.ensureHost(room);

        // Without its Master or Insider a round cannot finish: nobody can
        // begin it or confirm the word, and the vote cannot catch anyone.
        // End it and send everyone back to the lobby with the reason.
        if (ROUND_STATES.has(room.state) && KEY_ROLE_NAMES[role]) {
            this.returnToLobby(room, `${player.name} (the ${KEY_ROLE_NAMES[role]}) left, so the round was ended.`);
            return;
        }

        if (room.state === 'VOTING' && this.allConnectedVoted(room)) {
            this.endVoting(roomCode);
            return;
        }

        this.emitRoomUpdate(roomCode);
    }

    removePlayer(socketId) {
        const located = this.findPlayerBySocketId(socketId);
        this.socketIndex.delete(socketId);
        if (!located) {
            return null;
        }

        this.disconnectPlayer(located.room, located.player);
        return { roomCode: located.room.code, room: located.room };
    }

    // Marks a player offline and starts their reconnect grace period.
    disconnectPlayer(room, player) {
        player.connected = false;
        player.lastSeenAt = Date.now();
        player.socketId = null;

        if (player.disconnectTimeout) {
            clearTimeout(player.disconnectTimeout);
        }

        player.disconnectTimeout = setTimeout(() => {
            this.evictPlayer(room.code, player.id);
        }, this.disconnectGraceMs);

        if (room.hostId === player.id) {
            this.scheduleHostHandover(room);
        }
        this.ensureHost(room);

        // If this was the last player still to vote, close the vote now
        // rather than waiting for the timer or the grace period.
        if (room.state === 'VOTING' && this.allConnectedVoted(room)) {
            this.endVoting(room.code);
        }
    }

    leaveRoom(socketId, roomCode) {
        const located = this.findPlayerBySocketId(socketId);
        if (!located || located.room.code !== roomCode) {
            return { error: 'You are not in this room' };
        }

        this.evictPlayer(roomCode, located.player.id);
        this.socketIndex.delete(socketId);
        return { ok: true };
    }

    closeRoom(socketId, roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) {
            return { error: 'Room not found' };
        }

        const located = this.findPlayerBySocketId(socketId);
        if (!located || located.room.code !== roomCode) {
            return { error: 'Only players in the room can close it' };
        }

        if (room.hostId !== located.player.id) {
            return { error: 'Only the host can close the room' };
        }

        this.destroyRoom(roomCode);
        return { roomCode };
    }
}

module.exports = GameManager;
