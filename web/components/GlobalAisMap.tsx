"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

// [lat, lon, type, størrelse, lastet, fart, kurs, navn, destinasjon, minutter siden, område]
type Ship = [number, number, string, string | null, boolean | null, number | null, number | null, string, string, number, string | null];

const VIEWS: Record<string, [number, number, number]> = {
  Verden: [20, 40, 2], Hormuz: [26, 56.3, 7], "Rødehavet/Bab el-Mandeb": [15, 42, 6], Suez: [30.6, 32.5, 8], Singapore: [1.3, 103.9, 9],
  "Kina øst": [31, 122, 6], "Nord-Europa": [52.5, 3.5, 6], "US Gulf": [28.5, -93, 6], Panama: [9.15, -79.7, 8], Brasil: [-21, -40.5, 6],
  "Australia vest": [-20, 117.5, 6], "Kapp det gode håp": [-34.6, 18.7, 6],
};
const COLOR: Record<string, string> = { tank: "#FF8A5B", last: "#5BA8FF", ukjent: "#7A818C" };
const TYPE: Record<string, string> = { tank: "Tankskip", last: "Lasteskip", ukjent: "Ukjent type" };
const SIZES = ["VLCC", "Suezmax", "Aframax/LR2", "MR/LR1", "Liten tanker", "Capesize/ULCV", "Panamax/Kamsarmax", "Supramax/Ultramax", "Handysize", "Lite lasteskip"];

const sel = { background: "var(--inset)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px", fontSize: 12 } as const;

