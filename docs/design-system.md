# Design system

The site's look is a dark "command console": it should feel like it belongs
to an RTS in the Supreme Commander line without giving up the density that
makes the data pages useful. Everything lives in `src/styles.css`; this is
the map of it.

## Tokens

All colour, type and shape comes from custom properties on `:root`. Use them
rather than literals, so a palette change reaches every page.

| Token                                              | Use                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--bg` → `--bg-raised` → `--bg-elevated`           | Page, panels, anything lifted off a panel (pickers, popovers).                                                                         |
| `--bg-sunken`                                      | Wells inside a panel: readouts, code paths, stat grids.                                                                                |
| `--bg-hover`                                       | Hover fill for rows and chips.                                                                                                         |
| `--border`, `--border-strong`                      | Hairlines; the strong one for controls and hovered edges.                                                                              |
| `--text`, `--text-dim`, `--text-faint`             | Body, secondary, and captions/placeholders.                                                                                            |
| `--accent` (+ `-strong`, `-ink`, `-soft`, `-glow`) | Ion cyan: actions, active state, focus. `-ink` is text _on_ accent.                                                                    |
| `--good`, `--bad`, `--warn` (+ `-soft`)            | Outcomes, deltas, sustain bars, notices.                                                                                               |
| `--alloy`, `--energy`                              | The two resources, wherever a cost is shown.                                                                                           |
| `--fc`                                             | Set inline to a faction's colour (`FACTION_COLOURS`) on a card, column head or panel; the component then lights itself in that colour. |
| `--font-display`, `--font-body`, `--font-mono`     | See below.                                                                                                                             |
| `--radius`, `--radius-lg`, `--cut`                 | Corner radius, and the chamfer size of octagon-cut shapes.                                                                             |

The accent is deliberately cyan so it never reads as a faction: EDA is green,
Chosen red, Guard amber.

## Type

- **Chakra Petch** (`--font-display`, 500–700) — headings, nav, small
  uppercase labels, and big numeric readouts. Tracked out (0.1–0.2em) when
  uppercase.
- **Inter** (`--font-body`) — body copy and every table of numbers; use
  `font-variant-numeric: tabular-nums` where figures line up.
- System monospace (`--font-mono`) for template ids and file paths.

Both faces are self-hosted from `@fontsource` packages (imported at the top
of `styles.css`), so no page load calls a third-party font host; the browser
only downloads the Latin subset unless a page needs another.

## Motifs

- **The octagon.** The logo's shape recurs as the chamfer on primary buttons
  (`.dl-btn`, `.btn.primary`, `.steam-signin`), step
  badges and tier pills, and as the faint outline in each masthead. Chamfers
  are done with `clip-path`, which also clips borders, so they are used on
  filled shapes; outlined panels keep a small radius instead.
- **Selection brackets.** Corner ticks (drawn with background gradients on a
  pseudo-element) mark the thing in focus: a hovered unit card, the
  calculator's verdict.
- **Faction light.** Anything faction-specific takes `--fc` and uses it for a
  top-edge light, a glow behind its icon, or a left rule.
- **Backdrop.** `body::before` draws a faint 40px blueprint grid under a
  horizon glow. Sticky strips are ~94% opaque with a blur, so content
  scrolling under them doesn't ghost through.

## Shared pieces

- `PageHead` / `HeadStat` (`src/components/PageHead.tsx`) — the masthead
  every top-level page opens with. It scrolls away; the `.toolbar` under it
  is what sticks, so sticky offsets (`--header-h + 36px`) are unchanged.
- `.toolbar` — 36px sticky strip: summary on the left (truncates), controls
  on the right.
- `.dl-btn` (solid) and `.dl-btn.ghost` (tinted) — download and primary
  actions. Use `ghost` when a list has many and only one should stand out.
- `.btn` (outlined) / `.btn.primary` (solid chamfer).
- `.chip[aria-pressed]`, `.mode-tabs` (segmented control), `.badge`.
- `.empty` — centred empty/unreachable state with a slowly turning octagon.

## Motion

Short and functional: hover lifts on cards, the nav's active bar, the detail
panel sliding in. Everything is disabled under
`prefers-reduced-motion: reduce`.

## Art from the developers

Generated by `npm run art` (see the README for the source and credit); the
page → screenshot mapping lives in `src/lib/art.ts`.

- **Masthead art.** `PageHead`'s `art` prop puts a presskit screenshot in
  `.page-head-art`, behind everything. It's desaturated and dimmed with a
  filter, then `.page-head::after` lays a scrim that is near-solid `--bg`
  under the text and thins to the right, so the art only really shows past
  the lede. On phones the scrim is even (the text spans the width) and
  `--art-focus` frames the subject. Pick crops with the subject right of
  centre; a subject under the title just turns into mud.
- **Faction emblems.** `FactionEmblem` draws the faction's emblem as a CSS
  mask filled with `--fc`, so it takes the colour token rather than a baked
  one. The mask sits on `::before`, which leaves `filter` on the span free
  for a glow. Used on the Units column heads and, large and faint, on the
  detail panel's stage.
- **Unit renders.** The detail stage shows the developers' 384px render at
  170px where one exists, else the game's 64px thumbnail at 150px.
