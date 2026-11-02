# UI/UX Standards

Version: 1.2

---

# Purpose

This document defines the visual design system and interaction standards for the Web application (React, Vite, JavaScript, Tailwind CSS, per Technology-Decisions.md).

It does not define business rules or page-level workflows — those belong to each feature's Business Specification. It defines colors, typography, spacing, component behavior, and accessibility rules that every screen must follow, so every feature looks and behaves consistently, per Project-Constitution.md's Consistency principle.

---

# Source and Adaptation

This system is adapted from an uploaded design system ("Saxaab Design System"). One thing was deliberately **not** carried over, since it belongs to a different brand, not this project:

- Its ICT-services-specific example copy (e.g. sample headlines about infrastructure).

The Saxaab logo is temporarily in use as a placeholder brand mark in the Web application's sidebar, pending a real logo/brand identity decision by the Product Owner. Since the sidebar's surface flips from white (light mode) to navy (dark mode), two color variants of the same background-removed, cropped mark are kept and swapped by theme: `web/src/assets/saxaab-logo-light.png` (original navy/teal/amber colors, for the white light-mode sidebar) and `web/src/assets/saxaab-logo-dark.png` (navy elements recolored to white, for the navy dark-mode sidebar) — both derived from the original in `Saxaab Design System/assets/`.

What **was** carried over: the color palette, typography scale, spacing scale, shape/elevation/motion tokens, the fourteen-component library, and its accessibility and content-voice conventions. These are brand-agnostic mechanics, not tied to the Saxaab identity, and are adopted here as this project's design system.

**Implementation note:** the source components (reference copies under `Saxaab Design System/components/` at the repository root) are implemented with inline `style` objects and CSS custom properties. Technology-Decisions.md requires Tailwind CSS for the Web application. Do not copy the inline-style approach verbatim. Instead:

1. Add the tokens below to `web`'s Tailwind config (`theme.extend`) — colors, `fontFamily`, `fontSize`, `spacing`, `borderRadius`, `boxShadow`.
2. Rebuild each component in `web/src/shared/components/` using Tailwind utility classes that reference those theme values, preserving the same props, variants, and states described below.

The reference files remain useful as a behavioral and accessibility spec — what each component does and how it responds to interaction — not as code to paste in directly.

---

# Color

## Brand

| Token | Value | Use |
|---|---|---|
| `--navy-800` | `#1b3a5c` | Primary brand color — headings, primary buttons, primary surfaces |
| `--navy-900` | `#14304a` | Primary hover/pressed state, inverse surfaces (footers, dark bands) |
| `--navy-950` | `#0d1f30` | Deepest inverse accent, rarely used directly |
| `--navy-700` | `#24507c` | Lighter navy accent |
| `--navy-100` / `--navy-50` | `#dbe5ee` / `#eef3f7` | Tinted brand backgrounds |
| `--teal-500` | `#2ca6a4` | Accent — links, secondary actions, focus ring, icons, highlights |
| `--teal-600` / `--teal-700` | `#249a98` / `#1e807e` | Accent hover/pressed states |
| `--teal-100` / `--teal-50` | `#d9f0ef` / `#edf8f7` | Tinted accent backgrounds |
| `--amber-500` | `#e9a23b` | Highlight only — small doses (a stat number, one badge, an underline). Never a large surface. |
| `--amber-600` / `--amber-100` | `#cf8b28` / `#fbeedb` | Highlight hover / tinted background |

## Neutrals

| Token | Value | Use |
|---|---|---|
| `--gray-900` | `#23303c` | Body text |
| `--gray-700` | `#47555f` | Secondary text |
| `--gray-500` | `#7b8790` | Muted text, placeholders |
| `--gray-400` | `#98a4ac` | Muted/secondary text — dark surfaces only (see Dark Mode) |
| `--gray-300` | `#c3ccd2` | Default borders (strong) |
| `--gray-200` | `#dde3e7` | Default borders |
| `--gray-100` | `#eef1f3` | Sunken surfaces, disabled backgrounds |
| `--gray-50` | `#f7f9fa` | Page background |
| `--white` | `#ffffff` | Card surfaces |

## Semantic

| Token | Value | Background |
|---|---|---|
| `--success` | `#24906a` | `--success-bg` `#e2f3ec` |
| `--warning` | `#cf8b28` | `--warning-bg` `#fbeedb` |
| `--danger` | `#cf4444` | `--danger-bg` `#fae5e5` |
| `--info` | `#24507c` | `--info-bg` `#eef3f7` |

## Semantic Aliases

