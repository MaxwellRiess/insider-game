const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for now, refine for prod
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

const path = require('path');

// Basic health check
app.get('/health', (req, res) => {
    res.send('Digital Insider Server is running');
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const GameManager = require('./gameManager');

const gameManager = new GameManager(io);

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('createRoom', ({ playerName, settings, sessionToken }, callback) => {
        const room = gameManager.createRoom(settings);
        const result = gameManager.joinRoom(socket.id, room.code, playerName, sessionToken);
        if (result.error) {
            callback({ error: result.error });
            return;
        }

        socket.join(room.code);

        const sanitizedRoom = gameManager.getSanitizedRoom(result.room);
        callback({
            room: sanitizedRoom,
            playerId: result.player.id,
            playerName: result.player.name,
            sessionToken: result.player.sessionToken
        });

        gameManager.emitRoomUpdate(room.code);
    });

    socket.on('joinRoom', ({ roomCode, playerName, sessionToken }, callback) => {
        const result = gameManager.joinRoom(socket.id, roomCode.toUpperCase(), playerName, sessionToken);
        if (result.error) {
            callback({ error: result.error });
        } else {
            socket.join(result.room.code);

            const sanitizedRoom = gameManager.getSanitizedRoom(result.room);
            callback({
                room: sanitizedRoom,
                playerId: result.player.id,
                playerName: result.player.name,
                sessionToken: result.player.sessionToken
            });

            gameManager.emitRoomUpdate(result.room.code);
        }
    });

    socket.on('resumeSession', ({ roomCode, sessionToken }, callback) => {
        if (!roomCode || !sessionToken) {
            callback({ error: 'Missing resume credentials' });
            return;
        }

        const result = gameManager.resumeSession(roomCode.toUpperCase(), sessionToken, socket.id);
        if (result.error) {
            callback({ error: result.error });
            return;
        }

        socket.join(result.room.code);
        callback({
            room: gameManager.getSanitizedRoom(result.room),
            playerId: result.player.id,
            playerName: result.player.name,
            sessionToken: result.player.sessionToken
        });

        gameManager.emitRoomUpdate(result.room.code);
    });

    socket.on('startGame', (data, callback = () => {}) => {
        const roomCode = typeof data === 'string' ? data : data?.roomCode;
        const settings = typeof data === 'string' ? {} : (data?.settings || {});
        if (!roomCode) {
            callback({ error: 'Missing room code' });
            return;
        }
        const normalizedRoomCode = roomCode.toUpperCase();

        if (!gameManager.isHostSocketForRoom(socket.id, normalizedRoomCode)) {
            callback({ error: 'Only the host can start the game' });
            return;
        }

        const result = gameManager.startGame(normalizedRoomCode, settings);
        if (result.error) {
            console.error(result.error);
            callback({ error: result.error });
        } else {
            gameManager.emitRoomUpdate(normalizedRoomCode);
            callback({ ok: true });
        }
    });

    socket.on('beginRound', (roomCode, callback = () => {}) => {
        if (!roomCode) {
            callback({ error: 'Missing room code' });
            return;
        }

        const normalizedRoomCode = roomCode.toUpperCase();
        const result = gameManager.beginRound(normalizedRoomCode, socket.id);
        if (result.error) {
            callback({ error: result.error });
            return;
        }

        callback({ ok: true });
    });

    socket.on('submitAnswer', ({ roomCode, answer }) => {
        gameManager.submitAnswer(roomCode, answer);
    });

    socket.on('triggerCorrect', (roomCode) => {
        gameManager.triggerCorrectAnswer(roomCode);
    });

    socket.on('submitVote', ({ roomCode, suspectId }) => {
        gameManager.submitVote(roomCode, socket.id, suspectId);
    });

    socket.on('resetGame', (data, callback = () => {}) => {
        const roomCode = typeof data === 'string' ? data : data?.roomCode;
        const settings = typeof data === 'string' ? {} : (data?.settings || {});
        if (!roomCode) {
            callback({ error: 'Missing room code' });
            return;
        }
        const normalizedRoomCode = roomCode.toUpperCase();

        if (!gameManager.isHostSocketForRoom(socket.id, normalizedRoomCode)) {
            callback({ error: 'Only the host can reset the room' });
            return;
        }

        gameManager.resetGame(normalizedRoomCode, settings);
        callback({ ok: true });
    });

    socket.on('closeRoom', (roomCode, callback = () => {}) => {
        if (!roomCode) {
            callback({ error: 'Missing room code' });
            return;
        }

        const result = gameManager.closeRoom(socket.id, roomCode);
        if (result.error) {
            callback({ error: result.error });
            return;
        }

        io.to(result.roomCode).emit('roomClosed', {
            roomCode: result.roomCode,
            reason: 'Host closed the room'
        });

        callback({ ok: true });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const result = gameManager.removePlayer(socket.id);
        if (result) {
            gameManager.emitRoomUpdate(result.roomCode);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
