export type SessionMode = 'open' | 'closed';
export type SessionStatus = 'active' | 'ended';
export type ParticipantRole = 'voter' | 'observer';

export interface Participant {
  role: ParticipantRole;
}

export interface Task {
  id: string;
  title: string;
  votes: Record<string, string>;
  finalEstimate?: string | null;
}

export type VotingStatus = 'idle' | 'open' | 'closed' | 'revealed';

export interface VotingState {
  status: VotingStatus;
  endsAt: number | null;
}

export interface SessionState {
  sessionId: string;
  createdAt: string;
  updatedAt: number;
  host: {
    name: string;
    hostToken: string;
  };
  sessionMode: SessionMode;
  status: SessionStatus;
  participants: Record<string, Participant>;
  joinRequests: Record<string, Participant>;
  tasks: Task[];
  activeTaskId: string | null;
  voting: VotingState;
}

export interface BaseAction {
  actor?: string;
  hostToken?: string;
}

export type Action =
  | (BaseAction & { type: 'join'; name: string; role: ParticipantRole })
  | (BaseAction & { type: 'approve_join'; name: string })
  | (BaseAction & { type: 'reject_join'; name: string })
  | (BaseAction & { type: 'add_task'; title: string })
  | (BaseAction & { type: 'select_task'; taskId: string })
  | (BaseAction & { type: 'cast_vote'; value: string })
  | (BaseAction & { type: 'start_voting'; durationSeconds: number })
  | (BaseAction & { type: 'close_voting' })
  | (BaseAction & { type: 'reveal' })
  | (BaseAction & { type: 'add_time'; seconds: number })
  | (BaseAction & { type: 'clear_votes' })
  | (BaseAction & { type: 'set_final_estimate'; taskId: string; estimate: string })
  | (BaseAction & { type: 'set_role'; name: string; role: ParticipantRole })
  | (BaseAction & { type: 'kick'; name: string })
  | (BaseAction & { type: 'transfer_host'; name: string })
  | (BaseAction & { type: 'end_session' });

export interface SessionResponse {
  session: SessionState;
  hostToken?: string;
}
