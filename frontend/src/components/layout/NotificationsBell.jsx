import React, { useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

/**
 * Notification feed derived server-side from real deadlines (overdue tasks,
 * exams within 3 days, cards due, today's plan, recent badges). Each item
 * carries a `#route` href which is mapped to the SPA route here.
 */
export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    api("/notifications")
      .then((d) => alive && setItems(d.items || []))
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const count = items.length;

  return (
    <div className="notifications" ref={ref}>
      <button className="icon-btn badge-btn" onClick={() => setOpen((v) => !v)} aria-label="Notifications">
        <Bell size={17} />
        {count > 0 && <span className="badge">{count > 9 ? "9+" : count}</span>}
      </button>
      {open && (
        <div className="notifications-panel">
          <header>
            <strong>Notifications</strong>
            <span className="muted small">{count ? `${count} active` : "Nothing pending"}</span>
          </header>
          <div className="notifications-list">
            {loading && <p className="muted small pad">Loading…</p>}
            {!loading && !count && (
              <div className="empty compact">
                <span className="empty-icon">
                  <BellOff size={16} />
                </span>
                <div>
                  <h4>All clear</h4>
                  <p>No overdue work, exams or cards due right now.</p>
                </div>
              </div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                className={`notification-item kind-${n.kind}`}
                onClick={() => {
                  setOpen(false);
                  // hrefs are "#tasks", "#exams?id=..." etc.
                  const raw = String(n.href || "").replace(/^#/, "");
                  if (raw) navigate(`/app/${raw}`);
                }}
              >
                <strong>{n.title}</strong>
                <span>{n.body}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