- `--surface-page` = gray-50, `--surface-card` = white, `--surface-sunken` = gray-100, `--surface-inverse` = navy-900.
- `--text-heading` = navy-900, `--text-body` = gray-900, `--text-muted` = gray-500, `--text-on-accent` = white.
- `--border-default` = gray-200, `--border-strong` = gray-300, `--focus-ring` = teal-500.
- `--link` = teal-600, `--link-hover` = teal-700.

## Rules

- Navy leads (headings, primary actions, primary surfaces). Teal accents (links, secondary actions, icons). Amber highlights sparingly — never a full section background or a primary button.
- No gradients, no background photography, no textures. Flat colors only.
- Every color pairing must meet WCAG AA contrast for its use (body text on its background, button label on its fill).

## Dark Mode

The Web application supports a user-toggleable dark mode (Tailwind `darkMode: 'class'`), implemented via `ThemeContext`/`useTheme()` (`web/src/shared/theme/ThemeContext.jsx`). The user's explicit choice is persisted to `localStorage` (key `sms.theme`); `prefers-color-scheme` is used only as the initial fallback when no explicit choice has been stored, and is never used to silently override a stored choice afterward.

**Surface ladder** (reuses existing navy shades — no new hex values for surfaces):

| Role | Light | Dark |
|---|---|---|
| Page background | `gray-50` | `navy-950` |
| Sidebar | `white` | `navy-950` |
| Card / Dialog panel / Toast panel / Header bar | `white` | `navy-900` |
| Sunken / hover / disabled bg / Tabs track | `gray-100` | `navy-800` |
| Default border | `gray-200` | `navy-700` |
| Strong border | `gray-300` | `gray-500` |
| Dialog backdrop | `navy-950/45` | `navy-950/70` |

**Text:**

| Role | Light | Dark |
|---|---|---|
| Heading | `navy-900` | `white` |
| Body | `gray-900` | `gray-100` |
| Secondary | `gray-700` | `gray-300` |
| Muted/hint | `gray-500` | `gray-400` |

**Semantic tints** (Badge tones, alert surfaces): dark mode replaces the light pastel `-bg` tokens with a translucent overlay of the same semantic `DEFAULT` color (e.g. `dark:bg-success/15 dark:text-success`) rather than the light tint, since the light tints assume a light backdrop.

**Documented exception to Principle #2 ("navy leads"):** in dark mode, `Button`/`IconButton` `primary` variant uses the same teal-500/teal-600 fill as the `accent` variant, instead of `navy-800`, because `navy-800` fails non-text contrast (WCAG 1.4.11, needs 3:1; measures ~1.15:1) against a dark navy page background. Navy still leads for headings, the sidebar, and card/dialog surfaces in dark mode — this exception applies to button *fills* only.

---

## Responsive Design

**Product Owner decision:** the Web application is an administrative system designed primarily for desktop and laptop use. It must also remain fully usable on tablets and smaller browser widths through responsive layouts. This is explicitly **not** a mobile-first redesign: phone users are served by the dedicated Flutter mobile applications (Phase 2, per the Development Roadmap). Tables are never replaced with card layouts, and no phone-specific administrative workflows are introduced on the Web application.

**Approved breakpoint:** Tailwind's default `lg` (1024px) is the single breakpoint that governs the sidebar's collapse behavior. At `lg` and above, the layout is unchanged from the original desktop design. Below `lg`, the sidebar becomes an off-canvas drawer.

- **Sidebar** (`web/src/app/Layout.jsx`): below `lg`, the `<aside>` is `fixed` and off-screen (`-translate-x-full`) until opened via a hamburger `IconButton` in the header, at which point it slides in (`translate-x-0`) over a dismissible backdrop, with its own close (`X`) control. At `lg` and above it reverts to `static`, in-flow, always-visible — identical to the pre-responsive behavior. The drawer auto-closes on every route change so it never lingers open over the next page.
- **Header**: the account email is hidden below `sm` (640px) to avoid crowding the hamburger/theme-toggle/sign-out controls on a narrow width; it reappears at `sm` and above.
- **Data tables** (Students, Classes, Schools, Accounts list pages): each `<table>` is wrapped in `overflow-x-auto` so a table wider than the viewport scrolls horizontally within its own container rather than clipping or forcing page-wide overflow. Tables themselves are never restructured into cards at narrow widths, per the Product Owner's explicit constraint above.
- **Page container spacing**: list/detail page outer padding is `px-4 py-8 sm:px-6` (was a flat `px-6`), so content isn't flush against the viewport edge on narrow widths.
- **Header/filter rows**: the title+action-button row and the Students filter row both use `flex-wrap` so controls reflow onto a second line instead of compressing when horizontal space is short.
- Forms and dashboards that already used a CSS grid (`SchoolDetailPage`, `PlatformStatisticsPage`) or a single centered card (`LoginPage` and the other Authentication pages) were already responsive by construction and needed no changes.

