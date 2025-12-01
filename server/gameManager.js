const { generateRoomCode } = require('./utils');

class GameManager {
    constructor(io) {
        this.io = io;
        this.rooms = new Map(); // roomCode -> Room State
    }

    createRoom(hostId, settings = {}) {
        let roomCode;
        do {
            roomCode = generateRoomCode();
        } while (this.rooms.has(roomCode));

        const newRoom = {
            code: roomCode,
            hostId: hostId,
            players: [], // { id, name, avatar, role, isHost }
            state: 'LOBBY', // LOBBY, ROLE_REVEAL, QUIZ, VOTING, RESULT
            settings: {
                timerDuration: 300, // 5 mins
                wordPack: settings.wordPack || 'Easy'
            },
            secretWord: null,
            roles: {} // playerId -> role
        };

        this.rooms.set(roomCode, newRoom);
        return newRoom;
    }

    joinRoom(socketId, roomCode, playerName) {
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

        const isHost = room.players.length === 0; // First player is host? Or host created it separately?
        // In this flow, Host creates room then joins? Or Host is implicitly first player?
        // Let's assume Host creates and automatically joins.

        // Actually, if createRoom is called, we should probably add the host there or immediately after.
        // Let's handle it in the socket handler: create -> join.

        const newPlayer = {
            id: socketId,
            name: playerName,
            avatar: 'default', // TODO: Add avatar selection
            isHost: false // Will be set if they match hostId
        };

        if (socketId === room.hostId) {
            newPlayer.isHost = true;
        }

        room.players.push(newPlayer);
        return { room };
    }

    getRoom(roomCode) {
        return this.rooms.get(roomCode);
    }

    startGame(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) return { error: 'Room not found' };
        if (room.players.length < 4) return { error: 'Need at least 4 players' }; // TODO: Lower to 3 for dev?

        // Assign Roles
        const players = [...room.players];
        // Shuffle players
        for (let i = players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [players[i], players[j]] = [players[j], players[i]];
        }

        // Assign Master (Index 0)
        const masterId = players[0].id;
        room.roles[masterId] = 'MASTER';

        // Assign Insider (Index 1)
        const insiderId = players[1].id;
        room.roles[insiderId] = 'INSIDER';

        // Assign Commons (Rest)
        for (let i = 2; i < players.length; i++) {
            room.roles[players[i].id] = 'COMMON';
        }

        // Select Word based on Difficulty
        const words = require('./words');
        const difficulty = room.settings.wordPack;
        const filteredWords = words.filter(w => w.difficulty === difficulty);

        // Fallback if no words found (shouldn't happen)
        const pool = filteredWords.length > 0 ? filteredWords : words;

        const randomWord = pool[Math.floor(Math.random() * pool.length)];
        room.secretWord = randomWord.word;

        room.state = 'ROLE_REVEAL';

        // Start 10s timer for reveal
        setTimeout(() => {
            this.startQuiz(roomCode);
        }, 10000);

