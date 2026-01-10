'use client';

export const dynamic = 'force-static';

import { useEffect, useMemo, useState, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Action, ParticipantRole, SessionState } from '@/lib/types';
import { calculateStats, formatDistribution } from '@/lib/session';
import { getHostToken, setHostToken } from '@/lib/cookies';
import { storage } from '@/lib/storage';
import QRCode from 'qrcode';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useSocket } from '@/lib/useSocket';

const deck = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕'];

function saveIdentity(name: string, role: ParticipantRole) {
  storage.setItem('displayName', name);
  storage.setItem('role', role);
}

function SessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('id');

  // Data State
  const [session, setSession] = useState<SessionState | null>(null);
  const [optimisticSession, setOptimisticSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<ParticipantRole>('voter');
  const [joinError, setJoinError] = useState('');

  // UI State
  const [localVote, setLocalVote] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // For mobile if needed
  const [pendingTasksLoaded, setPendingTasksLoaded] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);

  // Optimistic update timeout ref
  const optimisticTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Load saved identity
  useEffect(() => {
    const storedName = storage.getItem('displayName');
    const storedRole = (storage.getItem('role') as ParticipantRole) || 'voter';
    if (storedName) setDisplayName(storedName);
    if (storedRole) setRole(storedRole);
  }, []);

  // Host token persistence
  useEffect(() => {
    if (session && session.host.name === displayName) {
      setHostToken(session.host.hostToken);
    }
  }, [session, displayName]);

  // WebSocket connection
  const { isConnected, isConnecting, send, error: wsError } = useSocket<SessionState>(
    sessionId as string,
    useCallback((data: SessionState | null) => {
      console.log('[WebSocket] Received data:', data);
      if (data && typeof data === 'object' && 'sessionId' in data) {
        console.log('[WebSocket] Updating session state, voting status:', data.voting?.status);
        setSession(data);
        setOptimisticSession(null);
        setLoading(false);
        setError('');
      } else {
        console.warn('[WebSocket] Received invalid data:', data);
      }
    }, [])
  );

  useEffect(() => {
    if (wsError) setError(wsError);
  }, [wsError]);

  // Optimistic updates
  const applyOptimisticUpdate = useCallback((updater: (s: SessionState) => SessionState) => {
    setSession(current => {
      if (!current) return current;
      const updated = updater(current);
      setOptimisticSession(updated);
      return current;
    });
  }, []);

  const sendAction = useCallback(async (action: Action, optimisticUpdater?: (s: SessionState) => SessionState) => {
    console.log('[sendAction] Called with action:', action, 'isConnected:', isConnected);
    if (!isConnected) {
      setJoinError('Disconnected from server. Reconnecting...');
      console.warn('[sendAction] Not connected, aborting');
      return;
    }
    const hostToken = getHostToken();
    const payload = { ...action, actor: displayName, hostToken: hostToken || undefined };
    console.log('[sendAction] Sending payload:', payload);
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

  // Derived state
  const displaySession = optimisticSession || session;
  const isHost = displaySession && getHostToken() === displaySession.host.hostToken;
  const activeTask = displaySession?.tasks.find((t) => t.id === displaySession.activeTaskId) || null;
  const hasJoined = displaySession && !!displaySession.participants[displayName];
  const pendingApproval = displaySession && !!displaySession.joinRequests[displayName];

  // Auto-join if identity is known and connected
  useEffect(() => {
    if (isConnected && !loading && displaySession && displayName && !hasJoined && !pendingApproval && !joinError) {
      joinSession();
    }
  }, [isConnected, loading, displaySession, displayName, hasJoined, pendingApproval, joinError, joinSession]);

  // Vote value logic
  const myVote = displaySession && displayName
    ? displaySession.tasks.find(t => t.id === displaySession.activeTaskId)?.votes?.[displayName]
    : null;

  // Load pending tasks from Create Session and add them
  useEffect(() => {
    if (!sessionId || !isHost || !isConnected || pendingTasksLoaded) return;

    const pendingTasksKey = `pendingTasks_${sessionId}`;
    const pendingTasksJson = localStorage.getItem(pendingTasksKey);

    if (pendingTasksJson) {
      try {
        const pendingTasks = JSON.parse(pendingTasksJson);
        if (Array.isArray(pendingTasks) && pendingTasks.length > 0) {
          // Add each task to the session
          pendingTasks.forEach((task: { title: string; description?: string }) => {
            sendAction({ type: 'add_task', title: task.title });
          });
          // Clear the pending tasks
          localStorage.removeItem(pendingTasksKey);
          setPendingTasksLoaded(true);
        }
      } catch (e) {
        console.error('Failed to load pending tasks:', e);
      }
    }
  }, [sessionId, isHost, isConnected, pendingTasksLoaded, sendAction]);

  // Deck of voting options with confirmed vote
  useEffect(() => {
    if (myVote) setLocalVote(myVote);
  }, [myVote]);

  // Generate QR code for session join link
  useEffect(() => {
    if (typeof window !== 'undefined' && sessionId) {
      const joinUrl = `${window.location.origin}/session?id=${sessionId}`;
      QRCode.toDataURL(joinUrl, { width: 200, margin: 2 })
        .then(setQrCodeUrl)
        .catch(console.error);
    }
  }, [sessionId]);

  // Stats
  const activeStats = useMemo(() => {
    if (!activeTask) return { average: null, median: null };
    return calculateStats(activeTask.votes);
  }, [activeTask]);

  const participantsList = useMemo(() => {
    if (!displaySession) return [];
    return Object.entries(displaySession.participants).map(([name, p]) => ({
      name,
      role: p.role,
      hasVoted: activeTask?.votes[name] !== undefined,
      vote: activeTask?.votes[name],
      isHost: session?.host.name === name
    }));
  }, [displaySession, activeTask, session]);

  const votedCount = participantsList.filter(p => p.hasVoted).length;
  const totalVoters = participantsList.filter(p => p.role === 'voter').length;

  // Check if this is the final task
  const isLastTask = useMemo(() => {
    if (!displaySession) return false;
    const unestimatedTasks = displaySession.tasks.filter(t => !t.finalEstimate && t.id !== displaySession.activeTaskId);
    return unestimatedTasks.length === 0;
  }, [displaySession]);

  // Helper function to move to next task
  const moveToNextTask = useCallback(() => {
    if (!displaySession) return;

    // Find next task without final estimate
    const nextTask = displaySession.tasks.find(t => !t.finalEstimate && t.id !== displaySession.activeTaskId);

    if (nextTask) {
      sendAction({ type: 'select_task', taskId: nextTask.id });
    } else {
      // All tasks are done, open modal to add a new one
      setShowTaskModal(true);
    }
  }, [displaySession, sendAction]);

  // Helper function to add task
  const handleAddTask = useCallback(() => {
    if (newTaskTitle.trim()) {
      sendAction({
        type: 'add_task',
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || undefined
      });
      setNewTaskTitle('');
      setNewTaskDescription('');
      setShowTaskModal(false);
      setIsAddingTask(false);
    }
  }, [newTaskTitle, newTaskDescription, sendAction]);

  const renderTaskModal = () => {
    if (!showTaskModal) return null;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => {
        setShowTaskModal(false);
        setNewTaskTitle('');
        setNewTaskDescription('');
      }}>
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 border-b border-border-light dark:border-border-dark">
            <h2 className="text-2xl font-bold text-text-main-light dark:text-text-main-dark">Add New Task</h2>
            <p className="text-sm text-text-sub-light dark:text-text-sub-dark mt-1">Create a new task for the team to estimate</p>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-text-main-light dark:text-text-main-dark mb-2">
                Task Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="e.g., Implement user authentication"
                className="w-full px-4 py-3 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-main-light dark:text-text-main-dark focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddTask();
                  } else if (e.key === 'Escape') {
                    setShowTaskModal(false);
                    setNewTaskTitle('');
                    setNewTaskDescription('');
                  }
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text-main-light dark:text-text-main-dark mb-2">
                Description <span className="text-text-sub-light text-xs">(Optional)</span>
              </label>
              <textarea
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Add any additional context or requirements..."
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark text-text-main-light dark:text-text-main-dark focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowTaskModal(false);
                    setNewTaskTitle('');
                    setNewTaskDescription('');
                  }
                }}
              />
            </div>
          </div>
          <div className="p-6 border-t border-border-light dark:border-border-dark flex gap-3 justify-end">
            <button
              onClick={() => {
                setShowTaskModal(false);
                setNewTaskTitle('');
                setNewTaskDescription('');
              }}
              className="px-6 py-2.5 rounded-lg border border-border-light dark:border-border-dark text-text-main-light dark:text-text-main-dark font-medium hover:bg-background-light dark:hover:bg-background-dark transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddTask}
              disabled={!newTaskTitle.trim()}
              className="px-6 py-2.5 rounded-lg bg-primary text-white font-bold hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Task
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderParticipantsList = () => (
    <div className="rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-text-main-light dark:text-text-main-dark flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">groups</span>
          Participants
        </h3>
        <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
          <span className="size-2 rounded-full bg-green-500 animate-pulse"></span>
          {votedCount}/{totalVoters} Voted
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {participantsList.map((p) => (
          <div key={p.name} className={`flex items-center gap-3 p-3 rounded-lg border ${p.hasVoted ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30' : 'bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark'}`}>
            <div className="relative">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm uppercase">
                {p.name.substring(0, 2)}
              </div>
              {p.hasVoted && (
                <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5 border-2 border-white dark:border-surface-dark">
                  <span className="material-symbols-outlined text-white text-[12px] block">check</span>
                </div>
              )}
              {!p.hasVoted && displaySession?.voting.status === 'open' && (
                <div className="absolute -bottom-1 -right-1 bg-yellow-400 rounded-full p-0.5 border-2 border-white dark:border-surface-dark animate-pulse">
                  <span className="material-symbols-outlined text-white text-[12px] block">more_horiz</span>
                </div>
              )}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text-main-light dark:text-text-main-dark">{p.name} {p.name === displayName ? '(You)' : ''}</span>
                {displaySession?.voting.status === 'revealed' && p.vote && (
                  <span className="bg-primary/20 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded border border-primary/30 animate-in zoom-in duration-300">
                    {p.vote}
                  </span>
                )}
              </div>
              <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium">{p.hasVoted ? 'Voted' : (displaySession?.voting.status === 'idle' ? 'Ready' : 'Thinking...')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderEndSessionModal = () => {
    if (!showEndSessionModal) return null;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setShowEndSessionModal(false)}>
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl border border-border-light dark:border-border-dark w-full max-w-md p-6 flex flex-col gap-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold text-text-main-light dark:text-text-main-dark">End Session?</h2>
            <p className="text-text-sub-light dark:text-text-sub-dark">
              This will complete the session and show the final summary to all participants. This action cannot be undone.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowEndSessionModal(false)}
              className="px-6 py-2.5 rounded-lg border border-border-light dark:border-border-dark text-text-main-light dark:text-text-main-dark font-medium hover:bg-background-light dark:hover:bg-background-dark transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                sendAction({ type: 'end_session' });
                setShowEndSessionModal(false);
              }}
              className="px-6 py-2.5 rounded-lg bg-red-500 text-white font-bold hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all"
            >
              End Session
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Helper function to export data as CSV
  const exportToCSV = useCallback(() => {
    if (!displaySession) return;

    const csvRows = [];
    csvRows.push(['Task Title', 'Description', 'Final Estimate', 'Average Vote', 'Median Vote'].join(','));

    displaySession.tasks.forEach(task => {
      const stats = calculateStats(task.votes);
      const row = [
        `"${task.title.replace(/"/g, '""')}"`,
        `"${(task.description || '').replace(/"/g, '""')}"`,
        task.finalEstimate || '',
        stats.average || '',
        stats.median || ''
      ].join(',');
      csvRows.push(row);
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planning-poker-${sessionId}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, [displaySession, sessionId]);

  // View Switching Logic
  const viewState = useMemo(() => {
    if (!displaySession) return 'loading';
    if (displaySession.status === 'ended') return 'summary';
    if (displaySession.voting.status === 'revealed') return 'results';
    return 'dashboard';
  }, [displaySession]);

  // --- RENDER HELPERS ---

  if (!sessionId) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-red-500 mb-2">Error</h1>
          <p className="text-text-sub-light mb-4">No Session ID provided.</p>
          <Link href="/join" className="px-4 py-2 bg-primary text-white rounded-lg">Return to Join</Link>
        </div>
      </div>
    );
  }

  if (loading && !displaySession) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-text-sub-light dark:text-text-sub-dark">Loading Session...</p>
        </div>
      </div>
    );
  }

  if (error && !displaySession) { // Connection error
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background-light dark:bg-background-dark p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-red-500 mb-2">Connection Error</h1>
          <p className="text-text-sub-light mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-primary text-white rounded-lg">Retry</button>
        </div>
      </div>
    );
  }

  // Join Screen
  if (!hasJoined && !pendingApproval) {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col font-display text-text-main-light dark:text-text-main-dark">
        <header className="flex items-center justify-between border-b border-border-light dark:border-border-dark px-6 py-3 bg-surface-light dark:bg-surface-dark">
          <div className="flex items-center gap-3">
            <Link href="/" className="size-8 text-primary flex items-center justify-center rounded-lg bg-primary/10">
              <span className="material-symbols-outlined text-2xl">style</span>
            </Link>
            <h2 className="text-lg font-bold">Planning Poker</h2>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[520px] bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-border-light dark:border-border-dark p-8 flex flex-col gap-6">
            <h1 className="text-2xl font-bold text-center">Join Session</h1>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold">Your Name</label>
              <input
                className="w-full h-12 rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark px-4"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && displayName.trim()) {
                    joinSession();
                  }
                }}
              />
            </div>
            {joinError && <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded">{joinError}</div>}
            <button
              onClick={joinSession}
              disabled={!displayName || !isConnected}
              className="w-full h-12 bg-primary text-white font-bold rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              {isConnected ? 'Join Session' : 'Connecting...'}
            </button>
            <p className="text-center text-xs text-text-sub-light">Session ID: {sessionId}</p>
          </div>
        </main>
      </div>
    );
  }

  if (pendingApproval) {
    return (
      <div className="flex h-screen items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="text-center p-8">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-bold mb-2 text-text-main-light dark:text-text-main-dark">Waiting for Approval</h2>
          <p className="text-text-sub-light dark:text-text-sub-dark">The host will let you in shortly.</p>
        </div>
      </div>
    );
  }

  // --- VIEWS ---

  // REVEALED VIEW (Results)
  if (viewState === 'results') {
    return (
      <div className="bg-background-light dark:bg-background-dark font-display antialiased min-h-screen flex flex-col">
        <header className="h-16 flex items-center justify-between px-6 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark z-20 shrink-0">
          <div className="flex items-center gap-4">
            <Link href="/" className="size-8 bg-primary rounded-lg flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[20px]">style</span>
            </Link>
            <div className="flex flex-col">
              <h1 className="text-base font-bold leading-none">Planning Poker</h1>
              <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium mt-1">Session #{sessionId}</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-sm font-medium border border-green-500/20">Voting Complete</span>
            <div className="h-8 w-px bg-border-light dark:bg-border-dark"></div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase border border-primary/20">
                  {displayName.substring(0, 2)}
                </div>
                <span className="text-sm font-medium hidden sm:block">{displayName}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-80 bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark flex flex-col shrink-0 z-10 hidden md:flex">
            {/* QR Code Section (Host only) */}
            {isHost && (
              <div className="p-4 border-b border-border-light dark:border-border-dark">
                <button
                  onClick={() => setShowQR(!showQR)}
                  className="w-full flex items-center justify-between text-left group"
                >
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark group-hover:text-primary transition-colors">
                    Invite Participants
                  </h3>
                  <span className="material-symbols-outlined text-text-sub-light group-hover:text-primary transition-all" style={{ transform: showQR ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    expand_more
                  </span>
                </button>
                {showQR && (
                  <div className="mt-4 flex flex-col gap-3 animate-fade-in">
                    {qrCodeUrl && (
                      <div className="flex justify-center p-3 bg-white rounded-lg">
                        <img src={qrCodeUrl} alt="Session QR Code" className="w-40 h-40" />
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold text-text-sub-light dark:text-text-sub-dark uppercase">Join Link</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={typeof window !== 'undefined' ? `${window.location.origin}/session?id=${sessionId}` : ''}
                          readOnly
                          className="flex-1 px-3 py-2 text-xs rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark font-mono"
                        />
                        <button
                          onClick={() => {
                            if (typeof window !== 'undefined') {
                              navigator.clipboard.writeText(`${window.location.origin}/session?id=${sessionId}`);
                            }
                          }}
                          className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
                          title="Copy link"
                        >
                          <span className="material-symbols-outlined text-[18px]">content_copy</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="p-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
              <h2 className="font-semibold text-sm uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Backlog</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {displaySession?.tasks.map(task => (
                <div
                  key={task.id}
                  onClick={() => isHost && sendAction({ type: 'select_task', taskId: task.id })}
                  className={`group relative flex flex-col p-4 rounded-xl shadow-sm cursor-pointer transition-all border ${task.id === displaySession.activeTaskId
                    ? 'bg-surface-light dark:bg-surface-dark border-l-4 border-l-primary ring-1 ring-border-light dark:ring-border-dark'
                    : 'hover:bg-background-light dark:hover:bg-background-dark/50 border-transparent opacity-70 hover:opacity-100'
                    }`}
                >
                  <div className="flex items-start gap-3">
                    {task.finalEstimate ? (
                      <span className="material-symbols-outlined text-green-500 text-[20px] mt-0.5">check_circle</span>
                    ) : (
                      <span className={`material-symbols-outlined text-[20px] mt-0.5 ${task.id === displaySession.activeTaskId ? 'text-primary' : 'text-text-sub-light'}`}>
                        {task.id === displaySession.activeTaskId ? 'play_circle' : 'radio_button_unchecked'}
                      </span>
                    )}
                    <div>
                      <p className={`text-sm font-bold ${task.id === displaySession.activeTaskId ? 'text-text-main-light dark:text-text-main-dark' : 'text-text-sub-light dark:text-text-sub-dark'}`}>
                        {task.title}
                      </p>
                    </div>
                    {task.finalEstimate && (
                      <span className="ml-auto text-xs font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">{task.finalEstimate}</span>
                    )}
                  </div>
                </div>
              ))}
              {displaySession?.tasks.length === 0 && (
                <p className="text-center text-sm text-text-sub-light italic py-4">No tasks in backlog</p>
              )}
            </div>
            <div className="p-4 border-t border-border-light dark:border-border-dark">
              {(isHost || displaySession?.sessionMode === 'open') && (
                <button
                  onClick={() => setShowTaskModal(true)}
                  className="w-full py-2 px-4 rounded-lg border border-dashed border-border-light dark:border-border-dark text-sm font-medium text-text-sub-light hover:text-primary hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  Add New Task
                </button>
              )}
            </div>
          </aside>

        <main className="flex-1 flex flex-col items-center p-4 lg:p-10 overflow-y-auto">
          <div className="w-full max-w-4xl flex flex-col gap-8">
            <div className="flex flex-col gap-2 text-center sm:text-left">
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <span className="material-symbols-outlined text-primary text-3xl">task_alt</span>
                <h1 className="text-3xl md:text-4xl font-black text-text-main-light dark:text-text-main-dark">{activeTask?.title}</h1>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark shadow-sm">
                <div className="flex items-center gap-2 mb-1 text-text-sub-light dark:text-text-sub-dark">
                  <span className="material-symbols-outlined text-primary">functions</span>
                  <span className="text-sm font-medium uppercase tracking-wider">Average Vote</span>
                </div>
                <p className="text-5xl font-bold text-text-main-light dark:text-text-main-dark">{activeStats.average}</p>
              </div>
              <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark shadow-sm">
                <div className="flex items-center gap-2 mb-1 text-text-sub-light dark:text-text-sub-dark">
                  <span className="material-symbols-outlined text-primary">analytics</span>
                  <span className="text-sm font-medium uppercase tracking-wider">Median Vote</span>
                </div>
                <p className="text-5xl font-bold text-text-main-light dark:text-text-main-dark">{activeStats.median}</p>
              </div>
            </div>

            {/* Stats/Distribution Chart */}
            <div className="rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark shadow-sm">
              <h3 className="text-xl font-bold text-text-main-light dark:text-text-main-dark mb-6">Vote Distribution</h3>
              <div className="h-[200px] flex items-end justify-between gap-4">
                {activeTask && Object.entries(formatDistribution(activeTask.votes)).map(([val, count]) => {
                  const maxVotes = Math.max(...Object.values(formatDistribution(activeTask.votes)));
                  const heightPct = maxVotes ? (count / maxVotes) * 100 : 0;
                  return (
                    <div key={val} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                      <div className="w-full bg-primary/10 rounded-t-md relative flex items-end justify-center overflow-hidden transition-all hover:bg-primary/20" style={{ height: `${heightPct}%`, minHeight: '24px' }}>
                        <div className="absolute inset-x-0 bottom-0 bg-primary opacity-80 h-full"></div>
                        <span className="relative z-10 text-white font-bold text-sm mb-1">{count}</span>
                      </div>
                      <span className="text-sm font-bold text-text-sub-light dark:text-text-sub-dark">{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {isHost && (
              <div className="flex flex-col gap-4 p-6 rounded-xl border border-primary/20 bg-primary/5 dark:bg-[#151e2e]">
                <div className="flex-1">
                  <h3 className="text-lg font-bold flex items-center gap-2 text-text-main-light dark:text-text-main-dark">
                    <span className="material-symbols-outlined text-primary">admin_panel_settings</span>
                    Host Controls
                  </h3>
                  <p className="text-text-sub-light dark:text-text-sub-dark text-sm mt-1">
                    {isLastTask ? 'Final task complete! Choose next action.' : 'Consensus reached? Enter final points.'}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {!isLastTask ? (
                    <>
                      <input
                        className="w-full sm:w-24 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg p-2.5 text-center font-bold text-lg"
                        placeholder={activeStats.median?.toString() || "0"}
                        onBlur={(e) => {
                          if (activeTask) sendAction({ type: 'set_final_estimate', taskId: activeTask.id, estimate: e.target.value });
                        }}
                      />
                      <button
                        onClick={moveToNextTask}
                        className="flex-1 sm:flex-none px-6 py-2.5 bg-primary text-white rounded-lg font-bold hover:bg-primary-hover shadow-lg flex items-center justify-center gap-2"
                      >
                        <span>Next Task</span>
                        <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                      </button>
                      <button
                        onClick={() => sendAction({ type: 'clear_votes' })}
                        className="flex-1 sm:flex-none px-4 py-2.5 border border-border-light dark:border-border-dark rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark text-text-main-light dark:text-text-main-dark font-medium"
                      >
                        Revote
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        className="w-full sm:w-24 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg p-2.5 text-center font-bold text-lg"
                        placeholder={activeStats.median?.toString() || "0"}
                        onBlur={(e) => {
                          if (activeTask) sendAction({ type: 'set_final_estimate', taskId: activeTask.id, estimate: e.target.value });
                        }}
                      />
                      <button
                        onClick={() => setShowTaskModal(true)}
                        className="flex-1 sm:flex-none px-6 py-2.5 bg-primary text-white rounded-lg font-bold hover:bg-primary-hover shadow-lg flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[20px]">add_circle</span>
                        <span>Add More Tasks</span>
                      </button>
                      <button
                        onClick={exportToCSV}
                        className="flex-1 sm:flex-none px-6 py-2.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[20px]">download</span>
                        <span>Export CSV</span>
                      </button>
                      <button
                        onClick={() => setShowEndSessionModal(true)}
                        className="flex-1 sm:flex-none px-6 py-2.5 border-2 border-red-500 text-red-500 rounded-lg font-bold hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[20px]">power_settings_new</span>
                        <span>End Session</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            {renderParticipantsList()}
          </div>
        </main>
        </div>
        {renderTaskModal()}
        {renderEndSessionModal()}
      </div>
    );
  }

  // SUMMARY VIEW
  if (viewState === 'summary') {
    return (
      <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col text-text-main-light dark:text-text-main-dark">
        <header className="flex items-center justify-between p-6 border-b border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
          <div className="flex items-center gap-3">
            <Link href="/" className="size-8 text-primary flex items-center justify-center rounded-lg bg-primary/10">
              <span className="material-symbols-outlined text-2xl">style</span>
            </Link>
            <h2 className="text-lg font-bold">Planning Poker</h2>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="w-full max-w-4xl flex flex-col gap-8">
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-green-500 text-4xl">check_circle</span>
              <h1 className="text-4xl font-black">Session Summary</h1>
            </div>

            {/* Summary Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-6 rounded-xl bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark shadow-sm">
                <p className="text-sm font-bold text-text-sub-light uppercase">Total Tasks</p>
                <p className="text-4xl font-bold mt-2">{displaySession?.tasks.length}</p>
              </div>
            </div>

            {/* Tasks List */}
            <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-background-light dark:bg-background-dark border-b border-border-light dark:border-border-dark">
                  <tr>
                    <th className="p-4 text-xs font-bold uppercase text-text-sub-light">Task</th>
                    <th className="p-4 text-xs font-bold uppercase text-text-sub-light">Estimate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light dark:divide-border-dark">
                  {displaySession?.tasks.map(t => (
                    <tr key={t.id}>
                      <td className="p-4 font-medium">{t.title}</td>
                      <td className="p-4">
                        <span className="inline-flex items-center justify-center size-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                          {t.finalEstimate || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-start gap-4">
              <Link href="/" className="px-6 py-3 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg font-bold hover:bg-background-light transition-colors">
                Back to Home
              </Link>
              <button
                onClick={exportToCSV}
                className="px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-lg flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">download</span>
                <span>Export CSV</span>
              </button>
              <Link href="/create" className="px-6 py-3 bg-primary text-white rounded-lg font-bold hover:bg-primary-hover shadow-lg">
                New Session
              </Link>
            </div>
          </div>
        </main>
        {renderTaskModal()}
        {renderEndSessionModal()}
      </div>
    );
  }

  // DASHBOARD VIEW (Default)
  return (
    <div className="font-display bg-background-light dark:bg-background-dark text-text-main-light dark:text-text-main-dark overflow-hidden h-screen flex flex-col">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark z-20 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="size-8 bg-primary rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-[20px]">style</span>
          </Link>
          <div className="flex flex-col">
            <h1 className="text-base font-bold leading-none">Planning Poker</h1>
            <span className="text-xs text-text-sub-light dark:text-text-sub-dark font-medium mt-1">Session #{sessionId}</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-background-light dark:bg-background-dark rounded-full">
            <span className="material-symbols-outlined text-green-600 dark:text-green-500 text-[18px]">check_circle</span>
            <span className="text-sm font-medium text-text-sub-light dark:text-text-sub-dark">
              {displaySession?.tasks.filter(t => t.finalEstimate).length}/{displaySession?.tasks.length} Tasks
            </span>
          </div>
          <div className="h-8 w-px bg-border-light dark:bg-border-dark"></div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs uppercase border border-primary/20">
                {displayName.substring(0, 2)}
              </div>
              <span className="text-sm font-medium hidden sm:block">{displayName}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar (Backlog) */}
        <aside className="w-80 bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark flex flex-col shrink-0 z-10 hidden md:flex">
          {/* QR Code Section (Host only) */}
          {isHost && (
            <div className="p-4 border-b border-border-light dark:border-border-dark">
              <button
                onClick={() => setShowQR(!showQR)}
                className="w-full flex items-center justify-between text-left group"
              >
                <h3 className="font-semibold text-sm uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark group-hover:text-primary transition-colors">
                  Invite Participants
                </h3>
                <span className="material-symbols-outlined text-text-sub-light group-hover:text-primary transition-all" style={{ transform: showQR ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  expand_more
                </span>
              </button>
              {showQR && (
                <div className="mt-4 flex flex-col gap-3 animate-fade-in">
                  {qrCodeUrl && (
                    <div className="flex justify-center p-3 bg-white rounded-lg">
                      <img src={qrCodeUrl} alt="Session QR Code" className="w-40 h-40" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-text-sub-light dark:text-text-sub-dark uppercase">Join Link</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={typeof window !== 'undefined' ? `${window.location.origin}/session?id=${sessionId}` : ''}
                        readOnly
                        className="flex-1 px-3 py-2 text-xs rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark font-mono"
                      />
                      <button
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            navigator.clipboard.writeText(`${window.location.origin}/session?id=${sessionId}`);
                          }
                        }}
                        className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
                        title="Copy link"
                      >
                        <span className="material-symbols-outlined text-[18px]">content_copy</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="p-4 border-b border-border-light dark:border-border-dark flex justify-between items-center">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Backlog</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {displaySession?.tasks.map(task => (
              <div
                key={task.id}
                onClick={() => isHost && sendAction({ type: 'select_task', taskId: task.id })}
                className={`group relative flex flex-col p-4 rounded-xl shadow-sm cursor-pointer transition-all border ${task.id === displaySession.activeTaskId
                  ? 'bg-surface-light dark:bg-surface-dark border-l-4 border-l-primary ring-1 ring-border-light dark:ring-border-dark'
                  : 'hover:bg-background-light dark:hover:bg-background-dark/50 border-transparent opacity-70 hover:opacity-100'
                  }`}
              >
                <div className="flex items-start gap-3">
                  {task.finalEstimate ? (
                    <span className="material-symbols-outlined text-green-500 text-[20px] mt-0.5">check_circle</span>
                  ) : (
                    <span className={`material-symbols-outlined text-[20px] mt-0.5 ${task.id === displaySession.activeTaskId ? 'text-primary' : 'text-text-sub-light'}`}>
                      {task.id === displaySession.activeTaskId ? 'play_circle' : 'radio_button_unchecked'}
                    </span>
                  )}
                  <div>
                    <p className={`text-sm font-bold ${task.id === displaySession.activeTaskId ? 'text-text-main-light dark:text-text-main-dark' : 'text-text-sub-light dark:text-text-sub-dark'}`}>
                      {task.title}
                    </p>
                  </div>
                  {task.finalEstimate && (
                    <span className="ml-auto text-xs font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">{task.finalEstimate}</span>
                  )}
                </div>
              </div>
            ))}
            {displaySession?.tasks.length === 0 && (
              <p className="text-center text-sm text-text-sub-light italic py-4">No tasks in backlog</p>
            )}
          </div>
          <div className="p-4 border-t border-border-light dark:border-border-dark">
            {(isHost || displaySession?.sessionMode === 'open') && (
              <button
                onClick={() => setShowTaskModal(true)}
                className="w-full py-2 px-4 rounded-lg border border-dashed border-border-light dark:border-border-dark text-sm font-medium text-text-sub-light hover:text-primary hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                Add New Task
              </button>
            )}
          </div>
        </aside>

        {/* Main Stage */}
        <main className="flex-1 flex flex-col overflow-y-auto bg-background-light dark:bg-background-dark relative">
          <div className="flex-1 w-full max-w-5xl mx-auto p-8 flex flex-col gap-8">
            {!activeTask ? (
              <div className="flex flex-col items-center justify-center h-full text-text-sub-light">
                <div className="size-20 bg-surface-light dark:bg-surface-dark rounded-full flex items-center justify-center text-4xl mb-4 shadow-sm">🎲</div>
                <h2 className="text-2xl font-bold text-text-main-light dark:text-text-main-dark">Ready to Estimate</h2>
                <p>Select a task from the backlog to begin.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 animate-fade-in">
                  <div className="flex items-center gap-3">
                    {displaySession?.voting.status === 'open' && (
                      <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
                        <span className="size-2 bg-primary rounded-full animate-pulse"></span>
                        VOTING OPEN
                      </span>
                    )}
                    {displaySession?.voting.status === 'idle' && (
                      <span className="bg-secondary/10 text-secondary-foreground text-xs font-bold px-2.5 py-1 rounded-md">
                        READY TO VOTE
                      </span>
                    )}
                    {isHost && (
                      <button onClick={() => sendAction({ type: 'clear_votes' })} className="text-xs text-text-sub-light hover:text-text-main-light underline">Reset Session Votes</button>
                    )}
                  </div>
                  <h1 className="text-3xl md:text-4xl font-bold text-text-main-light dark:text-text-main-dark tracking-tight">{activeTask.title}</h1>
                  {activeTask.description && (
                    <div className="mt-2">
                      <p className={`text-text-sub-light dark:text-text-sub-dark ${!expandedDescription && activeTask.description.length > 150 ? 'line-clamp-2' : ''}`}>
                        {activeTask.description}
                      </p>
                      {activeTask.description.length > 150 && (
                        <button
                          onClick={() => setExpandedDescription(!expandedDescription)}
                          className="text-sm text-primary hover:underline mt-1"
                        >
                          {expandedDescription ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Voting Area */}
                <div className="flex flex-col gap-6 mt-4">
                  {displaySession?.voting.status === 'idle' ? (
                    <div className="flex flex-col gap-8">
                      {activeTask && Object.keys(activeTask.votes).length > 0 && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark shadow-sm">
                              <div className="flex items-center gap-2 mb-1 text-text-sub-light dark:text-text-sub-dark">
                                <span className="material-symbols-outlined text-primary">functions</span>
                                <span className="text-sm font-medium uppercase tracking-wider">Average Vote</span>
                              </div>
                              <p className="text-5xl font-bold text-text-main-light dark:text-text-main-dark">{activeStats.average || '-'}</p>
                            </div>
                            <div className="flex flex-col gap-2 rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark shadow-sm">
                              <div className="flex items-center gap-2 mb-1 text-text-sub-light dark:text-text-sub-dark">
                                <span className="material-symbols-outlined text-primary">analytics</span>
                                <span className="text-sm font-medium uppercase tracking-wider">Median Vote</span>
                              </div>
                              <p className="text-5xl font-bold text-text-main-light dark:text-text-main-dark">{activeStats.median || '-'}</p>
                            </div>
                          </div>

                          <div className="rounded-xl p-6 border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark shadow-sm">
                            <h3 className="text-xl font-bold text-text-main-light dark:text-text-main-dark mb-6">Previous Vote Distribution</h3>
                            <div className="h-[200px] flex items-end justify-between gap-4">
                              {Object.entries(formatDistribution(activeTask.votes)).map(([val, count]) => {
                                const maxVotes = Math.max(...Object.values(formatDistribution(activeTask.votes)));
                                const heightPct = maxVotes ? (count / maxVotes) * 100 : 0;
                                return (
                                  <div key={val} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                                    <div className="w-full bg-primary/10 rounded-t-md relative flex items-end justify-center overflow-hidden transition-all hover:bg-primary/20" style={{ height: `${heightPct}%`, minHeight: '24px' }}>
                                      <div className="absolute inset-x-0 bottom-0 bg-primary opacity-80 h-full"></div>
                                      <span className="relative z-10 text-white font-bold text-sm mb-1">{count}</span>
                                    </div>
                                    <span className="text-sm font-bold text-text-sub-light dark:text-text-sub-dark">{val}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col items-center justify-center py-12 rounded-xl border-2 border-dashed border-border-light dark:border-border-dark bg-surface-light/50 dark:bg-surface-dark/50">
                        {isHost ? (
                          <div className="text-center space-y-4">
                            <p className="text-text-sub-light dark:text-text-sub-dark">
                              {Object.keys(activeTask.votes).length > 0
                                ? "Results are shown above. You can start a new voting round."
                                : "Task is selected. Start voting when ready."}
                            </p>
                            <button
                              onClick={() => sendAction({ type: 'start_voting', durationSeconds: 0 })}
                              className="px-8 py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-hover hover:scale-105 transition-all text-lg flex items-center gap-2"
                            >
                              <span className="material-symbols-outlined">{Object.keys(activeTask.votes).length > 0 ? 'restart_alt' : 'play_arrow'}</span>
                              {Object.keys(activeTask.votes).length > 0 ? 'Revote' : 'Start Voting'}
                            </button>
                          </div>
                        ) : (
                          <div className="text-center space-y-2">
                            <div className="size-12 border-4 border-border-light dark:border-border-dark border-t-primary rounded-full animate-spin mx-auto"></div>
                            <p className="text-text-main-light dark:text-text-main-dark font-medium">Waiting for host to open voting...</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-text-main-light dark:text-text-main-dark flex items-center gap-2">
                          Select your estimate
                          <span className="text-xs font-normal text-text-sub-light bg-background-light dark:bg-surface-dark border border-border-light dark:border-border-dark px-2 py-0.5 rounded-full">Fibonacci</span>
                        </h3>
                        <span className="text-sm font-medium text-text-sub-light">Your vote: <span className="text-primary font-bold">{localVote || '-'}</span></span>
                      </div>
                      <div className={`grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-7 xl:grid-cols-9 gap-3 ${displaySession?.voting.status === 'closed' ? 'opacity-50 pointer-events-none' : ''}`}>
                        {deck.map((vote) => (
                          <button
                            key={vote}
                            onClick={() => {
                              setLocalVote(vote);
                              sendAction({ type: 'cast_vote', value: vote });
                            }}
                            className={`group relative aspect-[3/4] rounded-xl flex flex-col items-center justify-center transition-all duration-200
                                                        ${localVote === vote
                                ? 'bg-primary shadow-lg shadow-primary/30 ring-2 ring-offset-2 ring-primary ring-offset-background-light dark:ring-offset-background-dark -translate-y-2'
                                : 'bg-surface-light dark:bg-surface-dark border-2 border-transparent shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-primary/50'
                              }`}
                          >
                            <span className={`text-2xl font-bold ${localVote === vote ? 'text-white' : 'text-text-main-light dark:text-text-main-dark group-hover:text-primary'}`}>{vote}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-8">
                  {renderParticipantsList()}
                </div>
              </>
            )}
          </div>

          <div className="sticky bottom-0 w-full bg-surface-light dark:bg-surface-dark border-t border-border-light dark:border-border-dark p-4 shadow-lg z-20">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              <div className="hidden sm:block">
                <p className="text-sm text-text-sub-light dark:text-text-sub-dark">
                  {activeTask ?
                    (displaySession?.voting.status === 'open' ? `Waiting for ${totalVoters - votedCount} participants to vote...` :
                      (displaySession?.voting.status === 'idle' ? 'Waiting for host to start voting...' : 'Voting closed'))
                    : 'Select a task to start'}
                </p>
              </div>
              <div className="flex items-center gap-4 w-full sm:w-auto">
                {isHost && (
                  <button
                    onClick={() => sendAction({ type: 'reveal' })}
                    disabled={!activeTask || votedCount === 0 || displaySession?.voting.status !== 'open'}
                    className="flex-1 sm:flex-none px-8 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-hover shadow-md shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[20px]">visibility</span>
                    Reveal Cards
                  </button>
                )}
                {isHost && (
                  <button className="p-2 text-text-sub-light hover:text-red-500" title="End Session" onClick={() => setShowEndSessionModal(true)}>
                    <span className="material-symbols-outlined">power_settings_new</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {renderTaskModal()}
      {renderEndSessionModal()}
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-background-light dark:bg-background-dark">Loading session params...</div>}>
      <SessionContent />
    </Suspense>
  );
}
