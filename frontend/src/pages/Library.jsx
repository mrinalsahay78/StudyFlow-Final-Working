import React, { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from "lucide-react";
import { api, del, uploadFile, API_BASE } from "../lib/api";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import { Field, Select } from "../components/ui/Field";
import { Card, CardHeader } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Pill } from "../components/ui/Progress";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";
import { fileSize, formatDate } from "../lib/format";

function humanSize(bytes) {
  if (typeof fileSize === "function") return fileSize(bytes);
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export default function Library() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  const [subjects, setSubjects] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api("/library/files");
      setState({ loading: false, error: null, items: data.items || [] });
    } catch (error) {
      setState({ loading: false, error, items: [] });
    }
  }, []);

  useEffect(() => {
    load();
    api("/subjects").then((d) => setSubjects(d.items || [])).catch(() => setSubjects([]));
  }, [load]);

  const subjectName = (id) => subjects.find((s) => String(s._id) === String(id))?.name;

  const upload = async () => {
    if (!file) {
      toast.error("Choose a file first.");
      return;
    }
    setUploading(true);
    try {
      // Multipart uploads bypass the JSON helper but go through the same base
      // URL, so VITE_API_URL is honoured exactly as it is everywhere else.
      const data = await uploadFile(file, subjectId || undefined);
      toast.success(`Uploaded ${data.originalName || data.name || "file"}`);
      setUploadOpen(false);
      setFile(null);
      setSubjectId("");
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const download = async (item) => {
    try {
      const token = localStorage.getItem("sf_token");
      const res = await fetch(`${API_BASE}/library/files/${item._id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Could not open the file");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const remove = async (item) => {
    try {
      await del(`/library/files/${item._id}`);
      toast.success("File deleted");
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Private library"
        title="Files & documents"
        subtitle="Only you can read these — every download re-checks ownership on the server."
        actions={
          <Button variant="primary" icon={Upload} onClick={() => setUploadOpen(true)}>
            Upload file
          </Button>
        }
      />

      {state.error ? (
        <ErrorState error={state.error} onRetry={load} />
      ) : state.loading ? (
        <SkeletonRows rows={4} />
      ) : state.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Paperclip}
            title="Your library is empty"
            body="Upload PDFs, notes or question papers. Text is extracted so they can be searched and fed to the assistant."
            action={
              <Button variant="primary" icon={Upload} onClick={() => setUploadOpen(true)}>
                Upload your first file
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="stack">
          {state.items.map((item) => (
            <Card key={item._id}>
              <div className="row-between">
                <div className="row" style={{ gap: 10 }}>
                  <span className="stat-icon">
                    {item.mimeType?.startsWith("image/") ? <ImageIcon size={16} /> : <FileText size={16} />}
                  </span>
                  <div className="stack" style={{ gap: 2 }}>
                    <strong className="small">{item.originalName}</strong>
                    <span className="muted tiny">
                      {humanSize(item.size)} · {formatDate(item.createdAt)}
                      {subjectName(item.subjectId) ? ` · ${subjectName(item.subjectId)}` : ""}
                    </span>
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {item.hasText ? <Pill tone="success">Searchable</Pill> : <Pill tone="neutral">No text</Pill>}
                  <button className="icon-btn" title="Open" onClick={() => download(item)}>
                    <Download size={14} />
                  </button>
                  <button className="icon-btn" title="Delete" onClick={() => remove(item)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload a file">
        <div className="form-grid">
          <div
            className="drop-zone"
            style={{ minHeight: 110, cursor: "pointer" }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          >
            <Upload size={18} />
            <span className="small">{file ? file.name : "Click to choose a PDF, text, markdown, CSV or image"}</span>
            <span className="muted tiny">Max 25 MB · one file at a time</span>
            <input
              ref={inputRef}
              type="file"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              accept=".pdf,.txt,.md,.csv,image/*"
            />
          </div>
          <Field label="Subject" htmlFor="upload-subject" hint="Optional — makes it easier to find later.">
            <Select id="upload-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">No subject</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="row-between">
            <Button variant="ghost" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Upload} loading={uploading} onClick={upload}>
              Upload
            </Button>
          </div>
        </div>
      </Modal>

      <Card className="section-gap">
        <CardHeader title="Privacy" />
        <p className="muted small">
          Files are stored per account and served only through an authenticated route that re-checks ownership — a
          shared link cannot expose them. Deleting a file removes the stored bytes as well as the record.
        </p>
      </Card>
    </div>
  );
}
