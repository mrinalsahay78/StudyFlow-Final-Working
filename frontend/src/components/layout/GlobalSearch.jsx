import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import { api } from "../../lib/api";
import { useDebounced } from "../../hooks/useApi";

const TYPE_LABEL = {
  subject: "Subject",
  topic: "Topic",
  task: "Task",
  exam: "Exam",
  note: "Note",
  file: "File",
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const debounced = useDebounced(query, 220);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  useEffect(() => {
    let alive = true;
    if (debounced.trim().length < 2) {
      setResults([]);
      return () => {
        alive = false;
      };
    }
    setLoading(true);
    api(`/search?q=${encodeURIComponent(debounced.trim())}`)
      .then((data) => {
        if (alive) {
          setResults(data.results || []);
          setCursor(0);
        }
      })
      .catch(() => alive && setResults([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [debounced]);

  const go = (item) => {
    setOpen(false);
    setQuery("");
    // Server hrefs look like "#subjects?id=..." — map them onto the SPA router.
    const [path, query] = String(item.href || "").replace(/^#/, "").split("?");
    if (!path) return;
    navigate({ pathname: `/app/${path}`, search: query ? `?${query}` : "" });
  };

  return (
    <>
      <button className="search-trigger" onClick={() => setOpen(true)}>
        <Search size={15} />
        <span>Search subjects, topics, tasks, notes…</span>
        <kbd>⌘K</kbd>
      </button>
      {open && (
        <div className="search-overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="search-panel" role="dialog" aria-label="Search">
            <div className="search-input-row">
              <Search size={16} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your workspace…"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => Math.min(results.length - 1, c + 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(0, c - 1));
                  }
                  if (e.key === "Enter" && results[cursor]) go(results[cursor]);
                }}
              />
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close search">
                <X size={16} />
              </button>
            </div>
            <div className="search-results">
              {loading && <p className="muted small pad">Searching…</p>}
              {!loading && query.trim().length < 2 && (
                <p className="muted small pad">Type at least 2 characters to search.</p>
              )}
              {!loading && query.trim().length >= 2 && !results.length && (
                <p className="muted small pad">No matches for “{query.trim()}”.</p>
              )}
              {results.map((r, i) => (
                <button
                  key={`${r.type}-${r.id}`}
                  className={`search-result ${i === cursor ? "active" : ""}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(r)}
                >
                  <span className="search-result-type">{TYPE_LABEL[r.type] || r.type}</span>
                  <span className="search-result-title">{r.title}</span>
                  <span className="search-result-sub">{r.subtitle}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
