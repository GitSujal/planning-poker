'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Action, ParticipantRole, SessionState } from '@/lib/types';
import { calculateStats, formatDistribution } from '@/lib/session';
import { getHostToken, setHostToken } from '@/lib/cookies';
import { storage } from '@/lib/storage';
import QRCode from 'qrcode';
import { VotingGrid } from '@/components/voting/VotingGrid';
import { TaskDialog } from '@/components/session/TaskDialog';
import { SessionQR } from '@/components/shared/SessionQR';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSocket } from '@/lib/useSocket';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const deck = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕'];

function saveIdentity(name: string, role: ParticipantRole) {
  storage.setItem('displayName', name);
  storage.setItem('role', role);
}

type Tab = 'tasks' | 'people' | 'settings';
type MobileView = 'stage' | 'tabs';

function SessionPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params?.id;

  // Data State
  const [session, setSession] = useState<SessionState | null>(null);
  const [optimisticSession, setOptimisticSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<ParticipantRole>('voter');
  const [joinError, setJoinError] = useState('');

  // UI State
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const [mobileView, setMobileView] = useState<MobileView>('stage');
  const [duration, setDuration] = useState(120);
  const [theme, setTheme] = useState('dark');
  const [showQR, setShowQR] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Optimistic update timeout ref
  const optimisticTimeoutRef = useRef<NodeJS.Timeout>();

  // Load saved identity
  useEffect(() => {
    const stored = storage.getItem('displayName');
    const storedRole = (storage.getItem('role') as ParticipantRole) || 'voter';
    const storedTheme = storage.getItem('theme');
    if (stored) setDisplayName(stored);
    if (storedRole) setRole(storedRole);
    if (storedTheme) setTheme(storedTheme);
  }, []);

  // Theme management
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    storage.setItem('theme', theme);
  }, [theme]);

  // Host token persistence
  useEffect(() => {
    if (session && session.host.name === displayName) {
      setHostToken(session.host.hostToken);
    }
  }, [session, displayName]);

  // QR Code generation
  useEffect(() => {
    if (showQR && qrCanvasRef.current && sessionId) {
      const joinUrl = `${window.location.origin}/session/${sessionId}`;
      QRCode.toCanvas(qrCanvasRef.current, joinUrl, { width: 220, margin: 2 }, (error) => {
        if (error) console.error('QR error:', error);
      });
    }
  }, [showQR, sessionId]);

  // WebSocket connection with improved error handling
  const { isConnected, isConnecting, send, error: wsError } = useSocket<SessionState>(
    sessionId as string,
    useCallback((data) => {
      if (data && typeof data === 'object' && 'sessionId' in data) {
        setSession(data);
        setOptimisticSession(null); // Clear optimistic state when real update arrives
        setLoading(false);
        setError('');
      }
    }, [])
  );

  // Display offline/error status
  useEffect(() => {
    if (wsError) {
      setError(wsError);
    }
  }, [wsError]);

  // Clear optimistic updates if they take too long (fallback)
  useEffect(() => {
    if (optimisticSession) {
      optimisticTimeoutRef.current = setTimeout(() => {
        console.warn('Optimistic update timeout, clearing');
        setOptimisticSession(null);
      }, 5000);
    }

    return () => {
      if (optimisticTimeoutRef.current) {
        clearTimeout(optimisticTimeoutRef.current);
      }
    };
  }, [optimisticSession]);

  // Optimistic update helper
  const applyOptimisticUpdate = useCallback((updater: (s: SessionState) => SessionState) => {
    setSession(current => {
      if (!current) return current;
      const updated = updater(current);
      setOptimisticSession(updated);
      return current; // Keep original until server confirms
    });
  }, []);

  // Send action with optimistic updates
  const sendAction = useCallback(async (action: Action, optimisticUpdater?: (s: SessionState) => SessionState) => {
    if (!isConnected) {
      setJoinError('Disconnected from server. Reconnecting...');
      return;
    }

    const hostToken = getHostToken();
    const payload = { ...action, actor: displayName, hostToken: hostToken || undefined };

    // Apply optimistic update if provided
    if (optimisticUpdater && session) {
      applyOptimisticUpdate(optimisticUpdater);
    }

    send(payload);
  }, [isConnected, displayName, send, session, applyOptimisticUpdate]);

  const joinSession = async () => {
    setJoinError('');
    try {
      await sendAction({ type: 'join', name: displayName, role });
      saveIdentity(displayName, role);
    } catch (e: any) {
      setJoinError(e.message);
    }
  };

  const exportCsv = () => {
    if (!session) return;
    const rows = [['Task Title', 'Final Estimate', 'Average', 'Median', 'Vote Distribution']];
    session.tasks.forEach((task) => {
      const stats = calculateStats(task.votes);
      const dist = JSON.stringify(formatDistribution(task.votes));
      rows.push([
        task.title,
        task.finalEstimate ?? '',
        String(stats.average ?? ''),
        String(stats.median ?? ''),
        dist
      ]);
    });
    const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vibeplanningpoker_${session.sessionId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Derived state - use optimistic session if available
  const displaySession = optimisticSession || session;
  const isHost = displaySession && getHostToken() === displaySession.host.hostToken;
  const activeTask = displaySession?.tasks.find((t) => t.id === displaySession.activeTaskId) || null;
  const hasJoined = displaySession && !!displaySession.participants[displayName];
  const pendingApproval = displaySession && !!displaySession.joinRequests[displayName];

  const votingEndsIn = useMemo(() => {
    if (!displaySession?.voting.endsAt) return null;
    return Math.max(0, displaySession.voting.endsAt - Math.floor(Date.now() / 1000));
  }, [displaySession?.voting.endsAt]);

  const voteValue = displaySession && displayName
    ? displaySession.tasks.find((t) => t.id === displaySession.activeTaskId)?.votes?.[displayName]
    : undefined;

  const activeStats = useMemo(() => {
    if (!activeTask) return { average: null as number | null, median: null as number | null };
    return calculateStats(activeTask.votes);
  }, [activeTask]);

  // Connection status indicator
  const ConnectionStatus = () => {
    if (isConnecting) {
      return (
        <div className="fixed top-4 right-4 z-50 px-3 py-2 bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm flex items-center gap-2">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
          Connecting...
        </div>
      );
    }

    if (!isConnected) {
      return (
        <div className="fixed top-4 right-4 z-50 px-3 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <div className="w-2 h-2 bg-red-400 rounded-full"></div>
          Disconnected - Reconnecting...
        </div>
      );
    }

    return null;
  };

  // Render helpers
  if (loading && !displaySession) {
    return (
      <div className="flex-center min-h-screen bg-[var(--bg-app)]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted">Loading Session...</p>
        </div>
      </div>
    );
  }

  if (error && !displaySession) {
    return (
      <div className="flex-center min-h-screen p-6 bg-[var(--bg-app)]">
        <div className="card max-w-md w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-4">Connection Error</h1>
          <p className="text-muted mb-6">{error}</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary w-full">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!displaySession) {
    return (
      <div className="flex-center min-h-screen bg-[var(--bg-app)]">
        <div className="card max-w-md w-full text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-4">Session not found</h1>
          <p className="text-muted mb-6">The session you're looking for doesn't exist or has expired.</p>
          <button onClick={() => router.push('/')} className="btn btn-primary w-full">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (displaySession.status === 'ended') {
    return (
      <div className="flex-center min-h-screen bg-[var(--bg-app)]">
        <div className="card max-w-md w-full text-center">
          <div className="text-6xl mb-4">👋</div>
          <h1 className="text-2xl font-bold mb-4">Session Ended</h1>
          <p className="text-muted mb-6">This planning poker session has been ended by the host.</p>
          <button onClick={() => router.push('/')} className="btn btn-primary w-full">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const renderJoinScreen = () => (
    <div className="flex-center min-h-screen p-4 bg-[var(--bg-app)]">
      <div className="card w-full max-w-md animate-fade-in shadow-xl">
        <h2 className="text-2xl font-bold mb-4 text-center">Join Session</h2>
        <div className="flex flex-col gap-4">
          <div>
            <label>Display Name</label>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alice"
              autoFocus
              maxLength={50}
            />
          </div>
          <div>
            <label>Role</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`btn ${role === 'voter' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRole('voter')}
              >
                Voter
              </button>
              <button
                className={`btn ${role === 'observer' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRole('observer')}
              >
                Observer
              </button>
            </div>
          </div>
          {joinError && (
            <div className="text-sm p-2 bg-red-500/10 text-red-400 rounded border border-red-500/20">
              {joinError}
            </div>
          )}
          <button
            disabled={!displayName || !isConnected}
            onClick={joinSession}
            className="btn btn-primary w-full py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnected ? 'Enter Room' : 'Connecting...'}
          </button>
        </div>
      </div>
    </div>
  );

  if (!hasJoined && !pendingApproval) return renderJoinScreen();

  if (pendingApproval) {
    return (
      <div className="flex-center min-h-screen bg-[var(--bg-app)]">
        <div className="card max-w-md w-full text-center">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex-center mx-auto mb-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Waiting for Approval</h2>
          <p className="text-muted">The host will approve your request to join shortly.</p>
        </div>
      </div>
    );
  }

  // Main UI components
  const renderSidebarContent = () => (
    <>
      <div className="h-16 flex items-center px-4 border-b border-[var(--border-color)] shrink-0">
        <span className="font-bold text-lg bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
          VibePoker
        </span>
        <span className="mx-2 text-[var(--border-color)]">|</span>
        <span className="text-sm text-muted font-mono">#{sessionId}</span>
      </div>

      <div className="flex border-b border-border shrink-0">
        {(['tasks', 'people', 'settings'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            {tab === 'tasks' && '📋'} {tab === 'people' && '👥'} {tab === 'settings' && '⚙️'} {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 content-area">
        {activeTab === 'tasks' && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs uppercase tracking-wider text-muted font-bold">
                Queue ({displaySession?.tasks.length})
              </h2>
            </div>
            {displaySession?.tasks.length === 0 && (
              <p className="text-muted italic text-center py-4 text-sm">No tasks yet.</p>
            )}
            {displaySession?.tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => isHost && sendAction({ type: 'select_task', taskId: task.id })}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  task.id === displaySession?.activeTaskId
                    ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/5'
                    : 'border-[var(--border-color)] bg-[var(--bg-card)]'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span
                    className={`font-medium text-sm ${
                      task.id === displaySession?.activeTaskId ? 'text-[var(--accent-hover)]' : ''
                    }`}
                  >
                    {task.title}
                  </span>
                  {task.id === displaySession?.activeTaskId && (
                    <span className="text-[10px] bg-[var(--accent-color)] text-white px-1.5 py-0.5 rounded ml-2">
                      ACTIVE
                    </span>
                  )}
                </div>
                {(task.finalEstimate || Object.keys(task.votes).length > 0) && (
                  <div className="flex gap-2 text-xs text-muted mt-1">
                    {task.finalEstimate ? (
                      <span className="text-green-400 font-bold">Est: {task.finalEstimate}</span>
                    ) : (
                      <span>{Object.keys(task.votes).length} votes</span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(isHost || displaySession?.sessionMode === 'open') && (
              <div className="mt-4">
                <TaskDialog onAddTask={(title) => sendAction({ type: 'add_task', title })} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'people' && (
          <div className="space-y-2 animate-fade-in">
            <h2 className="text-xs uppercase tracking-wider text-muted font-bold mb-2">
              Participants ({Object.keys(displaySession?.participants || {}).length})
            </h2>
            {Object.entries(displaySession?.participants || {}).map(([name, p]) => {
              const hasVoted = activeTask && activeTask.votes[name] !== undefined;
              return (
                <div
                  key={name}
                  className="flex justify-between items-center p-2 rounded bg-[var(--bg-card)] border border-[var(--border-color)]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex-center text-xs font-bold text-white ${
                        name === displayName
                          ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500'
                          : 'bg-slate-600'
                      }`}
                    >
                      {name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className={`leading-tight text-sm ${name === displayName ? 'font-bold' : ''}`}>
                        {name}
                      </span>
                      <span className="text-[10px] text-muted capitalize">{p.role}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasVoted && (
                      <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">Voted</span>
                    )}
                    {isHost && name !== displayName && (
                      <div className="flex gap-1">
                        <button
                          className="text-muted hover:text-[var(--text-primary)]"
                          onClick={() =>
                            sendAction({
                              type: 'set_role',
                              name,
                              role: p.role === 'voter' ? 'observer' : 'voter'
                            })
                          }
                        >
                          {p.role === 'voter' ? '👁️' : '🗳️'}
                        </button>
                        <button
                          className="text-red-400 hover:text-red-300"
                          onClick={() => sendAction({ type: 'kick', name })}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6 animate-fade-in">
            <section>
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-3">
                Share Session
              </h2>
              <SessionQR sessionId={sessionId!} compact />
            </section>

            <section>
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-3">Controls</h2>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
                  {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
                </Button>
                {isHost && (
                  <Button variant="outline" size="sm" onClick={exportCsv}>
                    📄 Export CSV
                  </Button>
                )}
              </div>
            </section>

            {isHost && (
              <section className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <h2 className="text-sm font-bold text-destructive mb-3">Danger Zone</h2>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    if (confirm('End session? This cannot be undone.')) sendAction({ type: 'end_session' });
                  }}
                >
                  End Session
                </Button>
              </section>
            )}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-[var(--border-color)] flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex-center text-white font-bold">
          {displayName.charAt(0)}
        </div>
        <div className="flex flex-col">
          <span className="font-medium text-sm">{displayName}</span>
          <span className="text-xs text-muted capitalize">{role}</span>
        </div>
      </div>
    </>
  );

  const renderStage = () => (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 flex flex-col items-center">
      {/* Desktop QR Code Banner */}
      <div className="hidden lg:block w-full max-w-4xl mb-6">
        <SessionQR sessionId={sessionId!} />
      </div>

      <div className="w-full max-w-4xl space-y-8 pb-20 md:pb-0">
        {!activeTask ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-fade-in">
            <div className="w-20 h-20 bg-card rounded-full flex items-center justify-center mb-6 text-4xl border border-border">
              🎲
            </div>
            <h2 className="text-2xl font-bold mb-2">Ready to Estimate</h2>
            <p>Select a task from the sidebar to start.</p>
          </div>
        ) : (
          <div className="animate-fade-in text-center">
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 text-violet-400 text-xs font-bold uppercase tracking-wider mb-4 border border-violet-500/20">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse"></span>
                Voting {displaySession?.voting.status}
              </div>
              <h2 className="text-3xl md:text-5xl font-bold leading-tight mb-6">{activeTask.title}</h2>
              <div className="flex flex-col items-center gap-4">
                {displaySession?.voting.status === 'open' && (
                  <div className="font-mono text-3xl md:text-4xl font-bold text-[var(--accent-color)]">
                    {votingEndsIn !== null ? (
                      <span>
                        {Math.floor(votingEndsIn / 60)}:{(votingEndsIn % 60).toString().padStart(2, '0')}
                      </span>
                    ) : (
                      '--:--'
                    )}
                  </div>
                )}
                {isHost && (
                  <div className="flex flex-wrap justify-center gap-3 p-2 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-color)] shadow-lg">
                    {displaySession?.voting.status !== 'open' ? (
                      <>
                        <input
                          type="number"
                          value={duration}
                          onChange={(e) => setDuration(Number(e.target.value))}
                          className="input w-16 text-center py-2 h-10 font-mono"
                          min={10}
                          max={3600}
                        />
                        <button
                          onClick={() => sendAction({ type: 'start_voting', durationSeconds: duration })}
                          className="btn btn-primary px-4"
                        >
                          Start
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => sendAction({ type: 'reveal' })} className="btn btn-primary px-4">
                          Reveal
                        </button>
                        <button
                          onClick={() => sendAction({ type: 'add_time', seconds: 30 })}
                          className="btn btn-secondary px-3"
                        >
                          +30s
                        </button>
                        <button
                          onClick={() => sendAction({ type: 'close_voting' })}
                          className="btn btn-ghost text-red-400 px-3"
                        >
                          Stop
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => sendAction({ type: 'clear_votes' })}
                      className="btn btn-ghost px-3 text-muted"
                      title="Reset"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>
            </div>

            {displaySession?.voting.status !== 'revealed' && (
              <VotingGrid
                deck={deck}
                selectedValue={voteValue}
                role={role}
                votingStatus={displaySession?.voting.status || 'idle'}
                onVote={(value) =>
                  sendAction(
                    { type: 'cast_vote', value },
                    // Optimistic update for instant feedback
                    (s) => {
                      const task = s.tasks.find((t) => t.id === s.activeTaskId);
                      if (task && displayName) {
                        task.votes[displayName] = value;
                      }
                      return s;
                    }
                  )
                }
              />
            )}

            {displaySession?.voting.status === 'revealed' && (
              <div className="max-w-4xl mx-auto space-y-8 animate-fade-in px-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-color)] flex flex-col items-center">
                    <span className="text-xs uppercase text-muted font-bold">Average</span>
                    <span className="text-4xl font-bold text-[var(--accent-color)] mt-2">
                      {activeStats.average ?? '-'}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-color)] flex flex-col items-center">
                    <span className="text-xs uppercase text-muted font-bold">Median</span>
                    <span className="text-4xl font-bold text-fuchsia-400 mt-2">{activeStats.median ?? '-'}</span>
                  </div>
                  {isHost && (
                    <div className="col-span-2 p-4 rounded-2xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 flex flex-col justify-center">
                      <label className="text-xs uppercase text-violet-300 font-bold mb-2 text-left">
                        Final Decision
                      </label>
                      <div className="flex gap-2">
                        <input
                          className="input bg-[var(--bg-app)] border-violet-500/30 text-center font-bold"
                          placeholder="Value"
                          value={activeTask.finalEstimate ?? ''}
                          onChange={(e) =>
                            sendAction({
                              type: 'set_final_estimate',
                              taskId: activeTask.id,
                              estimate: e.target.value
                            })
                          }
                          maxLength={20}
                        />
                        <button
                          onClick={() => sendAction({ type: 'add_task', title: 'Next' })}
                          className="btn btn-primary whitespace-nowrap"
                        >
                          Next Task
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-6 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-color)] text-left">
                  <h3 className="font-bold text-muted mb-4 text-sm">Agreement Distribution</h3>
                  <div className="flex items-end h-24 gap-2">
                    {Object.entries(formatDistribution(activeTask.votes)).map(([val, count]) => {
                      const maxVotes = Math.max(...Object.values(formatDistribution(activeTask.votes)));
                      const heightPct = maxVotes ? (count / maxVotes) * 100 : 0;
                      return (
                        <div key={val} className="flex-1 flex flex-col items-center gap-2 group">
                          <div
                            className="w-full bg-[var(--bg-app)] rounded-t-lg relative flex items-end justify-center overflow-hidden"
                            style={{ height: '100%' }}
                          >
                            <div
                              className="w-full bg-violet-500/50 absolute bottom-0 transition-all duration-500"
                              style={{ height: `${heightPct}%` }}
                            ></div>
                            <span className="relative z-10 text-xs font-bold mb-1">{count > 0 ? count : ''}</span>
                          </div>
                          <span className="text-xs font-mono text-muted">{val}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {Object.entries(activeTask.votes).map(([voterName, val]) => (
                    <div
                      key={voterName}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)]"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex-center text-xs font-bold text-white shrink-0">
                        {voterName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col text-left overflow-hidden">
                        <span className="text-sm font-medium truncate w-full">{voterName}</span>
                        <span className="text-xs text-[var(--accent-color)] font-bold">{val}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden text-sm md:text-base bg-[var(--bg-app)]">
      <ConnectionStatus />

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-80 shrink-0 border-r border-[var(--border-color)] bg-[var(--bg-panel)] z-20">
        {renderSidebarContent()}
      </aside>

      {/* MAIN STAGE */}
      <main
        className={`flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-app)] relative ${
          mobileView === 'tabs' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Mobile Header */}
        <div className="md:hidden h-14 flex items-center justify-between px-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)] shrink-0">
          <span className="font-bold text-lg bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            VibePoker
          </span>
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="btn btn-icon btn-ghost"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>

        {/* QR Overlay */}
        {showQR && (
          <div
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex-center p-6"
            onClick={() => setShowQR(false)}
          >
            <div className="card bg-white text-black text-center max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-4 text-xl font-bold">Join Session</h3>
              <canvas ref={qrCanvasRef} className="rounded-lg mx-auto shadow-xl" />
              <div className="mt-4 p-3 bg-gray-100 rounded text-sm font-mono break-all select-all">
                {window.location.origin}/session/{sessionId}
              </div>
              <button className="btn btn-primary mt-6 w-full" onClick={() => setShowQR(false)}>
                Close
              </button>
            </div>
          </div>
        )}

        {renderStage()}
      </main>

      {/* MOBILE TABS VIEW */}
      {mobileView === 'tabs' && (
        <div className="md:hidden flex-1 flex flex-col bg-[var(--bg-panel)] z-10 w-full animate-fade-in">
          {renderSidebarContent()}
        </div>
      )}

      {/* BOTTOM NAV */}
      <nav className="md:hidden h-16 bg-card border-t border-border flex items-center justify-around z-50 shrink-0 shadow-lg">
        {([
          { view: 'stage', icon: '🎲', label: 'Stage' },
          { view: 'tabs', tab: 'tasks', icon: '📋', label: 'Tasks' },
          { view: 'tabs', tab: 'people', icon: '👥', label: 'People' },
          { view: 'tabs', tab: 'settings', icon: '⚙️', label: 'Menu' }
        ] as const).map((item) => (
          <button
            key={item.label}
            onClick={() => {
              setMobileView(item.view as MobileView);
              if (item.tab) setActiveTab(item.tab as Tab);
            }}
            className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-colors min-w-[60px] ${
              (mobileView === item.view && (!item.tab || activeTab === item.tab))
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-[10px] font-semibold">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// Wrap with error boundary
export default function SessionPage() {
  return (
    <ErrorBoundary>
      <SessionPageContent />
    </ErrorBoundary>
  );
}
