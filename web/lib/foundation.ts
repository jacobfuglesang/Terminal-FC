import fs from "node:fs";
import path from "node:path";

// Fundamentet: et fast dokument om aksjehandel og trading i shippingsektoren (web/content/fundament.md).
// Ligger i repoet, så det slettes aldri og har full versjonshistorikk. Claude oppdaterer det én gang i måneden.
export type Section = { id: string; title: string; level: number; text: string };

export function readFoundation(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "content", "fundament.md"), "utf8");
  } catch {
    return "";
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-zæøå0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Deler dokumentet i avsnitt etter ##-overskrifter (### holdes inne i avsnittet). */
export function sections(md = readFoundation()): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const line of md.split("\n")) {
    const h = /^(##)\s+(.*)$/.exec(line);
    if (h) {
      if (cur) out.push(cur);
      cur = { id: slug(h[2]), title: h[2].trim(), level: 2, text: "" };
      continue;
    }
    if (cur) cur.text += line + "\n";
  }
  if (cur) out.push(cur);
  return out;
}

/** De avsnittene som passer best til et spørsmål (enkel ordtelling), innenfor et tegnbudsjett. Kjerneprinsippene er alltid med. */
export function relevantSections(query: string, budget = 5000): string {
  const secs = sections();
  if (!secs.length) return "";
  const words = [...new Set((query.toLowerCase().match(/[a-zæøå0-9]{4,}/g) ?? []))];
  const core = secs.find((s) => /kjerneprinsipp/i.test(s.title));
  const scored = secs
    .filter((s) => s !== core)
    .map((s) => ({ s, score: words.reduce((a, w) => a + (s.title.toLowerCase().includes(w) ? 3 : 0) + (s.text.toLowerCase().split(w).length - 1), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  let out = core ? `## ${core.title}\n${core.text.slice(0, 1500)}\n` : "";
  for (const { s } of scored) {
    const block = `## ${s.title}\n${s.text}\n`;
    if (out.length + block.length > budget) {
      if (out.length < budget * 0.6) out += block.slice(0, budget - out.length);
      break;
    }
    out += block;
  }
  return out.trim();
}
