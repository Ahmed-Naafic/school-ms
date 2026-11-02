const { Button, Badge } = window.SaxaabDesignSystem_624abb;

function Hero({ onContact }) {
  return (
    <section id="top" style={{ background: "var(--surface-card)", borderBottom: "1px solid var(--border-default)" }}>
      <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "80px var(--gutter) 72px", display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 48, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 800, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--teal-600)", marginBottom: 14 }}>Trusted ICT solution</div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-4xl)", lineHeight: "var(--leading-tight)", letterSpacing: "var(--tracking-display)", color: "var(--text-heading)" }}>
            IT that just works, so your team can.
          </h1>
          <p style={{ margin: "18px 0 0", fontFamily: "var(--font-body)", fontSize: "var(--text-md)", lineHeight: "var(--leading-body)", color: "var(--gray-700)", maxWidth: "48ch" }}>
            Saxaab manages your networks, devices, cloud, and support — one partner for your whole stack, with honest advice and answers when you call.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
            <Button variant="primary" size="lg" onClick={onContact}>Talk to us</Button>
            <Button variant="secondary" size="lg" onClick={() => {
              const el = document.querySelector("#services");
              if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: "smooth" });
            }}>See services</Button>
          </div>
          <div style={{ display: "flex", gap: 24, marginTop: 36, fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-muted)" }}>
            <span><b style={{ color: "var(--amber-600)", fontSize: 17 }}>24/7</b> support desk</span>
            <span><b style={{ color: "var(--amber-600)", fontSize: 17 }}>99.9%</b> uptime target</span>
            <span><b style={{ color: "var(--amber-600)", fontSize: 17 }}>15 min</b> avg response</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gray-50)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-lg)", padding: 32 }}>
          <img src="../../assets/saxaab-logo.png" alt="Saxaab — Trusted ICT solution" style={{ width: "100%", maxWidth: 340 }} />
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Hero });
