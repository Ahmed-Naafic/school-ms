function WhySaxaab({ onContact }) {
  const { Button } = window.SaxaabDesignSystem_624abb;
  const points = [
    "One contract, one number to call — no vendor ping-pong",
    "Proactive monitoring: we usually see problems before you do",
    "Plain-language advice, honest quotes, no jargon walls",
    "Local engineers with 24/7 remote support behind them",
  ];
  return (
    <section id="why" style={{ background: "var(--navy-900)" }}>
      <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "72px var(--gutter)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 800, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--teal-500)", marginBottom: 10 }}>Why Saxaab</div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-2xl)", lineHeight: "var(--leading-snug)", color: "#fff" }}>Trusted means we answer for it.</h2>
          <p style={{ margin: "12px 0 24px", fontFamily: "var(--font-body)", fontSize: 15, lineHeight: "var(--leading-body)", color: "rgba(255,255,255,0.75)", maxWidth: "46ch" }}>
            We take end-to-end responsibility for your ICT — and we're measured on it.
          </p>
          <Button variant="accent" onClick={onContact}>Get a quote</Button>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {points.map((p) => (
            <li key={p} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "var(--radius-md)", padding: "14px 16px" }}>
              <span style={{ color: "var(--amber-500)", flex: "none", marginTop: 1 }}><window.CheckIcon size={18} /></span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 14.5, lineHeight: 1.5, color: "rgba(255,255,255,0.92)" }}>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

Object.assign(window, { WhySaxaab });
