const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Origins allowed to talk to the server cross-origin. In production the
// client is served from this server, so only its own origin is needed.
// Render sets RENDER and RENDER_EXTERNAL_URL. CLIENT_ORIGIN (comma
// separated) adds others, such as a custom domain.
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const isDev = !process.env.RENDER && process.env.NODE_ENV !== 'production';
const allowedOrigins = [
    process.env.RENDER_EXTERNAL_URL,
    ...(process.env.CLIENT_ORIGIN || '').split(','),
    ...(isDev ? DEV_ORIGINS : [])
].map(origin => origin?.trim().replace(/\/$/, '')).filter(Boolean);

// The cors option only sets response headers, and browsers do not apply
// CORS to WebSockets, so check the Origin header on every request too.
// Requests with no Origin (same-origin polling, non-browser clients) and
// same-origin requests are always let through.
function isAllowedOrigin(origin, host) {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}

const app = express();
app.use(cors({ origin: allowedOrigins }));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    },
    allowRequest: (req, callback) => {
        callback(null, isAllowedOrigin(req.headers.origin, req.headers.host));
    },
    // Game payloads are tiny. Reject anything large.
    maxHttpBufferSize: 10 * 1024
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

const MAX_TOKEN_LENGTH = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_CREATES_PER_WINDOW = 5;
const MAX_JOINS_PER_WINDOW = 10;
const RATE_LIMIT_ERROR = 'Too many attempts. Wait a minute and try again.';

// Returns a function that allows `limit` calls in any rolling window.
function createRateLimiter(limit, windowMs) {
    let hits = [];
    return () => {
        const now = Date.now();
        hits = hits.filter(time => now - time < windowMs);
        if (hits.length >= limit) return false;
        hits.push(now);
        return true;
    };
}

// Returns an upper-case room code, or null if the value is not a valid code.
function readRoomCode(value) {
    if (typeof value !== 'string') return null;
    const code = value.trim().toUpperCase();
    return /^[A-Z]{4}$/.test(code) ? code : null;
}

function readString(value, maxLength) {
    if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return null;
    return value;
}

function readSettings(value) {
    return value && typeof value === 'object' ? value : {};
}

// Accepts either a bare room code string or { roomCode, settings }.
function readRoomRequest(data) {
    if (typeof data === 'string') return { roomCode: readRoomCode(data), settings: {} };
    return { roomCode: readRoomCode(data?.roomCode), settings: readSettings(data?.settings) };
}

// Registers a handler that always gets a callable ack and never lets a
// thrown error escape and crash the process.
function handle(socket, event, handler) {
    socket.on(event, (...args) => {
        const lastArg = args[args.length - 1];
        const rawCallback = typeof lastArg === 'function' ? args.pop() : null;
        let acked = false;
        const callback = (response) => {
            if (acked || !rawCallback) return;
            acked = true;
            rawCallback(response);
        };

        try {
            handler(args[0], callback);
        } catch (err) {
            console.error(`Error handling ${event} from ${socket.id}:`, err);
            callback({ error: 'Something went wrong' });
        }
    });
}

