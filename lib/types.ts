// Re-export all types from worker to avoid duplication
export type {
  SessionMode,
  SessionStatus,
  ParticipantRole,
  Participant,
  Task,
  VotingStatus,
  VotingState,
  SessionState,
  BaseAction,
  Action,
  SessionResponse
} from '../worker/src/types';