        return { room };
    }

    startQuiz(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        room.state = 'QUIZ';
        room.quizStartTime = Date.now();
        room.questionLog = []; // { id, answer, timestamp }
        this.emitRoomUpdate(roomCode);

        // Timer is handled on client mostly, but server should validate end time?
        // For now, trust clients or Master to trigger end, or set a timeout.
        // Let's set a timeout to force end if Master doesn't trigger it.
        const durationMs = room.settings.timerDuration * 1000;

        // Clear any existing timeout
        if (room.timerTimeout) clearTimeout(room.timerTimeout);

        room.timerTimeout = setTimeout(() => {
            this.endQuiz(roomCode, false); // Time ran out
        }, durationMs);
    }

    submitAnswer(roomCode, answer) {
        const room = this.rooms.get(roomCode);
        if (!room || room.state !== 'QUIZ') return;

        const logEntry = {
            id: room.questionLog.length + 1,
            answer: answer, // 'YES', 'NO', 'IDK'
            timestamp: Date.now()
        };

        room.questionLog.push(logEntry);
        this.emitRoomUpdate(roomCode);
    }

    triggerCorrectAnswer(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room || room.state !== 'QUIZ') return;

        this.endQuiz(roomCode, true); // Found the word
    }

    endQuiz(roomCode, success) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        if (room.timerTimeout) clearTimeout(room.timerTimeout);

        room.quizEndTime = Date.now();
        room.quizSuccess = success;

        if (success) {
            room.state = 'VOTING';
            // Start voting timer? Or just let them discuss?
            // Spec says: "The timer flips (starts counting down the remaining time)."
            // We need to calculate remaining time.
            const elapsed = room.quizEndTime - room.quizStartTime;
            const durationMs = room.settings.timerDuration * 1000;
            const remaining = Math.max(0, durationMs - elapsed);

            room.votingDuration = remaining;
            room.votingStartTime = Date.now();

            // Auto-end voting after duration
            room.votingTimeout = setTimeout(() => {
                this.endVoting(roomCode);
            }, remaining);

        } else {
            room.state = 'GAME_OVER'; // Everyone loses
        }

        this.emitRoomUpdate(roomCode);
    }

    submitVote(roomCode, voterId, suspectId) {
        const room = this.rooms.get(roomCode);
        if (!room || room.state !== 'VOTING') return;

        // Initialize votes map if needed
        if (!room.votes) room.votes = {};

        room.votes[voterId] = suspectId;

        // Check if everyone (except Master?) has voted.
        // Spec: "A list of all players (except the Master) appears on everyone's screen."
        // Usually Master also votes in Insider?
        // "Players select who they suspect is the Insider."
        // Let's assume everyone votes, including Master.

        const votersCount = room.players.length;
        if (Object.keys(room.votes).length >= votersCount) {
            this.endVoting(roomCode);
        } else {
            // Optional: Emit update to show who has voted (but not who they voted for)
            this.emitRoomUpdate(roomCode);
        }
    }

    endVoting(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        if (room.votingTimeout) clearTimeout(room.votingTimeout);

        // Tally votes
        const voteCounts = {};
        for (const suspectId of Object.values(room.votes || {})) {
            voteCounts[suspectId] = (voteCounts[suspectId] || 0) + 1;
        }

        // Find player with most votes
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

        // Determine Winner
        // Scenario A: Correct Accusation (Accused is Insider) -> Commons + Master Win
        // Scenario B: Wrong Accusation (Accused is Commoner/Master) -> Insider Wins
        // Tie -> Insider Wins (Option B in spec)

        let winner = ''; // 'COMMONS' or 'INSIDER'

        // Find Insider ID
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

        // Update settings if provided
        if (settings.wordPack) {
            room.settings.wordPack = settings.wordPack;
        }

        // Reset state to LOBBY
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

        // Clear timeouts
        if (room.timerTimeout) clearTimeout(room.timerTimeout);
        if (room.votingTimeout) clearTimeout(room.votingTimeout);

        this.emitRoomUpdate(roomCode);
    }

    emitRoomUpdate(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) return;

        // Create a sanitized copy of the room object
        const sanitizedRoom = {
            ...room,
            timerTimeout: undefined,
            votingTimeout: undefined
        };

        this.io.to(roomCode).emit('roomUpdate', sanitizedRoom);
    }

    removePlayer(socketId) {
        // Find room player is in
        for (const [code, room] of this.rooms.entries()) {
            const index = room.players.findIndex(p => p.id === socketId);
            if (index !== -1) {
                const player = room.players[index];
                room.players.splice(index, 1);

                // If host left, assign new host or close room?
                if (player.isHost && room.players.length > 0) {
                    room.players[0].isHost = true;
                    room.hostId = room.players[0].id;
                } else if (room.players.length === 0) {
                    this.rooms.delete(code);
                }

                return { roomCode: code, room };
            }
        }
        return null;
    }
}

module.exports = GameManager;