**Flex-item width blowout (found and fixed):** the content column in `Layout.jsx` (`flex flex-1 flex-col`, sibling to the sidebar) and `<main>` inside it are flex items whose default `min-width: auto` refuses to shrink below their content's intrinsic min-content width. A data table nested many levels deep (even one already wrapped in `overflow-x-auto`) was enough to force this flex item — and the whole page — wider than the viewport, producing a real, functional horizontal scrollbar with content (the Class filter, page description) genuinely clipped past the edge, not just a cosmetic overhang. Both `Layout.jsx` flex items now carry `min-w-0` so they can shrink to the viewport width; the nested `overflow-x-auto` wrappers then correctly do their job of scrolling only the table itself. `html`/`body` also carry `overflow-x: hidden` as a defense-in-depth backstop (e.g. against the sidebar's off-canvas drawer geometry), but the `min-w-0` fix is what actually eliminates the underlying overflow rather than just clipping its symptom.

---

# Typography

- Display font: **Quicksand** (headings, brand-forward moments) — weight 600–700, tight leading, `-0.01em` tracking.
- Body font: **Nunito Sans** (everything else) — weight 400/600, 15px base, 1.55 leading.
- Both are Google Fonts substitutes pending a licensed brand font decision; do not hardcode a different font without updating this document first.

## Scale

| Token | Size |
|---|---|
| `--text-xs` | 12px |
| `--text-sm` | 13.5px |
| `--text-base` | 15px (body default) |
| `--text-md` | 17px |
| `--text-lg` | 20px |
| `--text-xl` | 25px |
| `--text-2xl` | 32px |
| `--text-3xl` | 42px |
| `--text-4xl` | 56px |

Leading: `--leading-tight` 1.15 (large display), `--leading-snug` 1.3 (headings), `--leading-body` 1.55 (paragraphs). Eyebrow/label text: 12px, weight 700, `0.09em` letter-spacing, uppercase, teal — the only permitted uppercase usage besides that.

---

# Spacing & Layout

4px base scale: `--space-1` 4px, `--space-2` 8px, `--space-3` 12px, `--space-4` 16px, `--space-5` 24px, `--space-6` 32px, `--space-7` 48px, `--space-8` 64px, `--space-9` 96px.

Content container max-width 1120px, 24px gutters. Generous whitespace; major sections separated by `--space-8`/`--space-9` (64–96px).

---

# Shape, Elevation & Motion

- **Radius**: `--radius-sm` 8px (small controls), `--radius-md` 12px (inputs, tooltips), `--radius-lg` 18px (cards, dialogs), `--radius-pill` 999px (buttons, badges, tags, tabs). Generously rounded throughout — no sharp corners.
- **Shadow**: `--shadow-sm` for resting cards, `--shadow-md` on hover/elevated elements (toasts, unhovered dropdown), `--shadow-lg` for dialogs/modals.
- **Borders**: 1px, `--border-default` by default, `--border-strong` for emphasis.
- **Motion**: 120ms (`--duration-fast`, micro-interactions like button hover) or 200ms (`--duration-base`, card lifts, toggles), both with `--ease-out` (`cubic-bezier(0.2, 0.8, 0.3, 1)`). Hover darkens one shade or lifts an element 2px; press darkens further and nudges down 1px. No bounce, no infinite/looping animation.

---

# Iconography

Stroke icons, 2px weight, rounded caps (Lucide, or an equivalent stroke set if licensing requires a substitute — flag any substitution in the Technical Design of the feature that needs it). Teal on light surfaces, white on navy surfaces. Standard sizes: 16 / 20 / 24px. No emoji. No filled icon sets.

---

# Component Library

Fourteen components exist as a behavioral/accessibility reference (source: `Saxaab Design System/components/`), to be rebuilt in `web/src/shared/components/` using Tailwind utilities per the Implementation Note above.

