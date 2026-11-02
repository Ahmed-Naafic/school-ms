const { Button } = window.SaxaabDesignSystem_624abb;

function Wordmark({ inverse = false }) {
  return (
    <a href="#top" onClick={(e) => { e.preventDefault(); document.getElementById("top").scrollTo ? null : null; window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ display: "flex", alignItems: "baseline", gap: 8, textDecoration: "none" }}>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.01em", color: inverse ? "#fff" : "var(--navy-800)" }}>saxaab</span>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 11.5, fontWeight: 600, color: inverse ? "rgba(255,255,255,0.65)" : "var(--gray-500)" }}>trusted ICT solution</span>
    </a>
  );
}

function NavLink({ href, children }) {
  const [hover, setHover] = React.useState(false);
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        const el = document.querySelector(href);
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: "smooth" });
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: "var(--font-body)", fontSize: 14.5, fontWeight: 700, textDecoration: "none",
        color: hover ? "var(--teal-600)" : "var(--gray-700)",
        transition: "color var(--duration-fast) var(--ease-out)",
      }}
    >
      {children}
    </a>
  );
}

function Header({ onContact }) {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)",
      borderBottom: "1px solid var(--border-default)",
    }}>
      <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "0 var(--gutter)", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
        <Wordmark />
        <nav style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <NavLink href="#services">Services</NavLink>
          <NavLink href="#why">Why Saxaab</NavLink>
          <NavLink href="#contact">Contact</NavLink>
          <Button variant="primary" size="sm" onClick={onContact}>Talk to us</Button>
        </nav>
      </div>
    </header>
  );
}

Object.assign(window, { Header, Wordmark });
