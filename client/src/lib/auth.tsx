import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, getToken, post, registerUnauthenticatedHandler, setToken } from './api';
import type { Role, User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string, passwordConfirmation: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(getToken()));
  const queryClient = useQueryClient();

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUserState(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<{ data: User }>('/auth/me');
      setUserState(res.data.data);
    } catch {
      setToken(null);
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    registerUnauthenticatedHandler(() => {
      setUserState(null);
      queryClient.clear();
    });
    void refreshUser();
  }, [refreshUser, queryClient]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await post<{ token: string; user: User }>('/auth/login', { email, password });
    setToken(data.token);
    setUserState(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, password_confirmation: string) => {
    const data = await post<{ token: string; user: User }>('/auth/register', { name, email, password, password_confirmation });
    setToken(data.token);
    setUserState(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // token may already be invalid; local sign-out still proceeds
    }
    setToken(null);
    setUserState(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      refreshUser,
      setUser: setUserState,
      can: (...roles: Role[]) => Boolean(user && roles.includes(user.role)),
    }),
    [user, loading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
