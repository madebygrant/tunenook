---
name: Night radio
version: 1.0.0
description: >
  Design system for TuneNook, an offline player for local music files and playlists.
  A bedside radio with the lights off: deep ink, warm text, one lamp colour
  for the thing that is playing, and nothing that blinks.
mode: dark-only
colors:
  # Ink
  canvas: "#0a0c12"          # page background, sidebar on desktop
  canvas-deep: "#06080c"     # dock, topbar, drawer on phone
  surface: "#121622"         # panels, placeholder art, dialogs, toast
  surface-hover: "#181d2b"   # hovered rows
  border: "#1b2030"          # hairlines only
  border-strong: "#65708c"   # input and outlined control edges (4.0:1)
  # Text
  text: "#ece6da"
  text-muted: "#a39c90"
  text-subtle: "#8a847a"
  # Lamp: where you are
  lamp: "#e0a46a"
  lamp-bright: "#f2bd85"     # hover on lamp fills
  lamp-deep: "#b8803f"       # pressed; not for small text
  lamp-wash: "rgba(224, 164, 106, 0.1)"
  # Status
  danger: "#e07a6a"
typography:
  display: "'Syne', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  sans: "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  mono: "'Geist Mono', ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, monospace"
radius: 0
spacing: [4, 8, 12, 16, 20, 24, 32, 40]
shadow: none
---

# Night radio

## 1. Visual theme and atmosphere

TuneNook is used in two places: a phone in a dim room with one thumb, and a desk with a terminal open beside it. The phone case wins. The interface should be comfortable to look at at 1am and get out of the way at a desk.

Warmth comes from colour and type, not decoration. There are no gradients, shadows, glow or rounded corners. One warm lamp colour marks where you are; everything else recedes into ink.

Night radio comes from Podnook unchanged, so the two apps look like siblings.

## 2. Colour palette and roles

Contrast is WCAG against `canvas` unless noted.

| Token | Hex | Contrast | Role |
|---|---|---|---|
| `canvas` | `#0a0c12` | | Page background. Ink, not black. |
| `canvas-deep` | `#06080c` | | Dock, topbar, drawer on phone. |
| `surface` | `#121622` | | Panels, placeholder art, dialogs, toast. No border on it. |
| `surface-hover` | `#181d2b` | | Hovered table and log rows. |
| `border` | `#1b2030` | 1.2 | Hairlines only. |
| `border-strong` | `#65708c` | 4.0 (3.4 on hover rows) | Input and outlined control edges. Meets 3:1 for UI. |
| `text` | `#ece6da` | 15.7 | Titles, body, song titles. |
| `text-muted` | `#a39c90` | 7.2 | Descriptions, show names, secondary. |
| `text-subtle` | `#8a847a` | 5.3 (4.9 on surface) | Dates, durations, placeholders. |
| `lamp` | `#e0a46a` | 9.0 | The current song, progress fill, primary button fill (ink text, 9.0:1), focus ring, active nav bar. |
| `lamp-bright` | `#f2bd85` | 11.5 | Hover on lamp fills and outlined play buttons. |
| `lamp-deep` | `#b8803f` | 5.8 | Pressed state. Not for small text. |
| `lamp-wash` | lamp at 10% | | Current row and active nav background. |
| `danger` | `#e07a6a` | 6.7 | Errors, as text and edges, never a solid block. |

### Rules

1. Lamp means "where you are": the loaded song, its progress, the primary action and focus. Nothing else. Counts, links, secondary buttons and the shuffle and repeat toggles are never lamp.
2. One lamp fill per view, plus the dock's play button.
3. No tinted backgrounds except `lamp-wash` on the current row and the active nav item.

The lamp is amber, not rose. Rose (`#e09a8a`) sits too close to `danger`, so "playing" and "error" would read alike.

## 3. Typography

Syne (400, 500) for display, Figtree (300, 400, 500) for text and Geist Mono (400, 500) for values, bundled from `@fontsource`. Syne has no 300 weight, so display text renders at 400.

