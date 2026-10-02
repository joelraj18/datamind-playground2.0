// Thin wrapper around localStorage. All data stays in this browser.

const USERS_KEY = 'datamind_users';
const SESSION_KEY = 'datamind_current_user';
const datasetsKey = (email) => `datamind_${email}_data`;

const read = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

/** Returns true when written, false when the browser refused (usually quota exceeded). */
const write = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
};

const sameEmail = (a = '', b = '') => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Only the public profile is kept in the session, never the password. */
const publicProfile = ({ id, name, email }) => ({ id, name, email });

export function getSessionUser() {
    const user = read(SESSION_KEY, null);
    return user?.email ? publicProfile(user) : null;
}

export function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

export function register({ name, email, password }) {
    const users = read(USERS_KEY, []);
    if (users.some((u) => sameEmail(u.email, email))) {
        throw new Error('That email is already registered. Sign in instead.');
    }
    const user = { id: Date.now(), name, email, password };
    write(USERS_KEY, [...users, user]);
    write(SESSION_KEY, publicProfile(user));
    return publicProfile(user);
}

export function signIn({ email, password }) {
    const user = read(USERS_KEY, []).find((u) => sameEmail(u.email, email) && u.password === password);
    if (!user) throw new Error('Incorrect email or password.');
    write(SESSION_KEY, publicProfile(user));
    return publicProfile(user);
}

export const loadDatasets = (email) => read(datasetsKey(email), []);

/** Persists datasets; returns false if they were too large to save. */
export const saveDatasets = (email, datasets) => write(datasetsKey(email), datasets);