| Component | Variants / Props | Notes |
|---|---|---|
| **Button** | `variant`: primary, accent, secondary, outline, ghost · `size`: sm/md/lg · `disabled` | Pill-shaped. Verb-first, sentence-case labels ("Save changes", never "Submit"). |
| **IconButton** | `variant`: primary, secondary, ghost, outline · `size`: sm/md/lg (32/40/48px) · `disabled` | Requires a `label` prop — rendered as `aria-label` and `title`, since there is no visible text. |
| **Badge** | `tone`: neutral, brand, accent, highlight, success, warning, danger | Small pill status indicator, not clickable. |
| **Tag** | optional `onRemove` | Removable chip; the remove control needs its own `aria-label="Remove"`. |
| **Card** | `padding`, `hoverable` | White surface, `radius-lg`, 1px border, `shadow-sm` resting / `shadow-md` + 2px lift on hover when `hoverable`. |
| **Dialog** | `open`, `title`, `description`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onClose` | Modal overlay; root must carry `role="dialog"` `aria-modal="true"`. Closes on backdrop click only when `onClose` is provided. |
| **Toast** | `tone`: neutral, success, warning, danger | Left accent bar communicates tone in addition to color, not color alone (see Accessibility). |
| **Tooltip** | `side`: top/bottom/left/right | Shown on hover; content marked `role="tooltip"`. |
| **Checkbox** | `checked`/`defaultChecked`, `disabled`, `onChange` | Supports controlled and uncontrolled use. |
| **Radio** | `checked`, `disabled`, `onChange`, `name` | Grouped via shared `name`. |
| **Select** | `label`, `options` (string or `{value, label}`), `disabled` | Native `<select>` with a custom chevron — keeps native keyboard/screen-reader behavior. |
| **Switch** | `checked`/`defaultChecked`, `disabled`, `onChange` | Same controlled/uncontrolled pattern as Checkbox. |
| **Tabs** | `tabs` (string[] or `{value,label}[]`), `value`/`defaultValue`, `onChange` | Pill segmented control. |
| **Input** | `label`, `hint`, `error`, `size`: sm/md, `disabled` | Error state overrides border color and replaces `hint` with the error message — never show both at once. |

## Interaction States (apply to every interactive component)

- **Disabled**: 0.45 opacity, `cursor: not-allowed`, no hover/press effects.
- **Focus**: 2px `--focus-ring` (teal) outline with 2px offset, on every interactive element, keyboard-reachable in the same order as visual layout.
- **Hover**: one-step color darken (e.g. navy-800 → navy-900, teal-500 → teal-600) or a 2px lift for cards.
- **Press**: darken further, translate down 1px.
- **Error** (form fields): border and helper text switch to `--danger`; the error message replaces any hint text rather than displaying alongside it.

---

# Accessibility

- Every icon-only control must have a `label` prop rendered as `aria-label` (and `title` for a mouse-hover tooltip), per IconButton and Tag's remove control.
- Dialogs use `role="dialog"` and `aria-modal="true"`. Tooltips use `role="tooltip"`.
- Never convey state by color alone — Toast pairs its tone color with a left accent bar and (when provided) a title; form errors pair color with an explicit error message, not just a red border.
- Focus must be visible on every interactive element (see Interaction States) — never remove a focus outline without providing an equivalent replacement.
- Native form elements (`<select>`, `<input type="checkbox/radio">`) are preferred over custom-built equivalents where behavior allows, to keep built-in keyboard and screen-reader support — Select wraps a native `<select>` rather than replacing it.
- Every color pairing meets WCAG AA contrast (see Color rules above).

---

# Content & Voice

- Plain, confident, professional. Second person where natural ("your students", "your school").
- Sentence case everywhere — headings, buttons, labels, menu items. The only uppercase usage is small eyebrow labels.
- Buttons are verb-first and specific: "Save changes", "Create school", "Invite teacher" — never "Submit" or "Click here."
- No emoji, anywhere. Numbers written as digits ("24 students", "99.9% uptime"), not spelled out.
- No hype, no unexplained jargon — if a technical term is unavoidable, explain it plainly.

---

# UI/UX Principles

1. Consistency over novelty — reuse an existing component before styling something new.
2. Navy leads, teal accents, amber highlights sparingly — never invert that ratio.
3. Every interactive element has a visible focus state and a disabled state.
4. Color is never the only signal — pair it with text, an icon, or a shape.
5. Sentence case and verb-first labels, everywhere, no exceptions.
6. Generous whitespace over dense layouts.
7. Motion is subtle and purposeful — never decorative or attention-seeking.
8. Native HTML form elements are preferred over custom-built equivalents.
9. No new color, font, spacing, or radius value is introduced outside the tokens defined here without updating this document first.
10. This document is the single source of truth for visual and interaction design — a component's implementation should never drift from what is written here.
11. Dark mode is a first-class, user-toggleable mode, not a superficial invert — every token pairing must independently meet the same WCAG AA bar as light mode, per the Dark Mode section above.
12. The Web application is responsive down to tablet widths (desktop/laptop-first, not mobile-first) — a single approved breakpoint governs the sidebar's collapse, per the Responsive Design section above. Phone-specific workflows belong to the Flutter mobile applications, never the Web application.
