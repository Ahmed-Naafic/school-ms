const { Card, Badge } = window.SaxaabDesignSystem_624abb;

const services = [
  { icon: "HeadphonesIcon", title: "Managed IT support", desc: "Helpdesk, patching, and device management for your whole team — remote and on-site." },
  { icon: "NetworkIcon", title: "Network & infrastructure", desc: "Design, cabling, Wi-Fi, and monitoring for offices, warehouses, and branches." },
  { icon: "CloudIcon", title: "Cloud & hosting", desc: "Migration, backup, and day-to-day management of Microsoft 365 and cloud servers." },
  { icon: "ShieldIcon", title: "Security & compliance", desc: "Firewalls, endpoint protection, audits, and staff awareness training." },
  { icon: "MonitorIcon", title: "Hardware & procurement", desc: "Laptops, servers, and peripherals — sourced, configured, and delivered ready to use." },
  { icon: "ServerIcon", title: "Business systems", desc: "VoIP telephony, CCTV, access control, and the systems that keep operations moving." },
];

function SectionHead({ eyebrow, title, sub }) {
  return (
    <div style={{ maxWidth: 560, marginBottom: 40 }}>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 800, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--teal-600)", marginBottom: 10 }}>{eyebrow}</div>
      <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-2xl)", lineHeight: "var(--leading-snug)", color: "var(--text-heading)" }}>{title}</h2>
      {sub && <p style={{ margin: "10px 0 0", fontFamily: "var(--font-body)", fontSize: 15, lineHeight: "var(--leading-body)", color: "var(--text-muted)" }}>{sub}</p>}
    </div>
  );
}

function Services() {
  return (
    <section id="services" style={{ background: "var(--surface-page)" }}>
      <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "72px var(--gutter)" }}>
        <SectionHead eyebrow="Services" title="One partner for your whole stack" sub="From the cable in the wall to the cloud, we design, run, and support it." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {services.map((s) => {
            const I = window[s.icon];
            return (
              <Card key={s.title} hoverable>
                <div style={{ width: 46, height: 46, borderRadius: "var(--radius-md)", background: "var(--teal-50)", color: "var(--teal-600)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  <I size={22} />
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--text-heading)", marginBottom: 6 }}>{s.title}</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: "var(--leading-body)", color: "var(--text-muted)" }}>{s.desc}</div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Services, SectionHead });
