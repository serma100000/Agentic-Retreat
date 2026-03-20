'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Theme hook for dark mode toggle.
 * Persists preference in localStorage and respects system preference.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('openpulse-theme');
    if (stored === 'dark' || stored === 'light') {
      setThemeState(stored);
      document.documentElement.classList.toggle('dark', stored === 'dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setThemeState(prefersDark ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, []);

  const setTheme = useCallback((newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    localStorage.setItem('openpulse-theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme, mounted };
}

/**
 * Debounce a value by a given delay in milliseconds.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Auto-refresh hook that calls callback at a given interval.
 * Returns a function to manually trigger a refresh.
 */
export function useAutoRefresh(callback: () => void, intervalMs: number) {
  const callbackRef = useRef(callback);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const id = setInterval(() => {
      callbackRef.current();
      setLastRefresh(new Date());
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const refresh = useCallback(() => {
    callbackRef.current();
    setLastRefresh(new Date());
  }, []);

  return { refresh, lastRefresh };
}
