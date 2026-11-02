# Saxaab Design System

**Saxaab — Trusted ICT solution.** Saxaab is an ICT (Information & Communications Technology) solutions brand. The design system supports its marketing website and general brand collateral: professional, trustworthy, approachable technology services.

## Sources
- `uploads/add-a-small-tagline-text--trusted-ict-solution--di.png` — the only provided source: the Saxaab logo (interlinked circles mark in navy + teal with an amber swoosh; rounded lowercase wordmark; gray tagline "Trusted ICT solution").
- No codebase, Figma file, or brand guidelines were provided. Everything beyond the logo (palette values, type choices, components, UI kit) is **derived from the logo** and standard practice — treat it as a proposal to refine with the client.

## Brand essence
- Interlinked circles = connection, partnership, networks. The amber swoosh adds warmth/energy.
- Personality: dependable, modern, human. "Trusted" is the operative word — calm navy authority, teal freshness, a single warm highlight.

## CONTENT FUNDAMENTALS
No source copy was provided; these rules are authored for the brand and should be validated:
- Voice: plain, confident, service-minded. Second person ("your infrastructure", "we manage it"). No hype, no jargon walls — explain ICT plainly.
- Sentence case everywhere (headings, buttons, labels). The only ALL-CAPS is small eyebrow labels (letter-spaced).
- Short declarative headlines: "IT that just works." / "One partner for your whole stack."
- Buttons are verb-first: "Talk to us", "Get a quote", "See services". Never "Submit" / "Click here".
- No emoji. Numbers written as digits ("24/7 support", "99.9% uptime").
- Tagline is always lowercase-ish sentence style: "Trusted ICT solution".

## VISUAL FOUNDATIONS
- **Color**: Navy `--navy-800 #1b3a5c` is the primary (headings, primary buttons, footer). Teal `--teal-500 #2ca6a4` is the accent (links, secondary actions, icons, highlights). Amber `--amber-500 #e9a23b` is a *highlight only* — small doses (stat numbers, underline strokes, one badge per view), never large surfaces. Neutrals are cool slate grays; page background `--gray-50 #f7f9fa`, cards white.
- **Type**: Display = Quicksand (rounded geometric, matches wordmark), 600–700 weight, tight leading, slight negative tracking. Body = Nunito Sans 400/600, 15px base, 1.55 leading. Eyebrows: 12px, 700, `letter-spacing: .09em`, uppercase, teal. *(Both are Google-Fonts substitutes — no brand font files were provided.)*
- **Shape**: generously rounded — 12px default radius, 18px cards, pill buttons/badges — echoing the circular mark. No sharp corners.
- **Backgrounds**: flat colors only. White cards on gray-50 pages; navy-900 for footer/inverse bands. No gradients, no textures, no background photography (none provided).
- **Borders & shadows**: hairline `1px var(--gray-200)` borders; soft navy-tinted shadows (`--shadow-sm/md/lg`). Cards = white + 1px border + shadow-sm, hover lifts to shadow-md.
- **Motion**: subtle. 120–200ms ease-out fades/lifts. Hover: darken one step (navy-800→navy-900, teal-500→teal-600) or lift card 2px. Press: darken + translateY(1px). No bounces, no infinite loops.
- **Focus**: 2px teal ring (`--focus-ring`) with 2px offset, on all interactive elements.
- **Layout**: 1120px max container, 24px gutters, 4/8px spacing scale. Generous whitespace; sections separated by 64–96px.
- **Imagery**: none provided. Use neutral placeholders; if photography is added later, prefer cool-toned, candid workplace/technology imagery. Never AI-ish gradient art.

## ICONOGRAPHY
- No icon assets were provided. The system uses **Lucide** from CDN (stroke icons, 2px weight, rounded caps — matches the rounded brand geometry). Load: `<script src="https://unpkg.com/lucide@latest"></script>` then `lucide.createIcons()`, or inline copied SVGs.
- Icon color: teal on light surfaces, white on navy. Sizes 16/20/24. No emoji, no filled icon sets.
- **Substitution flag**: if the brand has its own icon set, replace Lucide.

## Logo usage
- `assets/saxaab-logo.png` — full lockup (mark + wordmark + tagline) on off-white. It is a raster with a light background: use only on white/gray-50 surfaces. No transparent or reversed version exists — **ask the client for SVG/transparent/white variants**. On navy surfaces, set the brand name in Quicksand 700 white instead.

## Intentional additions
- Standard component set (Button, IconButton, Input, Select, Checkbox, Radio, Switch, Card, Badge, Tag, Tabs, Dialog, Toast, Tooltip) — no source inventory existed, so a from-scratch set was authored.
- Lucide icon substitution (see Iconography).

## Index
- `styles.css` — global entry; imports everything in `tokens/`.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `fonts.css`.
- `assets/saxaab-logo.png` — logo lockup.
- `guidelines/` — specimen cards shown in the Design System tab.
- `components/actions/` — Button, IconButton. `components/forms/` — Input, Select, Checkbox, Radio, Switch. `components/display/` — Card, Badge, Tag. `components/navigation/` — Tabs. `components/feedback/` — Dialog, Toast, Tooltip.
- `ui_kits/website/` — Saxaab marketing site (interactive index.html + section JSX).
- `SKILL.md` — agent skill entry point.