export default function GlobalAisMap() {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  const Lref = useRef<typeof import("leaflet") | null>(null);
  const [ships, setShips] = useState<Ship[] | null>(null);
  const [err, setErr] = useState("");
  const [view, setView] = useState("Verden");
  const [types, setTypes] = useState<string[]>(["tank", "last"]);
  const [size, setSize] = useState("alle");
  const [load, setLoad] = useState("alle");
  const [speed, setSpeed] = useState("alle");
  const [hours, setHours] = useState(24);
  const [q, setQ] = useState("");

  useEffect(() => {
    setShips(null);
    fetch(`/api/ais?timer=${hours}`).then(async (r) => {
      if (r.status === 401) return void (window.location.href = "/login?neste=/trafikk");
      const d = await r.json();
      setShips(d.ships ?? []);
    }).catch(() => setErr("Fikk ikke hentet skipsposisjoner."));
  }, [hours]);

  const shown = useMemo(() => {
    if (!ships) return [];
    const s = q.trim().toLowerCase();
    return ships.filter((x) =>
      types.includes(x[2]) &&
      (size === "alle" || x[3] === size) &&
      (load === "alle" || (load === "lastet" ? x[4] === true : load === "ballast" ? x[4] === false : x[4] === null)) &&
      (speed === "alle" || (speed === "går" ? (x[5] ?? 0) >= 0.7 : x[5] !== null && x[5] < 0.7)) &&
      (!s || x[7].toLowerCase().includes(s) || x[8].toLowerCase().includes(s)));
  }, [ships, types, size, load, speed, q]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      Lref.current = L;
      const m = L.map(el.current, { worldCopyJump: true, preferCanvas: true }).setView([20, 40], 2);
      const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
      const base = L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 16, attribution: 'Kart &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; OpenStreetMap · Skip: aisstream.io',
      }).addTo(m);
      const labels = L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 }).addTo(m);
      let errors = 0;
      base.on("tileerror", () => {
        errors += 1;
        if (errors !== 4) return;
        m.removeLayer(base);
        m.removeLayer(labels);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 16, className: "osm-dark",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
      });
      layer.current = L.layerGroup().addTo(m);
      map.current = m;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const L = Lref.current, g = layer.current;
    if (!L || !g) return;
    g.clearLayers();
    const renderer = L.canvas({ padding: 0.3 });
    for (const s of shown) {
      const c = COLOR[s[2]] ?? "#7A818C";
      const laden = s[4];
      L.circleMarker([s[0], s[1]], {
        renderer, radius: s[3] === "VLCC" || s[3] === "Capesize/ULCV" ? 4.5 : 3, color: c, weight: 1.2,
        fillColor: c, fillOpacity: laden === false ? 0.08 : 0.85,
      }).bindTooltip(
        `<b>${s[7] || "Ukjent navn"}</b><br>${TYPE[s[2]] ?? s[2]}${s[3] ? ` · ${s[3]}` : ""}<br>` +
        `${laden === true ? "Lastet (anslått)" : laden === false ? "Ballast (anslått)" : "Last ukjent"} · ${s[5] ?? "–"} knop` +
        `${s[8] ? `<br>Destinasjon: ${s[8]}` : ""}<br>Sist sett for ${s[9] < 90 ? `${s[9]} min` : `${Math.round(s[9] / 60)} t`} siden`,
      ).addTo(g);
    }
  }, [shown, ships]);

  useEffect(() => {
    const v = VIEWS[view];
    if (map.current && v) map.current.setView([v[0], v[1]], v[2]);
  }, [view]);

  const count = (t: string) => shown.filter((s) => s[2] === t).length;
  const ladenN = shown.filter((s) => s[4] === true).length, ballastN = shown.filter((s) => s[4] === false).length;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {Object.keys(VIEWS).map((z) => (
          <button key={z} type="button" className="btn" aria-pressed={z === view} onClick={() => setView(z)}
            style={{ background: z === view ? "#2A2E36" : undefined, borderColor: z === view ? "#4A505A" : undefined, fontSize: 12 }}>{z}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8, alignItems: "center" }}>
        {(["tank", "last", "ukjent"] as const).map((t) => (
          <label key={t} className="src" style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input type="checkbox" checked={types.includes(t)} onChange={(e) => setTypes((x) => (e.target.checked ? [...x, t] : x.filter((y) => y !== t)))} />
            <span style={{ color: COLOR[t] }}>●</span> {TYPE[t]}
          </label>
        ))}
        <select value={size} onChange={(e) => setSize(e.target.value)} style={sel} aria-label="Størrelse">
          <option value="alle">Alle størrelser</option>
          {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={load} onChange={(e) => setLoad(e.target.value)} style={sel} aria-label="Lastet eller ballast">
          <option value="alle">Lastet og ballast</option><option value="lastet">Bare lastet</option><option value="ballast">Bare ballast</option><option value="ukjent">Last ukjent</option>
        </select>
        <select value={speed} onChange={(e) => setSpeed(e.target.value)} style={sel} aria-label="Fart">
          <option value="alle">All fart</option><option value="går">Underveis</option><option value="stille">Ligger stille (ankret/venter)</option>
        </select>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))} style={sel} aria-label="Sist sett">
          <option value={6}>Sett siste 6 t</option><option value={24}>Sett siste 24 t</option><option value={72}>Sett siste 3 døgn</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk skip eller destinasjon" aria-label="Søk skip eller destinasjon" style={{ ...sel, minWidth: 180 }} />
      </div>
      <style>{`.osm-dark{filter:invert(1) hue-rotate(180deg) brightness(.85) contrast(.9)}`}</style>
      <div ref={el} style={{ height: 560, borderRadius: 8, background: "#0F1114" }} role="img" aria-label="Kart over tank- og lasteskip" />
      <div className="src" style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
        {err ? <span style={{ color: "#FF6B6B" }}>{err}</span> : ships === null ? <span>Henter skip …</span> : (
          <>
            <span>{shown.length.toLocaleString("nb-NO")} skip vist</span>
            <span><span style={{ color: COLOR.tank }}>●</span> {count("tank")} tank</span>
            <span><span style={{ color: COLOR.last }}>●</span> {count("last")} last</span>
            <span>Fylt prikk = lastet ({ladenN}), hul prikk = ballast ({ballastN})</span>
          </>
        )}
      </div>
    </div>
  );
}
