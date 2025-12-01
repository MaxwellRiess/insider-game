import { io } from 'socket.io-client';

// In production, undefined lets socket.io-client connect to the same origin
const URL = import.meta.env.PROD ? undefined : 'http://localhost:3001';

export const socket = io(URL, {
    autoConnect: true
});
