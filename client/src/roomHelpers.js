// Helpers that read the room payload. The server may send the full roles map
// or only the viewer's own role, so every lookup tolerates missing entries.

export function getRole(room, playerId) {
    if (!room || !playerId) return null;
    // Before the reveal the server only sends the viewer's own role.
    if (playerId === room.myId && room.myRole) return room.myRole;
    return room.roles?.[playerId] || null;
}

export function getMasterId(room) {
    if (!room) return null;
    if (room.masterId) return room.masterId;
    const roles = room.roles || {};
    return Object.keys(roles).find(id => roles[id] === 'MASTER') || null;
}

export function getVoterIds(room) {
    if (!room) return [];
    if (Array.isArray(room.votedPlayerIds)) return room.votedPlayerIds;
    return Object.keys(room.votes || {});
}

export function getPlayerName(room, playerId) {
    return room?.players.find(p => p.id === playerId)?.name || null;
}

export function getJoinLink(roomCode) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', roomCode);
    return url.toString();
}

// Reads the room code from an invite link or QR code (?room=ABCD).
export function getInviteRoomCode() {
    try {
        const code = new URLSearchParams(window.location.search).get('room');
        if (!code) return '';
        const cleaned = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
        return cleaned.length === 4 ? cleaned : '';
    } catch {
        return '';
    }
}

// The title card shown when the game moves into a new phase, so every
// player sees the change at the same moment. Results and time-outs run
// their own reveal, so they have no curtain.
export function getPhaseCurtain(fromState, toState, room) {
    if (toState === 'ROLE_REVEAL') {
        return { title: 'NEW ROUND', subtitle: 'ROLES ARE BEING DEALT' };
    }
    if (toState === 'QUIZ') {
        const minutes = Math.round((room?.settings?.timerDuration || 300) / 60);
        return { title: 'START ASKING', subtitle: `${minutes} ${minutes === 1 ? 'MINUTE' : 'MINUTES'} ON THE CLOCK` };
    }
    if (fromState === 'QUIZ' && toState === 'VOTING') {
        return { title: 'WORD FOUND', subtitle: 'NOW FIND THE INSIDER' };
    }
    return null;
}

export const MIN_PLAYERS = 4;

const ROLE_LABELS = {
    MASTER: 'MASTER',
    INSIDER: 'INSIDER',
    COMMON: 'COMMONER'
};

export function getRoleLabel(role) {
    return ROLE_LABELS[role] || 'UNKNOWN';
}
