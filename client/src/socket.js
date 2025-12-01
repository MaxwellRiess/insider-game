import { io } from 'socket.io-client';

// For local development, assume server is on port 3001
// In production, this would be the same origin or configured env var
const URL = 'http://localhost:3001';

export const socket = io(URL, {
    autoConnect: true
});
