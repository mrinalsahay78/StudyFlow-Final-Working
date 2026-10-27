import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { get, post, put, setToken } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await get("/auth/me");
      setUser(data.user);
      return data.user;
    } catch (err) {
      if (err.status === 401) {
        setToken(null);
        setUser(null);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const token = typeof localStorage !== "undefined" && localStorage.getItem("sf_token");
      if (!token) {
        if (alive) setLoading(false);
        return;
      }
      await refresh();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    setError("");
    const data = await post("/auth/login", { email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    setError("");
    const data = await post("/auth/register", payload);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await post("/auth/logout", {});
    } catch {
      /* the local session is cleared regardless */
    }
    setToken(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const data = await put("/auth/profile", payload);
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, setError, login, register, logout, refresh, updateProfile }),
    [user, loading, error, login, register, logout, refresh, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