function joinResponse(result) {
    return {
        room: gameManager.getSanitizedRoom(result.room, result.player.id),
        playerId: result.player.id,
        playerName: result.player.name,
        sessionToken: result.player.sessionToken
    };
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Limits are per socket. Every attempt counts, including invalid ones,
    // so room codes cannot be guessed quickly.
    const allowCreate = createRateLimiter(MAX_CREATES_PER_WINDOW, RATE_LIMIT_WINDOW_MS);
    const allowJoin = createRateLimiter(MAX_JOINS_PER_WINDOW, RATE_LIMIT_WINDOW_MS);

    // A socket belongs to at most one player. Release any earlier seat
    // before it takes a new one.
    const releaseCurrentSeat = () => {
        const result = gameManager.removePlayer(socket.id);
        if (result) {
            socket.leave(result.roomCode);
            gameManager.emitRoomUpdate(result.roomCode);
        }
    };

    handle(socket, 'createRoom', (data, callback) => {
        if (!allowCreate()) {
            callback({ error: RATE_LIMIT_ERROR });
            return;
        }

        const playerName = gameManager.normaliseName(data?.playerName);
        if (!playerName) {
            callback({ error: 'Name must be 1 to 20 characters' });
            return;
        }

        releaseCurrentSeat();
        const room = gameManager.createRoom(readSettings(data?.settings));
        const result = gameManager.joinRoom(socket.id, room.code, playerName);
        if (result.error) {
            gameManager.destroyRoom(room.code);
            callback({ error: result.error });
            return;
        }

        socket.join(room.code);
        callback(joinResponse(result));
        gameManager.emitRoomUpdate(room.code);
    });

    handle(socket, 'joinRoom', (data, callback) => {
        if (!allowJoin()) {
            callback({ error: RATE_LIMIT_ERROR });
            return;
        }

        const roomCode = readRoomCode(data?.roomCode);
        if (!roomCode) {
            callback({ error: 'Room code must be 4 letters' });
            return;
        }

        const existing = gameManager.findPlayerBySocketId(socket.id);
        if (existing?.room.code === roomCode) {
            callback({ error: 'You are already in this room' });
            return;
        }

        const result = gameManager.joinRoom(socket.id, roomCode, data?.playerName);
        if (result.error) {
            callback({ error: result.error });
            return;
        }

        if (existing) {
            gameManager.disconnectPlayer(existing.room, existing.player);
            socket.leave(existing.room.code);
            gameManager.emitRoomUpdate(existing.room.code);
        }

        socket.join(result.room.code);
        callback(joinResponse(result));
        gameManager.emitRoomUpdate(result.room.code);
    });

    handle(socket, 'resumeSession', (data, callback) => {
        const roomCode = readRoomCode(data?.roomCode);
        const sessionToken = readString(data?.sessionToken, MAX_TOKEN_LENGTH);
        if (!roomCode || !sessionToken) {
            callback({ error: 'Missing resume credentials' });
            return;
        }

        const existing = gameManager.findPlayerBySocketId(socket.id);
        if (existing && existing.player.sessionToken !== sessionToken) {
            releaseCurrentSeat();
        }

        const result = gameManager.resumeSession(roomCode, sessionToken, socket.id);
        if (result.error) {
            callback({ error: result.error });
            return;
        }

        socket.join(result.room.code);
        callback(joinResponse(result));
        gameManager.emitRoomUpdate(result.room.code);
    });

    handle(socket, 'startGame', (data, callback) => {
        const { roomCode, settings } = readRoomRequest(data);
        if (!roomCode) {
            callback({ error: 'Missing room code' });
            return;
        }

        if (!gameManager.isHostSocketForRoom(socket.id, roomCode)) {
            callback({ error: 'Only the host can start the game' });
            return;
        }

        const result = gameManager.startGame(roomCode, settings);
        if (result.error) {
            callback({ error: result.error });
            return;
        }

        gameManager.emitRoomUpdate(roomCode);
        callback({ ok: true });
    });

    handle(socket, 'beginRound', (data, callback) => {
        const roomCode = readRoomCode(data);
        if (!roomCode) {
            callback({ error: 'Missing room code' });
            return;
        }

        const result = gameManager.beginRound(roomCode, socket.id);
        callback(result.error ? { error: result.error } : { ok: true });
    });

    handle(socket, 'submitAnswer', (data, callback) => {
        const roomCode = readRoomCode(data?.roomCode);
        if (!roomCode) {
            callback({ error: 'Missing room code' });
            return;
        }

        callback(gameManager.submitAnswer(roomCode, socket.id, data?.answer));
    });

    handle(socket, 'triggerCorrect', (data, callback) => {
        const roomCode = readRoomCode(data);
        if (!roomCode) {
            callback({ error: 'Missing room code' });
            return;
        }

        callback(gameManager.triggerCorrectAnswer(roomCode, socket.id));
    });

    handle(socket, 'submitVote', (data, callback) => {
        const roomCode = readRoomCode(data?.roomCode);
        const suspectId = readString(data?.suspectId, MAX_TOKEN_LENGTH);
        if (!roomCode || !suspectId) {
            callback({ error: 'Missing room code or suspect' });
            return;
        }

        callback(gameManager.submitVote(roomCode, socket.id, suspectId));
    });

    handle(socket, 'resetGame', (data, callback) => {
        const { roomCode, settings } = readRoomRequest(data);
        if (!roomCode) {
            callback({ error: 'Missing room code' });
            return;
        }

        if (!gameManager.isHostSocketForRoom(socket.id, roomCode)) {
            callback({ error: 'Only the host can reset the room' });
            return;
        }

        gameManager.resetGame(roomCode, settings);
        callback({ ok: true });
    });

    handle(socket, 'leaveRoom', (data, callback) => {
        const roomCode = readRoomCode(data);
        if (!roomCode) {
            callback({ error: 'Missing room code' });
            return;
        }

        const result = gameManager.leaveRoom(socket.id, roomCode);
        if (!result.error) socket.leave(roomCode);
        callback(result);
    });

    handle(socket, 'closeRoom', (data, callback) => {
        const roomCode = readRoomCode(data);
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
        io.in(result.roomCode).socketsLeave(result.roomCode);

        callback({ ok: true });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        try {
            const result = gameManager.removePlayer(socket.id);
            if (result) {
                gameManager.emitRoomUpdate(result.roomCode);
            }
        } catch (err) {
            console.error(`Error handling disconnect from ${socket.id}:`, err);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