| Role | Face | Size / line | Weight | Use |
|---|---|---|---|---|
| `display` | Syne | clamp(32px, 6vw, 48px) / 1.05, -0.03em | 400 | Page titles |
| `h2` | Syne | 22px / 1.3 | 400 | Section headings |
| `title` | Sans | 16–17px / 1.35 | 400 | Song and tile titles |
| `body` | Sans | 16px / 1.55 | 400 | Descriptions, help copy |
| `small` | Sans | 14px / 1.5, tabular | 400 | Artist and album lines, tile notes |
| `button` | Sans | 14px / 1 | 500 | All buttons, sentence case |
| `label` | Sans | 13px / 1.4 | 500 | Form labels, filters, "Shows", table headers |
| `value` | Mono | 13px / 1.4, tabular | 400 | Durations, elapsed, counts, sizes |

No uppercase anywhere. Mono is for values that need to align or be scanned: durations, clock times, sizes. Short counts in prose ("6 songs") stay in sans with tabular figures, because small mono on ink reads thin and cold.

## 4. Components

Buttons, inputs, sidebar, dialogs, toast and focus follow Podnook's rules: three button variants, 40px (44px on touch), the left-to-right hover fill, `border-strong` input edges with a lamp focus edge, 2px lamp focus outline.

### Song row
64px row with a hairline below: 40px art (or the track number on album pages), title in `title`, "artist · album" in `small` muted, duration in `value`, and a More button. The whole row plays the list from that song; the loaded song's row gets `lamp-wash`, a 2px lamp bar and a lamp play or pause glyph over its art. Rows use `content-visibility: auto` so libraries in the thousands scroll smoothly.

### Song menu
A `surface` dialog (a bottom sheet on phone width) headed by the title and artist. Actions are full-width 48px text rows with hairlines: Play next, Add to queue, Add to playlist…, Go to album, then context actions (Move up or down and Remove from playlist, Remove from queue, Copy into TuneNook for linked songs, Remove from library…). Removals are in `danger` text and confirm first.

### Tiles
Albums and playlists use Podnook's show tiles: square art, title in `title`, a `small` note (artist and year, or song count and total time).

### Album and playlist header
120px art (72px on phone), display title, a `value` line of count and total time, then Play (lamp), Shuffle (secondary) and, on playlists, Add songs, Rename and Delete (ghost).

### Dock
Podnook's dock with Previous, Play and Next as the transport and shuffle and repeat toggles where the speed button was. Toggles are 40px icon buttons in `text-subtle`; on, they turn `text` with a 4px square under the icon. They are never lamp, because they are settings, not where you are. Under 400px the toggles move to the full player only.

### Add music
Panels on `surface`: Copy songs into TuneNook (Choose files is the lamp action; Choose a folder is secondary and hidden on iOS), Play a folder in place (Chromium only), and Storage. A running import shows above them as a panel with a `value` "n of m" line, a 2px progress track and Stop. The summary is one plain paragraph.

## 5. Layout

- Desktop: 240px sidebar, main column up to 1040px with 40px/48px padding, dock across the bottom.
- Under 960px: 56px `canvas-deep` topbar with the menu button. The sidebar becomes a 300px drawer that stops above the dock.

## 6. Depth

None. Layers separate by tone alone: `canvas-deep` under `canvas` under `surface`. No shadows, no borders on surfaces.

## 7. Motion

- Hover and state: 300ms, `cubic-bezier(0.2, 0, 0, 1)`.
- View change: 200ms fade.
- Dialog and toast: 240ms top-down reveal, instant exit.
- Nothing blinks or loops. Now playing is a static lamp mark (the play glyph and the wash), never animated bars.
- Reduced motion: no fade, reveal or drawer slide. Colour transitions stay.

## 8. Do's and don'ts

**Do**
- Keep lamp to where you are. If a lamp mark doesn't point at the current song, its progress, the primary action or focus, make it `text`.
- Put numbers in mono and prose in sans.
- Use the lamp button once per view; every other button is secondary or ghost.
- Write labels in sentence case from the listener's side.

**Don't**
- Uppercase or letter-space labels.
- Add a second accent, chips, badges or animated now-playing bars.
- Put a border on a surface, or a tint behind anything except the current row and active nav item.
