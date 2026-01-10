import { Action, Participant, SessionState, VotingState } from './types';

const initialVotingState: VotingState = { status: 'idle', endsAt: null };

const deckValues = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕'];

// Security: Maximum lengths to prevent abuse
const MAX_NAME_LENGTH = 50;
const MAX_TASK_TITLE_LENGTH = 200;
const MAX_TASKS_PER_SESSION = 100;
const MAX_PARTICIPANTS = 50;

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

/**
 * Generate cryptographically secure random token
 */
export function generateSecureToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate cryptographically secure session ID
 */
export function generateSessionId(): string {
    return crypto.randomUUID().split('-')[0]; // 8 chars, URL-friendly
}

/**
 * Sanitize user input to prevent XSS
 */
function sanitizeString(input: string, maxLength: number): string {
    return input
        .trim()
        .slice(0, maxLength)
        .replace(/[<>]/g, ''); // Remove potential HTML tags
}

/**
 * Validate display name
 */
function isValidName(name: string): boolean {
    if (!name || typeof name !== 'string') return false;
    const sanitized = sanitizeString(name, MAX_NAME_LENGTH);
    return sanitized.length >= 1 && sanitized.length <= MAX_NAME_LENGTH;
}

/**
 * Validate task title
 */
function isValidTaskTitle(title: string): boolean {
    if (!title || typeof title !== 'string') return false;
    const sanitized = sanitizeString(title, MAX_TASK_TITLE_LENGTH);
    return sanitized.length >= 1 && sanitized.length <= MAX_TASK_TITLE_LENGTH;
}

function cloneSession(session: SessionState): SessionState {
    return JSON.parse(JSON.stringify(session));
}

function ensureTask(session: SessionState) {
    if (!session.tasks.length) {
        const taskId = `task-${Date.now()}`;
        session.tasks.push({ id: taskId, title: 'New Task', description: '', votes: {}, finalEstimate: null });
        session.activeTaskId = taskId;
    }
}

function requireHost(session: SessionState, action: Action) {
    return action.hostToken && action.hostToken === session.host.hostToken;
}

