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

// Basic health check
app.get('/', (req, res) => {
    res.send('Digital Insider Server is running');
});

const GameManager = require('./gameManager');

const gameManager = new GameManager(io);

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('createRoom', ({ playerName, settings }, callback) => {
        const room = gameManager.createRoom(socket.id, settings);
        const result = gameManager.joinRoom(socket.id, room.code, playerName);
        socket.join(room.code);

        // Sanitize for callback
        const sanitizedRoom = { ...result.room, timerTimeout: undefined, votingTimeout: undefined };
        callback({ room: sanitizedRoom });

        gameManager.emitRoomUpdate(room.code);
    });

    socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
        const result = gameManager.joinRoom(socket.id, roomCode.toUpperCase(), playerName);
        if (result.error) {
            callback({ error: result.error });
        } else {
            socket.join(result.room.code);

            // Sanitize for callback
            const sanitizedRoom = { ...result.room, timerTimeout: undefined, votingTimeout: undefined };
            callback({ room: sanitizedRoom });

            gameManager.emitRoomUpdate(result.room.code);
        }
    });

    socket.on('startGame', (roomCode) => {
        const result = gameManager.startGame(roomCode);
        if (result.error) {
            // Handle error?
            console.error(result.error);
        } else {
            gameManager.emitRoomUpdate(roomCode);
        }
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

    socket.on('resetGame', (data) => {
        // Handle both old format (string roomCode) and new format (object)
        if (typeof data === 'string') {
            gameManager.resetGame(data);
        } else {
            gameManager.resetGame(data.roomCode, data.settings);
        }
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
