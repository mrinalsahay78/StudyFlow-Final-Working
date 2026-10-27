import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BookMarked, FolderOpen, Pin, Plus, Save, Search, Trash2 } from "lucide-react";
import { api, del, post, put } from "../lib/api";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { Card, CardHeader } from "../components/ui/Card";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";
import { formatDate } from "../lib/format";

const blank = { title: "", body: "", subjectId: "", folder: "", tags: "", bookmarked: false, pinned: false };

export default function Notes() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  const [subjects, setSubjects] = useState([]);
  const [folders, setFolders] = useState([]);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editor, setEditor] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (folder) params.set("folder", folder);
      const [notes, fold] = await Promise.all([
        api(`/library/notes?${params.toString()}`),
        api("/library/notes/folders"),
      ]);
      setState({ loading: false, error: null, items: notes.items || [] });
      setFolders(fold.items || []);
    } catch (error) {
      setState({ loading: false, error, items: [] });
    }
  }, [query, folder]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api("/subjects").then((d) => setSubjects(d.items || [])).catch(() => setSubjects([]));
  }, []);

  const selected = useMemo(
    () => state.items.find((n) => n._id === selectedId) || null,
    [state.items, selectedId],
  );

  useEffect(() => {
    if (selected) {
      setEditor({
        title: selected.title || "",
        body: selected.body || "",
        subjectId: selected.subjectId || "",
        folder: selected.folder || "",
        tags: (selected.tags || []).join(", "),
        bookmarked: Boolean(selected.bookmarked),
        pinned: Boolean(selected.pinned),
      });
    }
  }, [selected]);

  const subjectName = (id) => subjects.find((s) => String(s._id) === String(id))?.name;

  const startNew = () => {
    setSelectedId(null);
    setEditor(blank);
    setCreating(true);
  };

  const save = async () => {
    if (!editor.title.trim() && !editor.body.trim()) {
      toast.error("Add a title or some content first.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: editor.title.trim() || "Untitled note",
        body: editor.body,
        subjectId: editor.subjectId || null,
        folder: editor.folder.trim(),
        tags: editor.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 12),
        bookmarked: editor.bookmarked,
        pinned: editor.pinned,
      };
      if (creating) {
        const created = await post("/library/notes", body);
        toast.success("Note created");
        setCreating(false);
        setSelectedId(created._id);
      } else if (selected) {
        await put(`/library/notes/${selected._id}`, body);
        toast.success("Note saved");
      }
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (note) => {
    try {
      await del(`/library/notes/${note._id}`);
      toast.success("Note deleted");
      if (selectedId === note._id) {
        setSelectedId(null);
        setEditor(blank);
      }
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const toggleFlag = async (note, key) => {
    try {
      await put(`/library/notes/${note._id}`, { [key]: !note[key] });
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Knowledge base"
        title="Notes"
        subtitle="Your own words, searchable and organised by subject and folder."
        actions={
          <Button variant="primary" icon={Plus} onClick={startNew}>
            New note
          </Button>
        }
      />

      <div className="toolbar">
        <div className="input-row" style={{ maxWidth: 300 }}>
          <Search size={15} className="muted" />
          <Input
            placeholder="Search notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search notes"
          />
        </div>
        <Select value={folder} onChange={(e) => setFolder(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
      </div>

      <div className="notes-layout section-gap">
        <div className="notes-list">
          {state.error ? (
            <ErrorState error={state.error} onRetry={load} />
          ) : state.loading ? (
            <SkeletonRows rows={4} />
          ) : state.items.length === 0 ? (
            <Card>
              <EmptyState
                icon={BookMarked}
                title={query || folder ? "No notes match" : "No notes yet"}
                body={
                  query || folder
                    ? "Try clearing the search or folder filter."
                    : "Write summaries in your own words — that is what makes them stick."
                }
                action={
                  !query && !folder ? (
                    <Button variant="primary" icon={Plus} onClick={startNew}>
                      Write your first note
                    </Button>
                  ) : null
                }
              />
            </Card>
          ) : (
            state.items.map((note) => (
              <button
                key={note._id}
                className={`note-item${selectedId === note._id ? " active" : ""}`}
                onClick={() => {
                  setCreating(false);
                  setSelectedId(note._id);
                }}
              >
                <div className="row-between">
                  <strong className="small">{note.title || "Untitled note"}</strong>
                  <span className="row" style={{ gap: 2 }}>
                    {note.pinned ? <Pin size={12} /> : null}
                    {note.bookmarked ? <BookMarked size={12} /> : null}
                  </span>
                </div>
                <span className="muted tiny line-clamp-2">{(note.body || "").slice(0, 120)}</span>
                <span className="muted tiny">
                  {note.folder ? `${note.folder} · ` : ""}
                  {subjectName(note.subjectId) || "No subject"} · {formatDate(note.updatedAt)}
                </span>
              </button>
            ))
          )}
        </div>

        <Card className="notes-editor">
          {creating || selected ? (
            <>
              <div className="row-between">
                <CardHeader
                  title={creating ? "New note" : "Edit note"}
                  subtitle={creating ? "Not saved yet" : `Last saved ${formatDate(selected?.updatedAt)}`}
                />
                <div className="row" style={{ gap: 4 }}>
                  {selected ? (
                    <>
                      <button
                        className="icon-btn"
                        title="Pin"
                        onClick={() => toggleFlag(selected, "pinned")}
                      >
                        <Pin size={14} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Bookmark"
                        onClick={() => toggleFlag(selected, "bookmarked")}
                      >
                        <BookMarked size={14} />
                      </button>
                      <button className="icon-btn" title="Delete" onClick={() => remove(selected)}>
                        <Trash2 size={14} />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="form-grid">
                <Field label="Title" htmlFor="note-title">
                  <Input
                    id="note-title"
                    value={editor.title}
                    onChange={(e) => setEditor((ed) => ({ ...ed, title: e.target.value }))}
                    placeholder="Deadlock — four conditions"
                  />
                </Field>
                <div className="form-row">
                  <Field label="Subject" htmlFor="note-subject">
                    <Select
                      id="note-subject"
                      value={editor.subjectId}
                      onChange={(e) => setEditor((ed) => ({ ...ed, subjectId: e.target.value }))}
                    >
                      <option value="">No subject</option>
                      {subjects.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Folder" htmlFor="note-folder">
                    <Input
                      id="note-folder"
                      value={editor.folder}
                      onChange={(e) => setEditor((ed) => ({ ...ed, folder: e.target.value }))}
                      placeholder="Unit 2"
                      list="note-folders"
                    />
                    <datalist id="note-folders">
                      {folders.map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  </Field>
                </div>
                <Field label="Tags" htmlFor="note-tags" hint="Comma separated.">
                  <Input
                    id="note-tags"
                    value={editor.tags}
                    onChange={(e) => setEditor((ed) => ({ ...ed, tags: e.target.value }))}
                    placeholder="os, revision"
                  />
                </Field>
                <Field label="Body" htmlFor="note-body">
                  <Textarea
                    id="note-body"
                    rows={14}
                    value={editor.body}
                    onChange={(e) => setEditor((ed) => ({ ...ed, body: e.target.value }))}
                    placeholder="Write the idea, then the example, then the exception…"
                  />
                </Field>
                <div className="row-between">
                  <span className="muted tiny">
                    <FolderOpen size={12} /> {editor.folder || "No folder"}
                  </span>
                  <Button variant="primary" icon={Save} loading={saving} onClick={save}>
                    {creating ? "Create note" : "Save note"}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              icon={BookMarked}
              title="Pick a note, or start a new one"
              body="Your notes live next to your syllabus — each one can be tied to a subject and folder."
              action={
                <Button variant="primary" icon={Plus} onClick={startNew}>
                  New note
                </Button>
              }
            />
          )}
        </Card>
      </div>
    </div>
  );
}
