import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { COOKIE, verifySession } from "@/lib/session";

export type Folder = { id: number; name: string };
export type Note = { id: number; folder_id: number | null; title: string; body: string; symbol: string | null; pinned: boolean; updated_at: string };

export async function authed(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE)?.value);
}

export const deny = () => NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });

let ready = false;
export async function db() {
  const q = sql();
  if (!ready) {
    await q`CREATE TABLE IF NOT EXISTS note_folders (id SERIAL PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await q`CREATE TABLE IF NOT EXISTS notes (id SERIAL PRIMARY KEY, folder_id INT REFERENCES note_folders(id) ON DELETE SET NULL, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', symbol TEXT, pinned BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    ready = true;
  }
  return q;
}

export async function listAll() {
  const q = await db();
  const folders = (await q`SELECT id, name FROM note_folders ORDER BY lower(name)`) as Folder[];
  const notes = (await q`SELECT id, folder_id, title, body, symbol, pinned, updated_at FROM notes ORDER BY pinned DESC, updated_at DESC`) as Note[];
  return { folders, notes: notes.map((n) => ({ ...n, updated_at: new Date(n.updated_at).toISOString() })) };
}

export const clip = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
