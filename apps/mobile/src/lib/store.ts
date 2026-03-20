import { create } from 'zustand';
import type {
  Service,
  Outage,
  User,
  NotificationPreferences,
} from '../navigation/types';
import * as api from './api';

interface AppState {
  // Data
  services: Service[];
  activeOutages: Outage[];
  watchlist: string[];

  // Auth
  user: User | null;
  isAuthenticated: boolean;

  // Connection
  wsConnected: boolean;

  // Notifications
  pushToken: string | null;
  notificationPreferences: NotificationPreferences;

  // UI
  theme: 'light' | 'dark' | 'auto';
  isLoading: boolean;
  error: string | null;

  // Actions - Data
  fetchServices: () => Promise<void>;
  fetchOutages: () => Promise<void>;
  fetchWatchlist: () => Promise<void>;

  // Actions - Reports
  submitReport: (
    serviceId: string,
    type: 'outage' | 'degraded' | 'operational',
    description?: string,
  ) => Promise<void>;

  // Actions - Auth
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;

  // Actions - Notifications
  setPushToken: (token: string | null) => void;
  updateNotificationPreferences: (
    prefs: Partial<NotificationPreferences>,
  ) => Promise<void>;

  // Actions - Watchlist
  toggleWatchlist: (serviceId: string) => Promise<void>;

  // Actions - Connection
  setWsConnected: (connected: boolean) => void;

  // Actions - UI
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  services: [],
  activeOutages: [],
  watchlist: [],
  user: null,
  isAuthenticated: false,
  wsConnected: false,
  pushToken: null,
  notificationPreferences: {
    outages: true,
    degraded: true,
    resolved: false,
    watchlistOnly: false,
  },
  theme: 'auto',
  isLoading: false,
  error: null,

  // Data actions
  fetchServices: async () => {
    set({ isLoading: true, error: null });
    try {
      const services = await api.getServices();
      set({ services, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch services',
        isLoading: false,
      });
    }
  },

  fetchOutages: async () => {
    set({ error: null });
    try {
      const activeOutages = await api.getActiveOutages();
      set({ activeOutages });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch outages',
      });
    }
  },

  fetchWatchlist: async () => {
    try {
      const watchlistServices = await api.getWatchlist();
      set({ watchlist: watchlistServices.map((s) => s.id) });
    } catch {
      // Watchlist fetch failure is non-critical
    }
  },

  // Report actions
  submitReport: async (serviceId, type, description) => {
    set({ error: null });
    try {
      await api.submitReport(serviceId, type, description);
      // Refresh outages after report
      await get().fetchOutages();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to submit report',
      });
      throw err;
    }
  },

  // Auth actions
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.login(email, password);
      const user: User = {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
        token: result.token,
      };
      set({ user, isAuthenticated: true, isLoading: false });

      // Register push token if available
      const { pushToken } = get();
      if (pushToken) {
        api.registerPushToken(pushToken).catch(() => {});
      }

      // Fetch watchlist after login
      get().fetchWatchlist();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Login failed',
        isLoading: false,
      });
      throw err;
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {
      // Logout API failure is acceptable
    }
    set({
      user: null,
      isAuthenticated: false,
      watchlist: [],
    });
  },

  setUser: (user) => {
    set({ user, isAuthenticated: user !== null });
  },

  // Notification actions
  setPushToken: (token) => {
    set({ pushToken: token });
    if (token && get().isAuthenticated) {
      api.registerPushToken(token).catch(() => {});
    }
  },

  updateNotificationPreferences: async (prefs) => {
    const current = get().notificationPreferences;
    const updated = { ...current, ...prefs };
    set({ notificationPreferences: updated });
    try {
      await api.updateNotificationPreferences(updated);
    } catch (err) {
      set({ notificationPreferences: current });
      throw err;
    }
  },

  // Watchlist actions
  toggleWatchlist: async (serviceId) => {
    const { watchlist } = get();
    const isWatched = watchlist.includes(serviceId);

    if (isWatched) {
      set({ watchlist: watchlist.filter((id) => id !== serviceId) });
      try {
        await api.removeFromWatchlist(serviceId);
      } catch {
        set({ watchlist }); // revert
      }
    } else {
      set({ watchlist: [...watchlist, serviceId] });
      try {
        await api.addToWatchlist(serviceId);
      } catch {
        set({ watchlist }); // revert
      }
    }
  },

  // Connection actions
  setWsConnected: (connected) => set({ wsConnected: connected }),

  // UI actions
  setTheme: (theme) => set({ theme }),
  clearError: () => set({ error: null }),
}));
