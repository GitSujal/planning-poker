'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function JoinSession() {
    const [sessionId, setSessionId] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState('');
    const navigate = useRouter();

    const handleJoin = () => {
        if (!sessionId.trim()) {
            setError('Please enter a session code or link');
            return;
        }
        if (!displayName.trim()) {
            setError('Please enter your name');
            return;
        }

        // Extract ID if full URL is pasted
        let targetId = sessionId.trim();
        try {
            const url = new URL(targetId);
            const pathParts = url.pathname.split('/');
            // Expecting /session/ID
            const sessionIndex = pathParts.indexOf('session');
            if (sessionIndex !== -1 && pathParts[sessionIndex + 1]) {
                targetId = pathParts[sessionIndex + 1];
            }
        } catch (e) {
            // Not a URL, assume it's the ID
        }

        // Store identity for the session page to pick up
        localStorage.setItem('displayName', displayName);
        localStorage.setItem('role', 'voter'); // Default role

        // Redirect
        navigate.push(`/session/${targetId}`);
    };

    return (
        <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col font-display text-text-main-light dark:text-text-main-dark transition-colors duration-200">
            <header className="flex items-center justify-between whitespace-nowrap border-b border-border-light dark:border-border-dark px-6 lg:px-10 py-3 bg-surface-light dark:bg-surface-dark transition-colors duration-200">
                <div className="flex items-center gap-3">
                    <Link href="/" className="size-8 text-primary flex items-center justify-center rounded-lg bg-primary/10">
                        <span className="material-symbols-outlined text-2xl">style</span>
                    </Link>
                    <h2 className="text-text-main-light dark:text-text-main-dark text-lg font-bold leading-tight tracking-[-0.015em]">Planning Poker</h2>
                </div>
                <ThemeToggle />
            </header>
            <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
                <div className="w-full max-w-[520px] flex flex-col gap-6">
                    <div className="text-center flex flex-col gap-3 mb-2">
                        <h1 className="text-text-main-light dark:text-text-main-dark tracking-tight text-3xl sm:text-4xl font-bold leading-tight">Join Planning Session</h1>
                        <p className="text-text-sub-light dark:text-text-sub-dark text-base font-normal leading-relaxed max-w-md mx-auto">
                            Enter the code shared by your facilitator or paste the session link to start estimating.
                        </p>
                    </div>
                    <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-soft border border-border-light dark:border-border-dark p-6 sm:p-8 flex flex-col gap-6 transition-colors duration-200">
                        <div className="flex flex-col gap-2">
                            <label className="text-text-main-light dark:text-text-main-dark text-sm font-semibold leading-normal" htmlFor="session-code">
                                Session Code or Link
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-sub-light dark:text-text-sub-dark">
                                    <span className="material-symbols-outlined text-[20px]">link</span>
                                </div>
                                <input
                                    autoFocus
                                    className="flex w-full min-w-0 resize-none overflow-hidden rounded-lg text-text-main-light dark:text-text-main-dark focus:outline-0 focus:ring-2 focus:ring-primary/20 border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark focus:border-primary h-12 pl-10 pr-4 placeholder:text-text-sub-light dark:placeholder:text-text-sub-dark text-base font-normal leading-normal transition-all"
                                    id="session-code"
                                    placeholder="e.g., https://poker.app/session/123 or 123-456"
                                    type="text"
                                    value={sessionId}
                                    onChange={(e) => setSessionId(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-text-main-light dark:text-text-main-dark text-sm font-semibold leading-normal" htmlFor="user-name">
                                Your Name
                            </label>
                            <div className="flex gap-3">
                                <div className="shrink-0 size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg border border-primary/20 uppercase">
                                    {displayName ? displayName.substring(0, 2) : '??'}
                                </div>
                                <div className="flex-1 relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-sub-light dark:text-text-sub-dark">
                                        <span className="material-symbols-outlined text-[20px]">person</span>
                                    </div>
                                    <input
                                        className="flex w-full min-w-0 resize-none overflow-hidden rounded-lg text-text-main-light dark:text-text-main-dark focus:outline-0 focus:ring-2 focus:ring-primary/20 border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark focus:border-primary h-12 pl-10 pr-4 placeholder:text-text-sub-light dark:placeholder:text-text-sub-dark text-base font-normal leading-normal transition-all"
                                        id="user-name"
                                        type="text"
                                        defaultValue=""
                                        placeholder="Anonymous"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-text-sub-light dark:text-text-sub-dark mt-1">This is how you&apos;ll appear to other participants.</p>
                        </div>
                        {error && <p className="text-red-500 text-sm">{error}</p>}
                        <button onClick={handleJoin} className="flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-5 bg-primary hover:bg-primary-hover text-white text-base font-bold leading-normal tracking-[0.015em] transition-all shadow-md shadow-primary/20 active:scale-[0.98]">
                            <span className="mr-2">Join Session</span>
                            <span className="material-symbols-outlined text-xl">arrow_forward</span>
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
