'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function Home() {
  const router = useRouter();
  const [hostName, setHostName] = useState('');
  const [sessionMode, setSessionMode] = useState<'open' | 'closed'>('open');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored) setTheme(stored);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const createSession = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName, sessionMode })
      });
      if (!res.ok) throw new Error('Unable to create session');
      const data = await res.json();
      document.cookie = `hostToken=${data.hostToken}; path=/`;
      localStorage.setItem('displayName', hostName);
      localStorage.setItem('role', 'voter');
      router.push(`/session/${data.sessionId}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container">
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Vibe Planning Poker</h1>
        <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          Theme: {theme === 'light' ? 'Light' : 'Dark'}
        </button>
      </div>
      <div className="card grid" style={{ maxWidth: 520 }}>
        <h2>Create a session</h2>
        <label>
          Host name
          <input value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="Your name" />
        </label>
        <label>
          Session type
          <select value={sessionMode} onChange={(e) => setSessionMode(e.target.value as 'open' | 'closed')}>
            <option value="open">Open session</option>
            <option value="closed">Closed (host approval)</option>
          </select>
        </label>
        {error && <p style={{ color: 'salmon' }}>{error}</p>}
        <button disabled={!hostName || loading} onClick={createSession}>
          {loading ? 'Creating...' : 'Create session'}
        </button>
      </div>
      <p style={{ marginTop: '1rem', opacity: 0.8 }}>Sessions sync via R2 JSON and client polling.</p>
    </main>
  );
}
