'use client';

import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="flex items-center justify-center size-9 rounded-lg hover:bg-background-light dark:hover:bg-background-dark transition-colors"
            aria-label="Toggle theme"
        >
            <span className="material-symbols-outlined text-text-sub-light dark:text-text-sub-dark">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
        </button>
    );
}
