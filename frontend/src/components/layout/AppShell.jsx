import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  ChevronLeft,
  ClipboardList,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Layers,
  Library,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Timer,
  Trophy,
  X,
  Target,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { initials } from "../../lib/format";
import GlobalSearch from "./GlobalSearch";
import NotificationsBell from "./NotificationsBell";

const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/app/subjects", label: "Subjects & syllabus", icon: BookOpen },
      { to: "/app/tasks", label: "Tasks", icon: ClipboardList },
      { to: "/app/planner", label: "Planner", icon: CalendarDays },
      { to: "/app/focus", label: "Focus timer", icon: Timer },
    ],
  },
  {
    label: "Learn",
    items: [
      { to: "/app/quizzes", label: "Quizzes", icon: Layers },
      { to: "/app/flashcards", label: "Flashcards", icon: Brain },
      { to: "/app/notes", label: "Notes", icon: Library },
      { to: "/app/library", label: "Files", icon: FolderKanban },
      { to: "/app/assistant", label: "AI assistant", icon: Sparkles },
    ],
  },
  {
    label: "Engineering",
    items: [
      { to: "/app/engineering", label: "Engineering hub", icon: GraduationCap },
      { to: "/app/academics", label: "Academics", icon: Trophy },
      { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/app/achievements", label: "Achievements", icon: Target },
    ],
  },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sf_sidebar") === "collapsed");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem("sf_sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  const sidebar = (
    <aside className={clsx("sidebar", collapsed && "collapsed")}>
      <div className="sidebar-top">
        <NavLink to="/app" className="brand">
          <span className="brand-mark">✦</span>
          {!collapsed && (
            <span className="brand-text">
              StudyFlow<span className="brand-ai">AI</span>
            </span>
          )}
        </NavLink>
        <button
          className="icon-btn sidebar-collapse"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft size={16} className={collapsed ? "flip" : ""} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {NAV_GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            {!collapsed && <span className="nav-label">{group.label}</span>}
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => clsx("nav-item", isActive && "active")}
                title={collapsed ? label : undefined}
              >
                <Icon size={17} />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button className="nav-item" onClick={toggle} title="Toggle theme">
          {resolved === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          {!collapsed && <span>{resolved === "dark" ? "Light mode" : "Dark mode"}</span>}
        </button>
        <NavLink to="/app/settings" className={({ isActive }) => clsx("nav-item", isActive && "active")}>
          <Settings size={17} />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        <div className="sidebar-user">
          <span className="avatar">{initials(user?.name)}</span>
          {!collapsed && (
            <div className="sidebar-user-text">
              <strong>{user?.name}</strong>
              <span>{user?.course || "Student"}</span>
            </div>
          )}
          {!collapsed && (
            <button
              className="icon-btn"
              aria-label="Log out"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <div className="app-shell">
      <div className="sidebar-desktop">{sidebar}</div>
      {mobileOpen && (
        <div className="sidebar-mobile" onClick={() => setMobileOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>{sidebar}</div>
        </div>
      )}
      <div className="app-main">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <GlobalSearch />
          <div className="topbar-actions">
            <NavLink to="/app/focus" className="topbar-focus" title="Start a focus session">
              <Target size={15} />
              <span>Focus</span>
            </NavLink>
            <NotificationsBell />
            <NavLink to="/app/settings" className="topbar-avatar" aria-label="Profile settings">
              {initials(user?.name)}
            </NavLink>
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
      {mobileOpen && (
        <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X size={18} />
        </button>
      )}
    </div>
  );
}
