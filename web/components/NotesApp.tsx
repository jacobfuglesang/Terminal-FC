"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Folder, Note } from "@/lib/notes";
import { COMPANIES } from "@/lib/menu";
import { type Draft, clearDraft, listDrafts, putDraft, rebaseDraft } from "@/lib/drafts";

type View = "all" | "none" | number;

const input = { background: "var(--inset)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 6, padding: "7px 10px" } as const;

class LoggedOut extends Error {}

// soft = ikke send brukeren til innlogging ved 401 (brukes ved lagring, så teksten ikke forsvinner)
async function api<T>(url: string, method = "GET", body?: unknown, soft = false): Promise<T> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) {
    if (soft) throw new LoggedOut("Ikke innlogget");
    window.location.href = `/login?neste=${encodeURIComponent(window.location.pathname)}`;
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
  const [saveState, setSaveState] = useState<"" | "lagrer" | "lagret" | "feil" | "utlogget">("");
  const [conflicts, setConflicts] = useState<Draft[]>([]);
  const [restored, setRestored] = useState(0);
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
    const started = Date.now();
    try {
      const { id, ...rest } = p;
      const saved = await api<Note>(`/api/notes/${id}`, "PATCH", rest, true);
      setNotes((all) => all.map((n) => (n.id === saved.id ? { ...n, updated_at: new Date(saved.updated_at).toISOString() } : n)));
      clearDraft(saved.id, started);
      rebaseDraft(saved.id, new Date(saved.updated_at).toISOString());
      setSaveState("lagret");
    } catch (e) {
      // Teksten ligger fortsatt i utkastet i nettleseren. Legg endringene tilbake i køen, så de ikke glemmes.
      pending.current = { ...p, ...pending.current };
      if (e instanceof LoggedOut) {
        setSaveState("utlogget");
      } else {
        setSaveState("feil");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), 5000); // nytt forsøk om litt (f.eks. ved nettbrudd)
      }
    }
  }, []);

  // Ulagret tekst fra forrige gang: lagres automatisk hvis notatet ikke er endret et annet sted i mellomtiden
  useEffect(() => {
    const drafts = listDrafts();
    if (!drafts.length) return;
    const byId = new Map(initial.notes.map((n) => [n.id, n]));
    const same = (d: Draft, n: Note) =>
      d.title === n.title && d.body === n.body && d.folder_id === n.folder_id && d.symbol === n.symbol && d.pinned === n.pinned;
    const later: Draft[] = [];
    const safe: Draft[] = [];
    for (const d of drafts) {
      const n = byId.get(d.id);
      if (n && same(d, n)) clearDraft(d.id);
      else if (n && new Date(n.updated_at).getTime() <= new Date(d.base).getTime() + 1000) safe.push(d);
      else later.push(d);
    }
    setConflicts(later);
    if (!safe.length) return;
    setNotes((all) => all.map((n) => {
      const d = safe.find((x) => x.id === n.id);
      return d ? { ...n, title: d.title, body: d.body, folder_id: d.folder_id, symbol: d.symbol, pinned: d.pinned } : n;
    }));
    void (async () => {
      let ok = 0;
      for (const d of safe) {
        const started = Date.now();
        try {
          const { id, title, body, folder_id, symbol, pinned } = d;
          const saved = await api<Note>(`/api/notes/${id}`, "PATCH", { title, body, folder_id, symbol, pinned }, true);
          setNotes((all) => all.map((n) => (n.id === saved.id ? { ...n, updated_at: new Date(saved.updated_at).toISOString() } : n)));
          clearDraft(id, started);
          rebaseDraft(id, new Date(saved.updated_at).toISOString());
          ok += 1;
        } catch (e) {
          if (e instanceof LoggedOut) setSaveState("utlogget");
        }
      }
      setRestored(ok);
    })();
  }, [initial.notes]);

  // Lagre før automatisk låsing eller utlogging
  useEffect(() => {
    const h = () => { if (timer.current) clearTimeout(timer.current); if (pending.current.id) void flush(); };
    window.addEventListener("tfc-before-lock", h);
    return () => window.removeEventListener("tfc-before-lock", h);
  }, [flush]);

  async function resolve(d: Draft, how: "mine" | "append" | "discard" | "new") {
    try {
      if (how === "discard") {
        clearDraft(d.id);
      } else if (how === "new") {
        const n = await api<Note>("/api/notes", "POST", { folder_id: d.folder_id, title: d.title, body: d.body });
        setNotes((all) => [{ ...n, updated_at: new Date(n.updated_at).toISOString() }, ...all]);
        clearDraft(d.id);
      } else {
        const server = notes.find((n) => n.id === d.id);
        const body = how === "append" && server
          ? `${server.body}\n\n--- Ulagret tekst fra denne PC-en (${when(new Date(d.ts).toISOString())}) ---\n${d.body}`
          : d.body;
        const patch = how === "append" ? { body } : { title: d.title, body, folder_id: d.folder_id, symbol: d.symbol, pinned: d.pinned };
        const saved = await api<Note>(`/api/notes/${d.id}`, "PATCH", patch);
        setNotes((all) => all.map((n) => (n.id === saved.id ? { ...saved, updated_at: new Date(saved.updated_at).toISOString() } : n)));
        clearDraft(d.id);
      }
      setConflicts((all) => all.filter((x) => x.id !== d.id));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const h = () => { if (pending.current.id) void flush(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [flush]);

  function edit(patch: Partial<Note>) {
    if (!note) return;
    setNotes((all) => all.map((n) => (n.id === note.id ? { ...n, ...patch } : n)));
    const m = { ...note, ...patch };
    putDraft({ id: m.id, title: m.title, body: m.body, folder_id: m.folder_id, symbol: m.symbol, pinned: m.pinned, base: note.updated_at });
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
    clearDraft(note.id);
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

  const banner = { padding: "10px 12px", borderRadius: 8, marginBottom: 12, border: "1px solid var(--line2)", background: "var(--inset)" } as const;

  return (
    <>
    {saveState === "utlogget" && (
      <div role="alert" style={{ ...banner, borderColor: "#F5C451" }}>
        Du er logget ut. Det du skrev er tatt vare på i denne nettleseren og lagres automatisk når du logger inn igjen.{" "}
        <a href="/login?neste=/notater" style={{ color: "#FF8A5B" }}>Logg inn igjen</a>
      </div>
    )}
    {restored > 0 && (
      <div role="status" style={banner}>
        Ulagret tekst fra forrige gang ble funnet og lagret ({restored} {restored === 1 ? "notat" : "notater"}).{" "}
        <button type="button" className="src" style={{ background: "none", border: 0, color: "var(--muted)" }} onClick={() => setRestored(0)}>Lukk</button>
      </div>
    )}
    {conflicts.map((d) => {
      const n = notes.find((x) => x.id === d.id);
      return (
        <div key={d.id} role="alert" style={{ ...banner, borderColor: "#F5C451" }}>
          {n ? (
            <>Du har ulagret tekst fra denne PC-en i «{d.title || "Uten tittel"}» ({when(new Date(d.ts).toISOString())}), men notatet er endret et annet sted etterpå ({when(n.updated_at)}).</>
          ) : (
            <>Du har ulagret tekst fra denne PC-en i «{d.title || "Uten tittel"}», men notatet er slettet.</>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {n ? (
              <>
                <button type="button" className="btn" onClick={() => void resolve(d, "append")}>Legg teksten til nederst</button>
                <button type="button" className="btn" onClick={() => void resolve(d, "mine")}>Bruk teksten fra denne PC-en</button>
                <button type="button" className="btn" onClick={() => void resolve(d, "discard")}>Behold versjonen i terminalen</button>
              </>
            ) : (
              <>
                <button type="button" className="btn" onClick={() => void resolve(d, "new")}>Gjenopprett som nytt notat</button>
                <button type="button" className="btn" onClick={() => void resolve(d, "discard")}>Forkast</button>
              </>
            )}
          </div>
          <details style={{ marginTop: 6 }}>
            <summary className="src" style={{ cursor: "pointer" }}>Vis den ulagrede teksten</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, marginTop: 6 }}>{d.body || "(tom)"}</pre>
          </details>
        </div>
      );
    })}
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
                {saveState === "lagrer" ? "Lagrer …" : saveState === "lagret" ? "Lagret" : saveState === "feil" ? "Ikke lagret ennå, teksten er tatt vare på i nettleseren" : saveState === "utlogget" ? "Logget ut, teksten er tatt vare på" : ""}
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
    </>
  );
}
