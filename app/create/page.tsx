'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';

interface TaskWithDescription {
    title: string;
    description?: string;
}

export default function CreateSession() {
    const [tasks, setTasks] = useState<TaskWithDescription[]>([]);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskDescription, setNewTaskDescription] = useState('');
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [hostName, setHostName] = useState('');
    const [sessionName, setSessionName] = useState('Weekly Sprint Planning');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const navigate = useRouter();

    const addTask = () => {
        if (!newTaskTitle.trim()) return;
        setTasks([...tasks, {
            title: newTaskTitle.trim(),
            description: newTaskDescription.trim() || undefined
        }]);
        setNewTaskTitle('');
        setNewTaskDescription('');
        setShowTaskForm(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent, field: 'title' | 'description') => {
        if (e.key === 'Enter' && field === 'title' && !e.shiftKey) {
            e.preventDefault();
            if (newTaskTitle.trim()) {
                // Move to description or add task
                const descInput = document.getElementById('task-description') as HTMLTextAreaElement;
                if (descInput) descInput.focus();
            }
        } else if (e.key === 'Enter' && field === 'description' && e.ctrlKey) {
            e.preventDefault();
            addTask();
        }
    };

    const deleteTask = (index: number) => {
        const newTasks = tasks.filter((_, i) => i !== index);
        setTasks(newTasks);
    };

    const handleCreate = async () => {
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
                body: JSON.stringify({ hostName, sessionMode: 'open' })
            });

            if (!res.ok) throw new Error('Unable to create session');

            const data = await res.json();

            // Set session persistence
            document.cookie = `hostToken=${data.hostToken}; path=/`;
            localStorage.setItem('displayName', hostName);
            localStorage.setItem('role', 'voter');

            // Store tasks for the new session
            if (tasks.length > 0) {
                localStorage.setItem(`pendingTasks_${data.sessionId}`, JSON.stringify(tasks));
            }

            navigate.push(`/session/${data.sessionId}`);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-background-light dark:bg-background-dark text-text-main-light dark:text-text-main-dark font-display antialiased flex flex-col min-h-screen">
            <header className="sticky top-0 z-50 bg-surface-light/90 dark:bg-surface-dark/90 backdrop-blur-md border-b border-border-light dark:border-border-dark px-4 sm:px-10 py-3">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="size-8 text-primary flex items-center justify-center bg-primary/10 rounded-lg">
                            <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>style</span>
                        </Link>
                        <h2 className="text-xl font-bold tracking-tight text-text-main-light dark:text-text-main-dark">Planning Poker</h2>
                    </div>
                    <ThemeToggle />
                </div>
            </header>
            <main className="flex-grow flex justify-center py-8 px-4 sm:px-6">
                <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    <div className="lg:col-span-8 flex flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-text-main-light dark:text-text-main-dark">Create New Session</h1>
                            <p className="text-text-sub-light dark:text-text-sub-dark text-lg">Define your tasks and prepare the room for your team.</p>
                        </div>

                        {/* Host Name Input */}
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6 shadow-sm">
                            <label className="flex flex-col gap-2">
                                <span className="text-sm font-semibold uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Your Name</span>
                                <div className="relative">
                                    <input
                                        className="w-full bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg px-4 py-3 text-lg font-medium focus:ring-2 focus:ring-primary focus:border-primary transition-shadow placeholder:text-text-sub-light/50 dark:placeholder:text-text-sub-dark/50"
                                        placeholder="e.g. Alex"
                                        type="text"
                                        value={hostName}
                                        onChange={(e) => setHostName(e.target.value)}
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-sub-light dark:text-text-sub-dark material-symbols-outlined">person</span>
                                </div>
                            </label>
                            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                        </div>

                        {/* Session Name */}
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6 shadow-sm">
                            <label className="flex flex-col gap-2">
                                <span className="text-sm font-semibold uppercase tracking-wider text-text-sub-light dark:text-text-sub-dark">Session Name</span>
                                <div className="relative">
                                    <input
                                        className="w-full bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg px-4 py-3 text-lg font-medium focus:ring-2 focus:ring-primary focus:border-primary transition-shadow placeholder:text-text-sub-light/50 dark:placeholder:text-text-sub-dark/50"
                                        placeholder="e.g. Sprint 42 Planning"
                                        type="text"
                                        value={sessionName}
                                        onChange={(e) => setSessionName(e.target.value)}
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-sub-light dark:text-text-sub-dark material-symbols-outlined">edit</span>
                                </div>
                            </label>
                        </div>

                        {/* Tasks Queue */}
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm flex flex-col overflow-hidden">
                            <div className="flex items-center justify-between p-6 border-b border-border-light dark:border-border-dark bg-background-light/50 dark:bg-background-dark/50">
                                <h3 className="text-lg font-bold">Tasks Queue</h3>
                                <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">{tasks.length} Items</span>
                            </div>
                            <div className="divide-y divide-border-light dark:divide-border-dark" id="task-list">
                                {tasks.length === 0 && !showTaskForm && (
                                    <div className="p-8 text-center text-text-sub-light dark:text-text-sub-dark italic">
                                        No tasks added yet. Add one below to get started.
                                    </div>
                                )}
                                {tasks.map((task, idx) => (
                                    <div key={idx} className="group flex items-start justify-between p-4 hover:bg-background-light/50 dark:hover:bg-background-dark/30 transition-colors">
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className="cursor-grab text-text-sub-light dark:text-text-sub-dark hover:text-text-main-light dark:hover:text-text-main-dark drag-handle mt-1">
                                                <span className="material-symbols-outlined">drag_indicator</span>
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-base font-bold text-text-main-light dark:text-text-main-dark">{task.title}</p>
                                                {task.description && (
                                                    <p className="text-sm text-text-sub-light dark:text-text-sub-dark mt-1">{task.description}</p>
                                                )}
                                            </div>
                                        </div>
                                        <button onClick={() => deleteTask(idx)} className="p-2 rounded-lg text-text-sub-light hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                            <span className="material-symbols-outlined text-[20px]">delete</span>
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Add Task Form */}
                            {showTaskForm && (
                                <div className="p-4 bg-background-light/30 dark:bg-background-dark/30 border-t border-border-light dark:border-border-dark">
                                    <div className="flex flex-col gap-3">
                                        <input
                                            className="flex-1 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg px-4 py-3 text-base focus:ring-2 focus:ring-primary focus:border-primary transition-shadow placeholder:text-text-sub-light/50 dark:placeholder:text-text-sub-dark/50"
                                            placeholder="Task title (required)"
                                            type="text"
                                            value={newTaskTitle}
                                            onChange={(e) => setNewTaskTitle(e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, 'title')}
                                            autoFocus
                                        />
                                        <textarea
                                            id="task-description"
                                            className="flex-1 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-lg px-4 py-3 text-base focus:ring-2 focus:ring-primary focus:border-primary transition-shadow placeholder:text-text-sub-light/50 dark:placeholder:text-text-sub-dark/50 resize-none"
                                            placeholder="Description (optional, Ctrl+Enter to add)"
                                            rows={3}
                                            value={newTaskDescription}
                                            onChange={(e) => setNewTaskDescription(e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, 'description')}
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={addTask}
                                                disabled={!newTaskTitle.trim()}
                                                className="flex-1 px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
                                            >
                                                Add Task
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowTaskForm(false);
                                                    setNewTaskTitle('');
                                                    setNewTaskDescription('');
                                                }}
                                                className="px-6 py-2 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-main-light dark:text-text-main-dark font-bold rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Add Task Button */}
                            {!showTaskForm && (
                                <div className="p-4 bg-background-light/30 dark:bg-background-dark/30 border-t border-border-light dark:border-border-dark">
                                    <button
                                        onClick={() => setShowTaskForm(true)}
                                        className="w-full group flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border-light dark:border-border-dark rounded-xl text-text-sub-light dark:text-text-sub-dark hover:border-primary hover:text-primary hover:bg-primary/5 transition-all duration-200"
                                    >
                                        <span className="material-symbols-outlined group-hover:scale-110 transition-transform">add_circle</span>
                                        <span className="font-medium">Add New Task</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="lg:col-span-4 flex flex-col gap-6 lg:sticky lg:top-24">
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark p-6 shadow-md border-t-4 border-t-primary">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex flex-col">
                                    <span className="text-sm text-text-sub-light dark:text-text-sub-dark">Estimated Duration</span>
                                    <span className="font-bold text-lg">~45 mins</span>
                                </div>
                            </div>
                            <button
                                onClick={handleCreate}
                                disabled={loading}
                                className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3.5 px-6 rounded-lg shadow-lg shadow-primary/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                <span>{loading ? 'Creating...' : 'Begin Session'}</span>
                                <span className="material-symbols-outlined">arrow_forward</span>
                            </button>
                            <p className="text-center text-xs text-text-sub-light dark:text-text-sub-dark mt-4">
                                You will be redirected to the estimation board.
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
