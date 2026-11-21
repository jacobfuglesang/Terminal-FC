// Enkle SVG-grafer uten eksterne biblioteker.

export function LineChart({ values, labels, height = 220, color = "#FF8A5B" }: { values: number[]; labels: string[]; height?: number; color?: string }) {
  if (values.length < 2) return <div className="empty">For lite data til graf ennå.</div>;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.1 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 800).toFixed(1)},${(270 - ((v - min) / (max - min)) * 260).toFixed(1)}`).join(" ");
  const f = (v: number) => v.toFixed(1).replace(".", ",");
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <div className="m" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 11, color: "#8A919C", height, textAlign: "right", minWidth: 34 }}>
          <span>{f(max)}</span>
          <span>{f((max + min) / 2)}</span>
          <span>{f(min)}</span>
        </div>
        <svg viewBox="0 0 800 280" preserveAspectRatio="none" style={{ flex: 1, minWidth: 0, height, display: "block", background: "#0F1114", borderRadius: 6 }} role="img" aria-label="Linjegraf">
          <line x1="0" y1="140" x2="800" y2="140" stroke="#1F2228" vectorEffect="non-scaling-stroke" />
          <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="m" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8A919C", margin: "6px 0 0 42px" }}>
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

export function Bars({ items }: { items: { label: string; value: number; sub?: string; highlight?: boolean }[] }) {
  if (items.length === 0) return <div className="empty">Ingen data ennå.</div>;
  const vals = items.map((i) => i.value);
  const lo = Math.min(...vals) * 0.9;
  const hi = Math.max(...vals);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 170, padding: 8, background: "#0F1114", borderRadius: 6 }}>
        {items.map((it) => (
          <div key={it.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, height: "100%" }}>
            <span className="m" style={{ fontSize: 10, color: "#A0A7B2" }}>{it.value.toFixed(1).replace(".", ",")}</span>
            <div style={{ width: "100%", maxWidth: 52, height: `${Math.max(4, ((it.value - lo) / (hi - lo || 1)) * 100)}%`, background: it.highlight ? "#FF8A5B" : "#3A3F48", borderRadius: "3px 3px 0 0" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, padding: "6px 8px 0" }}>
        {items.map((it) => (
          <div key={it.label} className="m" style={{ flex: 1, textAlign: "center", fontSize: 10, color: "#8A919C" }}>
            {it.label}
            {it.sub ? (
              <>
                <br />
                <span style={{ color: "#A0A7B2" }}>{it.sub}</span>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
