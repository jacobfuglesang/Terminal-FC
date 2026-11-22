"use client";

import { useEffect, useRef, useState } from "react";
import type { AisPos } from "@/lib/db";
import "leaflet/dist/leaflet.css";

const ZONES: Record<string, [number, number, number]> = {
  Alle: [20, 30, 2],
  Hormuz: [26, 56.5, 7],
  "Bab el-Mandeb": [13.3, 43.5, 7],
  Suez: [30.6, 32.5, 8],
  Singapore: [1.25, 104, 9],
  Gibraltar: [36, -5.6, 9],
  Dover: [51, 1.4, 9],
  Panama: [9.15, -79.8, 9],
  "Kapp det gode håp": [-34.6, 18.7, 7],
};
const COLOR: Record<string, string> = { tank: "#FF8A5B", last: "#5BA8FF", annet: "#6E7581", ukjent: "#6E7581" };

export default function AisMap({ ships }: { ships: AisPos[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const [zone, setZone] = useState("Alle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { worldCopyJump: true, zoomControl: true, attributionControl: true }).setView([20, 30], 2);
      // Gratis kartfliser uten nøkkel. CARTO krever nå nøkkel, så vi bruker Esri sitt mørkegrå kart,
      // og faller tilbake til OpenStreetMap (gjort mørkt med CSS) hvis Esri ikke svarer.
      const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
      const base = L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 16,
        attribution: 'Kart &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; OpenStreetMap',
      }).addTo(m);
      const labels = L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 }).addTo(m);
      let errors = 0;
      base.on("tileerror", () => {
        errors += 1;
        if (errors !== 4) return;
        m.removeLayer(base);
        m.removeLayer(labels);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 16,
          className: "osm-dark",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(m);
      });
      for (const s of ships) {
        L.circleMarker([s.lat, s.lon], { radius: s.kind === "tank" ? 4 : 3, color: COLOR[s.kind] ?? "#6E7581", weight: 1, fillOpacity: 0.85 })
          .bindTooltip(`${s.name || "Ukjent navn"} · ${s.kind === "tank" ? "tankskip" : s.kind === "last" ? "lasteskip" : "annet"} · ${s.sog ?? "–"} knop`)
          .addTo(m);
      }
      map.current = m;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [ships]);

  useEffect(() => {
    const z = ZONES[zone];
    if (map.current && z) map.current.setView([z[0], z[1]], z[2]);
  }, [zone]);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {Object.keys(ZONES).map((z) => (
          <button key={z} type="button" className="btn" aria-pressed={z === zone} onClick={() => setZone(z)}
            style={{ background: z === zone ? "#2A2E36" : undefined, borderColor: z === zone ? "#4A505A" : undefined, fontSize: 12 }}>{z}</button>
        ))}
      </div>
      <style>{`.osm-dark{filter:invert(1) hue-rotate(180deg) brightness(.85) contrast(.9)}`}</style>
      <div ref={el} style={{ height: 460, borderRadius: 8, background: "#0F1114" }} role="img" aria-label="Kart over skip i nøkkelområder" />
      <div className="src" style={{ display: "flex", gap: 14, marginTop: 8 }}>
        <span><span style={{ color: COLOR.tank }}>●</span> Tankskip</span>
        <span><span style={{ color: COLOR.last }}>●</span> Lasteskip (bulk, container, bil)</span>
        <span><span style={{ color: COLOR.annet }}>●</span> Annet eller ukjent type</span>
        <span style={{ marginLeft: "auto" }}>{ships.length} skip sett siste 2 døgn</span>
      </div>
    </div>
  );
}
