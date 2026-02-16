const SESSION_KEY = 'digital-insider.session';

export function getSavedSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);

        if (!parsed || !parsed.roomCode || !parsed.sessionToken || !parsed.playerId || !parsed.playerName) {
            return null;
        }

        return parsed;
    } catch {
        return null;
    }
}

export function saveSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}
