// Enkel signert innloggings-cookie (HMAC-SHA256). Ingen passord lagres i cookien.
export const COOKIE = "fs_session";
// Hvor lenge en innlogging varer, uansett aktivitet. Kan endres med LOGIN_SESSION_MINUTES i Vercel (5–720).
export function sessionMinutes(): number {
  const m = Number(process.env.LOGIN_SESSION_MINUTES ?? "90");
  return Number.isFinite(m) ? Math.min(720, Math.max(5, Math.round(m))) : 90;
}
// Låses etter så mange minutter uten aktivitet (mus, tastatur, berøring), og når fanen har vært skjult like lenge.
export function idleMinutes(): number {
  const m = Number(process.env.LOGIN_IDLE_MINUTES ?? "10");
  return Number.isFinite(m) ? Math.min(240, Math.max(1, Math.round(m))) : 10;
}

const enc = new TextEncoder();

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 24) throw new Error("SESSION_SECRET mangler eller er for kort (minst 24 tegn).");
  return s;
}

function b64url(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function createSession(): Promise<{ token: string; maxAge: number }> {
  const maxAge = sessionMinutes() * 60;
  const exp = Math.floor(Date.now() / 1000) + maxAge;
  const payload = `v1.${exp}`;
  return { token: `${payload}.${await sign(payload)}`, maxAge };
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = await sign(`${parts[0]}.${parts[1]}`);
  if (expected.length !== parts[2].length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts[2].charCodeAt(i);
  return diff === 0;
}
