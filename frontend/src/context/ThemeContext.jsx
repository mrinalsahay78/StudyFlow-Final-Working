import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";

const ThemeContext = createContext(null);

const VALID = ["dark", "light", "system"];

function resolve(preference) {
  if (preference === "system") {
    if (typeof window === "undefined" || !window.matchMedia) return "dark";
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return preference === "light" ? "light" : "dark";
}

function readStored() {
  try {
    const value = localStorage.getItem("sf_theme");
    return VALID.includes(value) ? value : "dark";
  } catch {
    return "dark";
  }
}

export function ThemeProvider({ children }) {
  const { user, updateProfile } = useAuth();
  const [preference, setPreference] = useState(readStored);

  // The account setting wins once the user is loaded, but only when it differs.
  useEffect(() => {
    if (user?.theme && VALID.includes(user.theme) && user.theme !== preference) {
      setPreference(user.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolve(preference);
    try {
      localStorage.setItem("sf_theme", preference);
    } catch {
      /* storage can be disabled by the browser */
    }
  }, [preference]);

  useEffect(() => {
    if (preference !== "system" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      document.documentElement.dataset.theme = resolve("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const value = useMemo(() => {
    const apply = (next) => {
      const safe = VALID.includes(next) ? next : "dark";
      setPreference(safe);
      if (user) updateProfile({ theme: safe }).catch(() => {});
    };
    return {
      preference,
      resolved: resolve(preference),
      setTheme: apply,
      toggle: () => apply(resolve(preference) === "dark" ? "light" : "dark"),
    };
  }, [preference, user, updateProfile]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
