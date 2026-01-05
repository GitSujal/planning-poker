'use client';

import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function Home() {
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background-light dark:bg-background-dark font-display text-text-main-light dark:text-text-main-dark overflow-x-hidden selection:bg-primary/30">
      <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark px-6 py-4 md:px-10 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[28px]">style</span>
          </div>
          <h2 className="text-text-main-light dark:text-text-main-dark text-lg font-bold leading-tight tracking-tight">Planning Poker</h2>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button className="flex items-center justify-center overflow-hidden rounded-lg h-9 px-4 bg-background-light dark:bg-background-dark hover:bg-gray-200 dark:hover:bg-gray-700 text-text-main-light dark:text-text-main-dark text-sm font-bold transition-colors">
            <span className="truncate">How it works</span>
          </button>
        </div>
      </header>
      <main className="flex-grow flex flex-col items-center justify-center px-4 py-12 md:px-10">
        <div className="w-full max-w-[960px] flex flex-col items-center gap-10 md:gap-14">
          <div className="flex flex-col items-center text-center max-w-2xl gap-4">
            <h1 className="text-text-main-light dark:text-text-main-dark text-4xl md:text-5xl lg:text-6xl font-black leading-[1.1] tracking-[-0.033em]">
              Collaborative <span className="text-primary">Scrum Estimation</span>
            </h1>
            <p className="text-text-sub-light dark:text-text-sub-dark text-lg md:text-xl font-normal leading-relaxed max-w-lg">
              Simple, fast, and effective estimation for agile teams. No login required.
            </p>
          </div>
          <div className="w-full max-w-4xl bg-surface-light dark:bg-surface-dark rounded-2xl shadow-sm border border-border-light dark:border-border-dark overflow-hidden">
            <div className="flex flex-col md:flex-row">
              <div className="flex-1 p-8 md:p-12 flex flex-col items-center justify-center gap-6 hover:bg-background-light dark:hover:bg-background-dark/50 transition-colors">
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-bold text-text-main-light dark:text-text-main-dark">Start a New Room</h3>
                  <p className="text-sm text-text-sub-light dark:text-text-sub-dark">Become the facilitator</p>
                </div>
                <Link href="/create" className="flex w-full max-w-[280px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-6 bg-primary hover:bg-primary-hover text-white gap-2.5 text-base font-bold shadow-lg shadow-primary/20 transition-all active:scale-[0.98] decoration-0">
                  <span className="material-symbols-outlined text-[24px]">add_circle</span>
                  <span className="truncate">Start New Session</span>
                </Link>
              </div>
              <div className="relative flex items-center justify-center md:flex-col md:w-px bg-background-light dark:bg-background-dark">
                <div className="absolute inset-0 flex items-center justify-center md:flex-col">
                  <div className="w-full h-px md:w-px md:h-full bg-border-light dark:border-border-dark"></div>
                </div>
                <div className="relative z-10 bg-surface-light dark:bg-surface-dark p-2 rounded-full border border-border-light dark:border-border-dark text-xs font-bold text-text-sub-light dark:text-text-sub-dark uppercase tracking-widest">
                  OR
                </div>
              </div>
              <div className="flex-1 p-8 md:p-12 flex flex-col items-center justify-center gap-6 hover:bg-background-light dark:hover:bg-background-dark/50 transition-colors">
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-bold text-text-main-light dark:text-text-main-dark">Join Existing Room</h3>
                  <p className="text-sm text-text-sub-light dark:text-text-sub-dark">Enter a code or link</p>
                </div>
                <div className="w-full max-w-[320px]">
                  <label className="flex w-full items-center rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark focus-within:border-primary focus-within:ring-1 focus-within:ring-primary overflow-hidden h-12 transition-all">
                    <input className="peer h-full w-full bg-transparent px-4 text-sm text-text-main-light dark:text-text-main-dark placeholder:text-text-sub-light dark:placeholder:text-text-sub-dark focus:outline-none" placeholder="Enter Session ID..." type="text" />
                    <Link href="/join" className="h-full px-5 bg-background-light dark:bg-background-dark hover:bg-gray-200 dark:hover:bg-gray-700 border-l border-border-light dark:border-border-dark text-text-main-light dark:text-text-main-dark text-sm font-bold transition-colors flex items-center gap-2">
                      Join
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </Link>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer className="w-full border-t border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark py-6 text-center">
        <div className="max-w-[960px] mx-auto px-10 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-text-sub-light dark:text-text-sub-dark">
          <p>© {new Date().getFullYear()} Planning Poker. All rights reserved.</p>
          <div className="flex items-center gap-1">
            <span>Powered by</span>
            <span className="font-bold text-text-main-light dark:text-text-main-dark">VibePoker</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
