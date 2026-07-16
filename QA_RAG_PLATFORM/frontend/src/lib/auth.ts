"use client";

const TOKEN_KEY   = "qa_rag_token";
const USER_KEY    = "qa_rag_user";
const REFRESH_KEY = "qa_rag_refresh_token";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user" | "viewer";
  team_id: string | null;
  created_at: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function saveSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function saveRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_KEY, token);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function isAdmin(): boolean {
  return getUser()?.role === "admin";
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
