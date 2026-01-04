import { Action, Participant, SessionState, VotingState } from './types';

const initialVotingState: VotingState = { status: 'idle', endsAt: null };

const deckValues = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕'];

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function cloneSession(session: SessionState): SessionState {
  return JSON.parse(JSON.stringify(session));
}

function ensureTask(session: SessionState) {
  if (!session.tasks.length) {
    const taskId = `task-${Date.now()}`;
    session.tasks.push({ id: taskId, title: 'New Task', votes: {}, finalEstimate: null });
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
      if (next.participants[action.name]) {
        return next;
      }
      if (next.sessionMode === 'closed' && !requireHost(next, action)) {
        next.joinRequests[action.name] = { role: action.role };
        return next;
      }
      next.participants[action.name] = { role: action.role };
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
      // In open sessions, any participant can add tasks. In closed sessions, only host can.
      if (next.sessionMode === 'closed' && !requireHost(next, action)) return next;
      // Verify actor is a participant
      if (!action.actor || !next.participants[action.actor]) return next;
      const id = `task-${Date.now()}`;
      next.tasks.push({ id, title: action.title, votes: {}, finalEstimate: null });
      if (!next.activeTaskId) next.activeTaskId = id;
      return next;
    }
    case 'select_task': {
      if (!requireHost(next, action)) return next;
      next.activeTaskId = action.taskId;
      next.voting = { ...initialVotingState };
      return next;
    }
    case 'cast_vote': {
      if (!next.activeTaskId || next.status === 'ended') return next;
      if (next.voting.status !== 'open') return next;
      const activeTask = next.tasks.find((t) => t.id === next.activeTaskId);
      if (!activeTask) return next;
      if (!next.participants[action.actor || '']) return next;
      activeTask.votes[action.actor!] = deckValues.includes(action.value) ? action.value : action.value;
      return next;
    }
    case 'start_voting': {
      if (!requireHost(next, action)) return next;
      const endsAt = nowSeconds() + action.durationSeconds;
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
      if (task) task.finalEstimate = action.estimate;
      return next;
    }
    case 'set_role': {
      if (!requireHost(next, action)) return next;
      if (next.participants[action.name]) {
        next.participants[action.name].role = action.role;
      }
      return next;
    }
    case 'kick': {
      if (!requireHost(next, action)) return next;
      delete next.participants[action.name];
      Object.values(next.tasks).forEach((task) => {
        delete (task as any).votes?.[action.name];
      });
      return next;
    }
    case 'transfer_host': {
      if (!requireHost(next, action)) return next;
      if (!next.participants[action.name]) return next;
      next.host = { name: action.name, hostToken: `host-${Date.now()}` };
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
  const now = nowSeconds();
  return {
    sessionId,
    createdAt: new Date().toISOString(),
    updatedAt: now,
    host: {
      name: hostName,
      hostToken: `host-${sessionId}-${now}`
    },
    sessionMode,
    status: 'active',
    participants: { [hostName]: { role: 'voter' as const } },
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
  const median = sorted.length % 2 === 0 ? Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2)) : sorted[mid];
  return { average, median };
}

export function formatDistribution(votes: Record<string, string>) {
  const dist: Record<string, number> = {};
  Object.values(votes).forEach((v) => {
    dist[v] = (dist[v] || 0) + 1;
  });
  return dist;
}