export function applyAction(session: SessionState, action: Action): SessionState {
    const next = cloneSession(session);
    next.updatedAt = nowSeconds();

    switch (action.type) {
        case 'join': {
            // Validate name
            if (!isValidName(action.name)) {
                console.warn('Invalid join name:', action.name);
                return next;
            }

            const sanitizedName = sanitizeString(action.name, MAX_NAME_LENGTH);

            // Check if already joined
            if (next.participants[sanitizedName]) {
                return next;
            }

            // Check max participants
            if (Object.keys(next.participants).length >= MAX_PARTICIPANTS) {
                console.warn('Max participants reached');
                return next;
            }

            if (next.sessionMode === 'closed' && !requireHost(next, action)) {
                next.joinRequests[sanitizedName] = { role: action.role };
                return next;
            }
            next.participants[sanitizedName] = { role: action.role };
            return next;
        }

        case 'approve_join': {
            if (!requireHost(next, action)) return next;
            const req = next.joinRequests[action.name];
            if (req) {
                next.participants[action.name] = req;
                delete next.joinRequests[action.name];
            }
            return next;
        }

        case 'reject_join': {
            if (!requireHost(next, action)) return next;
            delete next.joinRequests[action.name];
            return next;
        }

        case 'add_task': {
            // Validate title
            if (!isValidTaskTitle(action.title)) {
                console.warn('Invalid task title:', action.title);
                return next;
            }

            // Check max tasks
            if (next.tasks.length >= MAX_TASKS_PER_SESSION) {
                console.warn('Max tasks reached');
                return next;
            }

            // In open sessions, any participant can add tasks. In closed sessions, only host can.
            if (next.sessionMode === 'closed' && !requireHost(next, action)) return next;

            // Verify actor is a participant
            if (!action.actor || !next.participants[action.actor]) return next;

            const sanitizedTitle = sanitizeString(action.title, MAX_TASK_TITLE_LENGTH);
            const sanitizedDescription = action.description ? sanitizeString(action.description, 500) : undefined;
            const id = `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            next.tasks.push({ id, title: sanitizedTitle, description: sanitizedDescription, votes: {}, finalEstimate: null });
            if (!next.activeTaskId) next.activeTaskId = id;
            return next;
        }

        case 'select_task': {
            if (!requireHost(next, action)) return next;
            // Validate task exists
            if (!next.tasks.find(t => t.id === action.taskId)) return next;
            next.activeTaskId = action.taskId;
            next.voting = { ...initialVotingState };
            return next;
        }

        case 'cast_vote': {
            if (!next.activeTaskId || next.status === 'ended') return next;
            if (next.voting.status !== 'open') return next;

            const activeTask = next.tasks.find((t) => t.id === next.activeTaskId);
            if (!activeTask) return next;

            // Validate actor
            if (!action.actor || !next.participants[action.actor]) return next;

            // Validate participant is a voter
            if (next.participants[action.actor].role !== 'voter') return next;

            // Validate vote value
            if (!deckValues.includes(action.value)) {
                console.warn('Invalid vote value:', action.value);
                return next;
            }

            activeTask.votes[action.actor] = action.value;
            return next;
        }

        case 'start_voting': {
            if (!requireHost(next, action)) return next;

            // Validate duration (0 means unlimited)
            if (action.durationSeconds < 0 || action.durationSeconds > 3600) {
                console.warn('Invalid duration:', action.durationSeconds);
                return next;
            }

            const endsAt = action.durationSeconds === 0 ? null : nowSeconds() + action.durationSeconds;
            next.voting = { status: 'open', endsAt };
            ensureTask(next);
            const task = next.tasks.find((t) => t.id === next.activeTaskId);
            if (task) task.votes = {};
            return next;
        }

        case 'close_voting': {
            if (!requireHost(next, action)) return next;
            next.voting.status = 'closed';
            next.voting.endsAt = null;
            return next;
        }

        case 'reveal': {
            if (!requireHost(next, action)) return next;
            next.voting.status = 'revealed';
            next.voting.endsAt = null;
            return next;
        }

        case 'add_time': {
            if (!requireHost(next, action)) return next;

            // Validate seconds
            if (action.seconds < 10 || action.seconds > 300) {
                console.warn('Invalid time addition:', action.seconds);
                return next;
            }

            if (next.voting.status === 'open' && next.voting.endsAt) {
                next.voting.endsAt += action.seconds;
            }
            return next;
        }

        case 'clear_votes': {
            if (!requireHost(next, action)) return next;
            const task = next.tasks.find((t) => t.id === next.activeTaskId);
            if (task) task.votes = {};
            next.voting = { ...initialVotingState };
            return next;
        }

        case 'set_final_estimate': {
            if (!requireHost(next, action)) return next;
            const task = next.tasks.find((t) => t.id === action.taskId);
            if (!task) return next;

            // Sanitize estimate
            const sanitized = sanitizeString(action.estimate, 20);
            task.finalEstimate = sanitized;
            return next;
        }

        case 'set_role': {
            if (!requireHost(next, action)) return next;
            if (next.participants[action.name]) {
                next.participants[action.name].role = action.role;

                // If changed to observer, remove their votes
                if (action.role === 'observer') {
                    next.tasks.forEach((task) => {
                        delete task.votes[action.name];
                    });
                }
            }
            return next;
        }

        case 'kick': {
            if (!requireHost(next, action)) return next;

            // Can't kick yourself
            if (action.name === next.host.name) return next;

            delete next.participants[action.name];

            // Remove from all votes
            next.tasks.forEach((task) => {
                delete task.votes[action.name];
            });

            // Remove from join requests
            delete next.joinRequests[action.name];

            return next;
        }

        case 'transfer_host': {
            if (!requireHost(next, action)) return next;
            if (!next.participants[action.name]) return next;

            // Generate new secure token
            next.host = {
                name: action.name,
                hostToken: generateSecureToken()
            };
            return next;
        }

        case 'end_session': {
            if (!requireHost(next, action)) return next;
            next.status = 'ended';
            return next;
        }

        default:
            return next;
    }
}

export function createInitialSession(sessionId: string, hostName: string, sessionMode: 'open' | 'closed'): SessionState {
    // Validate and sanitize host name
    if (!isValidName(hostName)) {
        throw new Error('Invalid host name');
    }

    const sanitizedHostName = sanitizeString(hostName, MAX_NAME_LENGTH);
    const now = nowSeconds();

    return {
        sessionId,
        createdAt: new Date().toISOString(),
        updatedAt: now,
        host: {
            name: sanitizedHostName,
            hostToken: generateSecureToken()
        },
        sessionMode,
        status: 'active',
        participants: { [sanitizedHostName]: { role: 'voter' as const } },
        joinRequests: {},
        tasks: [],
        activeTaskId: null,
        voting: { ...initialVotingState }
    };
}

export function calculateStats(votes: Record<string, string>) {
    const numericVotes = Object.values(votes)
        .map((v) => Number(v))
        .filter((v) => !Number.isNaN(v));

    if (!numericVotes.length) {
        return { average: null as number | null, median: null as number | null };
    }

    const sum = numericVotes.reduce((a, b) => a + b, 0);
    const average = Number((sum / numericVotes.length).toFixed(2));
    const sorted = [...numericVotes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
        ? Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2))
        : sorted[mid];

    return { average, median };
}

export function formatDistribution(votes: Record<string, string>) {
    const dist: Record<string, number> = {};
    Object.values(votes).forEach((v) => {
        dist[v] = (dist[v] || 0) + 1;
    });
    return dist;
}

/**
 * Sanitize session state for transport, masking votes if not revealed.
 * Also masks hostToken for non-hosts.
 */
export function sanitizeSession(state: SessionState, clientName?: string): SessionState {
    const isHost = clientName === state.host.name;
    const isRevealed = state.voting.status === 'revealed' || state.status === 'ended';

    // Deep clone to avoid modifying original state
    const clean = JSON.parse(JSON.stringify(state));

    // NEVER mask host token if the current client is the host
    // or if we are in an initial connection context where the client might be the host
    if (!isHost && clientName !== undefined) {
        delete (clean.host as any).hostToken;
    }

    clean.tasks.forEach((task: any) => {
        const isTaskActive = task.id === state.activeTaskId;
        const taskHasVotes = Object.keys(task.votes).length > 0;

        // Reveal votes for a task if:
        // 1. Global status is revealed/ended
        // 2. It's a non-active task with votes (backlog history)
        // 3. It's the active task but voting is idle (we just navigated back to it or haven't started yet)
        const showVotesForThisTask = isRevealed || (!isTaskActive && taskHasVotes) || (isTaskActive && state.voting.status === 'idle' && taskHasVotes);

        const masked: Record<string, string> = {};
        Object.entries(task.votes).forEach(([name, value]) => {
            // Keep the vote if it's the client's own vote or if it's revealed for this task
            if (name === clientName || showVotesForThisTask) {
                masked[name] = value as string;
            } else {
                // Return a marker that they voted
                masked[name] = 'voted';
            }
        });
        task.votes = masked;
    });

    return clean;
}
