// Ulagret notattekst huskes i nettleseren til den er trygt lagret i databasen.
// Slik går ingenting tapt hvis innloggingen går ut midt i skrivingen, eller nettet faller ut.

export type Draft = {
  id: number;
  title: string;
  body: string;
  folder_id: number | null;
  symbol: string | null;
  pinned: boolean;
  ts: number; // når teksten sist ble endret her (ms)
  base: string; // tidspunktet notatet i databasen hadde da du begynte å skrive (updated_at)
};

const KEY = "tfc-note-drafts";

function readAll(): Record<string, Draft> {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}") as Record<string, Draft>;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Draft>) {
  try {
    if (Object.keys(all).length) window.localStorage.setItem(KEY, JSON.stringify(all));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Full eller sperret lagring (f.eks. privat modus): da fungerer alt som før, bare uten sikringen
  }
}

export function listDrafts(): Draft[] {
  return Object.values(readAll());
}

export function putDraft(d: Omit<Draft, "ts" | "base"> & { base: string }) {
  const all = readAll();
  const prev = all[d.id];
  all[d.id] = { ...d, base: prev?.base ?? d.base, ts: Date.now() };
  writeAll(all);
}

// Fjerner utkastet bare hvis det ikke er skrevet mer siden lagringen startet
export function clearDraft(id: number, savedFrom?: number) {
  const all = readAll();
  const d = all[id];
  if (!d) return;
  if (savedFrom !== undefined && d.ts > savedFrom) return;
  delete all[id];
  writeAll(all);
}

export function hasDraft(id: number): boolean {
  return Boolean(readAll()[id]);
}

// Etter en lagring mens du fortsatt skriver: utkastet bygger nå på den nye versjonen i databasen
export function rebaseDraft(id: number, base: string) {
  const all = readAll();
  if (!all[id]) return;
  all[id] = { ...all[id], base };
  writeAll(all);
}
