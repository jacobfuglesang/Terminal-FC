"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Folder, Note } from "@/lib/notes";
import { COMPANIES } from "@/lib/menu";

type View = "all" | "none" | number;

const input = { background: "var(--inset)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 6, padding: "7px 10px" } as const;

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) {
    window.location.href = "/login";
    throw new Error("Ikke innlogget");
  }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Feil ${r.status}`);
  return r.json();
}

function when(iso: string) {
  return new Date(iso).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });
}

export default function NotesApp({ initial }: { initial: { folders: Folder[]; notes: Note[] } }) {
  const [folders, setFolders] = useState<Folder[]>(initial.folders);
  const [notes, setNotes] = useState<Note[]>(initial.notes);
  const [view, setView] = useState<View>("all");
  const [sel, setSel] = useState<number | null>(initial.notes[0]?.id ?? null);
  const [q, setQ] = useState("");
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"" | "lagrer" | "lagret" | "feil">("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<Note> & { id?: number }>({});

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return notes.filter(
      (n) =>
        (view === "all" || (view === "none" ? n.folder_id === null : n.folder_id === view)) &&
        (!s || `${n.title} ${n.body}`.toLowerCase().includes(s)),
    );
  }, [notes, view, q]);

  const note = notes.find((n) => n.id === sel) ?? null;
  const count = (f: View) => notes.filter((n) => (f === "all" ? true : f === "none" ? n.folder_id === null : n.folder_id === f)).length;

  const flush = useCallback(async () => {
    const p = pending.current;
    if (!p.id) return;
    pending.current = {};
    setSaveState("lagrer");
    try {
      const { id, ...rest } = p;
      const saved = await api<Note>(`/api/notes/${id}`, "PATCH", rest);
      setNotes((all) => all.map((n) => (n.id === saved.id ? { ...n, updated_at: new Date(saved.updated_at).toISOString() } : n)));
      setSaveState("lagret");
    } catch {
      setSaveState("feil");
    }
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const h = () => { if (pending.current.id) void flush(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [flush]);

  function edit(patch: Partial<Note>) {
    if (!note) return;
    setNotes((all) => all.map((n) => (n.id === note.id ? { ...n, ...patch } : n)));
    if (pending.current.id && pending.current.id !== note.id) void flush();
    pending.current = { ...pending.current, ...patch, id: note.id };
    setSaveState("lagrer");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  }

  async function select(id: number) {
    if (pending.current.id) await flush();
    setSel(id);
    setConfirmDel(false);
  }

  async function addNote() {
    if (pending.current.id) await flush();
    try {
      const n = await api<Note>("/api/notes", "POST", { folder_id: typeof view === "number" ? view : null, title: "", body: "" });
      setNotes((all) => [{ ...n, updated_at: new Date(n.updated_at).toISOString() }, ...all]);
      setSel(n.id);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function removeNote() {
    if (!note) return;
    await api(`/api/notes/${note.id}`, "DELETE");
    pending.current = {};
    setNotes((all) => all.filter((n) => n.id !== note.id));
    setSel(null);
    setConfirmDel(false);
  }

  async function createFolder() {
    const name = (newFolder ?? "").trim();
    if (!name) return setNewFolder(null);
    try {
      const f = await api<Folder>("/api/folders", "POST", { name });
      setFolders((all) => [...all, f].sort((a, b) => a.name.localeCompare(b.name, "nb")));
      setView(f.id);
      setNewFolder(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function renameFolder() {
    if (typeof view !== "number" || !renaming?.trim()) return setRenaming(null);
    const f = await api<Folder>(`/api/folders/${view}`, "PATCH", { name: renaming.trim() });
    setFolders((all) => all.map((x) => (x.id === f.id ? f : x)));
    setRenaming(null);
  }

  async function deleteFolder() {
    if (typeof view !== "number") return;
    await api(`/api/folders/${view}`, "DELETE");
    setNotes((all) => all.map((n) => (n.folder_id === view ? { ...n, folder_id: null } : n)));
    setFolders((all) => all.filter((f) => f.id !== view));
    setView("all");
  }

  const navBtn = (v: View, label: string) => (
    <button key={String(v)} type="button" onClick={() => setView(v)} className="navlink" aria-current={view === v ? "page" : undefined}
      style={{ width: "100%", background: view === v ? "#1E2128" : "transparent", border: 0, justifyContent: "space-between", color: view === v ? "var(--text)" : undefined }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span className="src">{count(v)}</span>
    </button>
  );

  const folderName = typeof view === "number" ? folders.find((f) => f.id === view)?.name : view === "none" ? "Uten mappe" : "Alle notater";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "stretch" }}>
      <section className="panel" style={{ flex: "1 1 200px", maxWidth: 260 }} aria-label="Mapper">
        <div className="ph"><h2>Mapper</h2></div>
        {navBtn("all", "Alle notater")}
        {navBtn("none", "Uten mappe")}
        <div style={{ borderTop: "1px solid var(--line2)", margin: "8px 0" }} />
        {folders.map((f) => navBtn(f.id, f.name))}
        {newFolder === null ? (
          <button type="button" className="btn" style={{ marginTop: 8, width: "100%" }} onClick={() => setNewFolder("")}>+ Ny mappe</button>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void createFolder(); }} style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <input autoFocus value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Navn på mappe" aria-label="Navn på ny mappe" style={{ ...input, flex: 1, minWidth: 0 }} />
            <button type="submit" className="btn">Lag</button>
          </form>
        )}
      </section>

      <section className="panel" style={{ flex: "1 1 260px", maxWidth: 360 }} aria-label="Notater">
        <div className="ph">
          {renaming !== null ? (
            <form onSubmit={(e) => { e.preventDefault(); void renameFolder(); }} style={{ display: "flex", gap: 6, flex: 1 }}>
              <input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} aria-label="Nytt navn på mappen" style={{ ...input, flex: 1, minWidth: 0 }} />
              <button type="submit" className="btn">OK</button>
            </form>
          ) : (
            <h2 style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{folderName}</h2>
          )}
          <button type="button" className="btn" onClick={() => void addNote()}>+ Nytt</button>
        </div>
        {typeof view === "number" && renaming === null && (
          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <button type="button" className="src" style={{ background: "none", border: 0, padding: 0, color: "var(--muted)" }} onClick={() => setRenaming(folderName ?? "")}>Gi nytt navn</button>
            <button type="button" className="src" style={{ background: "none", border: 0, padding: 0, color: "#FF6B6B" }} onClick={() => void deleteFolder()}>Slett mappe</button>
          </div>
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk i notater" aria-label="Søk i notater" style={{ ...input, width: "100%", boxSizing: "border-box", marginBottom: 8 }} />
        {shown.length === 0 ? (
          <div className="empty">Ingen notater her ennå. Trykk «+ Nytt».</div>
        ) : (
          shown.map((n) => (
            <button key={n.id} type="button" onClick={() => void select(n.id)}
              style={{ display: "block", width: "100%", textAlign: "left", background: n.id === sel ? "#1E2128" : "transparent", border: 0, borderTop: "1px solid var(--line2)", padding: "9px 8px", color: "var(--text)", borderRadius: 6 }}>
              <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.pinned ? "📌 " : ""}{n.title || "Uten tittel"}</div>
              <div className="src" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {when(n.updated_at)} · {n.body.replace(/\s+/g, " ").slice(0, 60) || "Tomt"}
              </div>
            </button>
          ))
        )}
      </section>

      <section className="panel" style={{ flex: "999 1 420px", display: "flex", flexDirection: "column", minHeight: 480 }} aria-label="Notat">
        {!note ? (
          <div className="empty" style={{ margin: "auto" }}>Velg et notat, eller lag et nytt.</div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
              <select value={note.folder_id ?? ""} onChange={(e) => edit({ folder_id: e.target.value ? Number(e.target.value) : null })} aria-label="Mappe" style={input}>
                <option value="">Uten mappe</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <select value={note.symbol ?? ""} onChange={(e) => edit({ symbol: e.target.value || null })} aria-label="Selskap" style={input}>
                <option value="">Ikke knyttet til selskap</option>
                {COMPANIES.map((c) => <option key={c.symbol} value={c.symbol}>{c.name}</option>)}
              </select>
              <button type="button" className="btn" aria-pressed={note.pinned} onClick={() => edit({ pinned: !note.pinned })}>{note.pinned ? "Løsne" : "Fest øverst"}</button>
              <span className="src" style={{ marginLeft: "auto" }} aria-live="polite">
                {saveState === "lagrer" ? "Lagrer …" : saveState === "lagret" ? "Lagret" : saveState === "feil" ? "Kunne ikke lagre, prøv igjen" : ""}
              </span>
            </div>
            <input value={note.title} onChange={(e) => edit({ title: e.target.value })} placeholder="Tittel" aria-label="Tittel"
              style={{ ...input, fontSize: 18, fontWeight: 600, marginBottom: 10 }} />
            <textarea value={note.body} onChange={(e) => edit({ body: e.target.value })} placeholder="Skriv notatet her …" aria-label="Notat"
              style={{ ...input, flex: 1, minHeight: 320, lineHeight: 1.6, fontSize: 14, resize: "vertical", fontFamily: "inherit" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, alignItems: "center" }}>
              <span className="src">Sist endret {when(note.updated_at)}</span>
              {confirmDel ? (
                <span style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setConfirmDel(false)}>Avbryt</button>
                  <button type="button" className="btn" style={{ borderColor: "#FF6B6B", color: "#FF6B6B" }} onClick={() => void removeNote()}>Slett for godt</button>
                </span>
              ) : (
                <button type="button" className="btn" onClick={() => setConfirmDel(true)}>Slett notat</button>
              )}
            </div>
          </>
        )}
        {err && <p className="note" style={{ color: "#FF6B6B" }}>{err}</p>}
      </section>
    </div>
  );
}
