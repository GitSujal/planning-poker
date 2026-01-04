'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Action, ParticipantRole, SessionState } from '@/lib/types';
import { calculateStats, formatDistribution } from '@/lib/session';
import QRCode from 'qrcode';

const deck = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕'];

function getCookie(name: string) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

function saveIdentity(name: string, role: ParticipantRole) {
  localStorage.setItem('displayName', name);
  localStorage.setItem('role', role);
}

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params?.id;
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<ParticipantRole>('voter');
  const [joinError, setJoinError] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [duration, setDuration] = useState(120);
  const [theme, setTheme] = useState('dark');
  const [showQR, setShowQR] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('displayName');
    const storedRole = (localStorage.getItem('role') as ParticipantRole) || 'voter';
    const storedTheme = localStorage.getItem('theme');
    if (stored) setDisplayName(stored);
    if (storedRole) setRole(storedRole);
    if (storedTheme) setTheme(storedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (session && session.host.name === displayName) {
      document.cookie = `hostToken=${session.host.hostToken}; path=/`;
    }
  }, [session, displayName]);

  useEffect(() => {
    if (showQR && qrCanvasRef.current && sessionId) {
      const joinUrl = `${window.location.origin}/session/${sessionId}`;
      QRCode.toCanvas(qrCanvasRef.current, joinUrl, { width: 200 }, (error) => {
        if (error) console.error('QR generation error:', error);
      });
    }
  }, [showQR, sessionId]);

  const fetchSession = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/session/${sessionId}`);
      if (!res.ok) throw new Error('Session not found');
      const data = await res.json();
      setSession(data.session);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
    const interval = setInterval(fetchSession, 2500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const sendAction = async (action: Action) => {
    const hostToken = getCookie('hostToken') || action.hostToken;
    const payload = { ...action, actor: displayName, hostToken };
    const res = await fetch(`/api/session/${sessionId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Action failed');
    }
    const data = await res.json();
    if (data.hostToken && action.type === 'transfer_host' && displayName === action.name) {
      document.cookie = `hostToken=${data.hostToken}; path=/`;
    }
    setSession(data.session);
  };

  const joinSession = async () => {
    setJoinError('');
    try {
      await sendAction({ type: 'join', name: displayName, role });
      saveIdentity(displayName, role);
    } catch (e: any) {
      setJoinError(e.message);
    }
  };

  const isHost = session && getCookie('hostToken') === session.host.hostToken;
  const activeTask = session?.tasks.find((t) => t.id === session.activeTaskId) || null;

  const votingEndsIn = useMemo(() => {
    if (!session?.voting.endsAt) return null;
    return Math.max(0, session.voting.endsAt - Math.floor(Date.now() / 1000));
  }, [session?.voting.endsAt]);

  const voteValue =
    session && displayName ? session.tasks.find((t) => t.id === session.activeTaskId)?.votes?.[displayName] : undefined;

  const activeStats = useMemo(() => {
    if (!activeTask) return { average: null as number | null, median: null as number | null };
    return calculateStats(activeTask.votes);
  }, [activeTask]);

  const exportCsv = () => {
    if (!session) return;
    const rows = [['Task Title', 'Final Estimate', 'Average', 'Median', 'Vote Distribution']];
    session.tasks.forEach((task) => {
      const stats = calculateStats(task.votes);
      const dist = JSON.stringify(formatDistribution(task.votes));
      rows.push([task.title, task.finalEstimate ?? '', String(stats.average ?? ''), String(stats.median ?? ''), dist]);
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

  if (loading) return <main className="container">Loading...</main>;
  if (error) return <main className="container">{error}</main>;
  if (!session) return <main className="container">No session</main>;
  if (session.status === 'ended') return <main className="container">Session ended.</main>;

  const hasJoined = !!session.participants[displayName];
  const pendingApproval = !!session.joinRequests[displayName];

  return (
    <main className="container">
      <header className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Session {session.sessionId}</h2>
          <p style={{ opacity: 0.7 }}>Host: {session.host.name}</p>
          {isHost && (
            <button onClick={() => setShowQR(!showQR)} style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
              {showQR ? 'Hide' : 'Show'} QR Code
            </button>
          )}
        </div>
        <div className="flex" style={{ alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>Theme</button>
          {isHost && <button onClick={() => sendAction({ type: 'end_session' })}>End session</button>}
          <button onClick={() => router.push('/')}>Home</button>
        </div>
      </header>

      {showQR && isHost && typeof window !== 'undefined' && (
        <div className="card" style={{ maxWidth: 320, margin: '1rem 0', textAlign: 'center' }}>
          <h3>Join this session</h3>
          <canvas ref={qrCanvasRef} style={{ margin: '0 auto', display: 'block' }} />
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', wordBreak: 'break-all' }}>
            {`${window.location.origin}/session/${sessionId}`}
          </p>
        </div>
      )}

      {!hasJoined && !pendingApproval && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3>Join session</h3>
          <label>
            Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as ParticipantRole)}>
              <option value="voter">Voter</option>
              <option value="observer">Observer</option>
            </select>
          </label>
          {joinError && <p style={{ color: 'salmon' }}>{joinError}</p>}
          <button disabled={!displayName} onClick={joinSession}>
            Join
          </button>
        </div>
      )}
      {pendingApproval && <p className="card">Join request sent. Waiting for host approval.</p>}

      {hasJoined && (
        <div className="grid" style={{ gridTemplateColumns: '2fr 3fr 2fr', alignItems: 'start' }}>
          <section className="card">
            <div className="flex" style={{ justifyContent: 'space-between' }}>
              <h3>Tasks</h3>
              {(isHost || session.sessionMode === 'open') && (
                <button
                  onClick={() => {
                    if (newTaskTitle.trim()) {
                      sendAction({ type: 'add_task', title: newTaskTitle });
                      setNewTaskTitle('');
                    }
                  }}
                >
                  Add
                </button>
              )}
            </div>
            {(isHost || session.sessionMode === 'open') && (
              <input
                placeholder="New task title"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
            )}
            <ul>
              {session.tasks.map((task) => (
                <li key={task.id} style={{ margin: '0.5rem 0' }}>
                  <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{task.title}</strong>
                      {task.finalEstimate && <span style={{ marginLeft: 8, opacity: 0.8 }}>Final: {task.finalEstimate}</span>}
                    </div>
                    {isHost && (
                      <button onClick={() => sendAction({ type: 'select_task', taskId: task.id })}>
                        {session.activeTaskId === task.id ? 'Active' : 'Set active'}
                      </button>
                    )}
                  </div>
                  {task.id === session.activeTaskId && (
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                      Votes: {Object.keys(task.votes).length}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>Active task</h3>
                <p>{activeTask?.title || 'No task yet'}</p>
              </div>
              {isHost && (
                <div className="flex" style={{ gap: '0.5rem' }}>
                  <input
                    type="number"
                    value={duration}
                    min={30}
                    max={600}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    style={{ width: 90 }}
                  />
                  <button onClick={() => sendAction({ type: 'start_voting', durationSeconds: duration })}>Start</button>
                  <button onClick={() => sendAction({ type: 'reveal' })}>Reveal</button>
                  <button onClick={() => sendAction({ type: 'close_voting' })}>Close</button>
                </div>
              )}
            </div>

            {session.voting.status === 'open' && session.voting.endsAt && (
              <p>Voting ends in {votingEndsIn}s</p>
            )}

            {activeTask && session.voting.status !== 'revealed' && (
              <div className="flex" style={{ flexWrap: 'wrap' }}>
                {deck.map((value) => (
                  <button
                    key={value}
                    disabled={role === 'observer' || session.voting.status !== 'open'}
                    style={{ background: voteValue === value ? 'var(--accent)' : 'transparent', color: 'inherit' }}
                    onClick={() => sendAction({ type: 'cast_vote', value })}
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}

            {activeTask && (
              <div style={{ marginTop: '1rem' }}>
                <h4>Votes</h4>
                {session.voting.status === 'revealed' ? (
                  <ul>
                    {Object.entries(activeTask.votes).map(([name, val]) => (
                      <li key={name}>
                        {name}: {val}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{Object.keys(activeTask.votes).length} cast</p>
                )}

                {session.voting.status === 'revealed' && (
                  <div>
                    <p>Average: {activeStats.average ?? '—'}</p>
                    <p>Median: {activeStats.median ?? '—'}</p>
                    <div>
                      <p>Distribution:</p>
                      <ul>
                        {Object.entries(formatDistribution(activeTask.votes)).map(([value, count]) => (
                          <li key={value}>
                            {value}: {count}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {isHost && (
                      <label>
                        Final estimate
                        <input
                          value={activeTask.finalEstimate ?? ''}
                          onChange={(e) =>
                            sendAction({
                              type: 'set_final_estimate',
                              taskId: activeTask.id,
                              estimate: e.target.value
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}

            {isHost && (
              <div className="flex" style={{ marginTop: '1rem', gap: '0.5rem' }}>
                <button onClick={() => sendAction({ type: 'clear_votes' })}>Reset votes</button>
                <button onClick={() => sendAction({ type: 'add_time', seconds: 30 })}>+30s</button>
                <button onClick={exportCsv}>Export CSV</button>
              </div>
            )}
          </section>

          <section className="card">
            <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Participants ({Object.keys(session.participants).length})</h3>
              {isHost && <button onClick={exportCsv}>Export</button>}
            </div>
            <ul>
              {Object.entries(session.participants).map(([name, p]) => (
                <li key={name} className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {name} <small style={{ opacity: 0.7 }}>({p.role})</small>
                  </span>
                  {isHost && (
                    <div className="flex" style={{ gap: '0.25rem' }}>
                      <button onClick={() => sendAction({ type: 'set_role', name, role: p.role === 'voter' ? 'observer' : 'voter' })}>
                        Toggle role
                      </button>
                      <button onClick={() => sendAction({ type: 'kick', name })}>Kick</button>
                      <button onClick={() => sendAction({ type: 'transfer_host', name })}>Make host</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {isHost && Object.keys(session.joinRequests).length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <h4>Join requests</h4>
                {Object.entries(session.joinRequests).map(([name, req]) => (
                  <div key={name} className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      {name} ({req.role})
                    </span>
                    <div className="flex" style={{ gap: '0.5rem' }}>
                      <button onClick={() => sendAction({ type: 'approve_join', name })}>Approve</button>
                      <button onClick={() => sendAction({ type: 'reject_join', name })}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
