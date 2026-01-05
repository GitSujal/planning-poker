'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Moon, Sun } from 'lucide-react';

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

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const createSession = async () => {
    if (!hostName.trim()) {
      setError('Please enter your name');
      return;
    }

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
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4 animate-fade-in">
        <Button onClick={toggleTheme} variant="ghost" size="icon">
          {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </Button>
      </div>

      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Vibe Poker
          </CardTitle>
          <CardDescription>Sync-free collaborative estimation</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hostName">Host Name</Label>
            <Input
              id="hostName"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="Enter your name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createSession()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sessionMode">Session Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={sessionMode === 'open' ? 'default' : 'outline'}
                onClick={() => setSessionMode('open')}
                type="button"
              >
                🌍 Open
              </Button>
              <Button
                variant={sessionMode === 'closed' ? 'default' : 'outline'}
                onClick={() => setSessionMode('closed')}
                type="button"
              >
                🔒 Closed
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {sessionMode === 'open' ? 'Anyone with the link can join instantly.' : 'New participants require host approval.'}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm text-center">
              {error}
            </div>
          )}

          <Button
            disabled={loading}
            onClick={createSession}
            size="lg"
            className="w-full"
          >
            {loading ? 'Creating Session...' : 'Start New Session'}
          </Button>
        </CardContent>
      </Card>

      <p className="fixed bottom-4 text-xs text-muted-foreground opacity-50">
        Powered by Next.js & Cloudflare Durable Objects
      </p>
    </main>
  );
}
