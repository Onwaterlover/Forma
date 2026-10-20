# Brand identity

**Name:** Forma (Polish "form / shape"; reads naturally in German and English too). It can be renamed with `NEXT_PUBLIC_APP_NAME`.

**Idea:** calm, consistent progress. The mark is an almost-closed ring (a steady rhythm, the habit loop) with a dot marking the next step.

## Palette

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f4f2ed` warm stone | `#121413` | page background |
| `--surface` | `#ffffff` | `#1a1d1b` | cards |
| `--surface-2` | `#ece9e2` | `#232724` | secondary buttons, inputs |
| `--text` | `#1d201e` charcoal | `#eceeea` | body text |
| `--muted` | `#646a65` | `#9ca39d` | secondary text |
| `--border` | `#dedad1` | `#2f3431` | dividers |
| `--accent` | `#3b6a58` deep sage | `#84b8a1` | the single accent: primary actions, charts, focus |
| `--warning` / `--danger` | `#8a6116` / `#a1453a` | `#d9b46a` / `#e08a7e` | used sparingly |

Measured contrast: accent on white 6.2:1, muted text on the background 4.95:1, warning text on its tint 4.7:1, body text in dark mode 15.8:1, muted text in dark mode 7.2:1 (all at least WCAG 2.2 AA for normal text). Typography uses system UI fonts (SF Pro on Apple, Segoe UI on Windows, Roboto on Android) with tabular numbers. There are no gradients, neon or glow effects.

## Assets

Generated with code and no external service (`node scripts/make-icons.mjs`):

- `public/brand/mark.svg`, `mark-dark.svg`, `mark-mono.svg`: compact symbol (light / dark / monochrome)
- `public/brand/logo-light.svg`, `logo-dark.svg`, `logo-mono.svg`: symbol + wordmark
- `public/icon.svg` (favicon), `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon-32.png`

The in-app logo is the same geometry as an inline SVG (`src/components/logo.tsx`), so it follows the theme tokens.

## Optional: external generation (e.g. Higgsfield)

The assets above were **not** made with Higgsfield. If you want an alternative identity generated, use this brief and keep the result consistent with the tokens above:

> Minimal, calm app icon for a private fitness and nutrition app called "Forma". Deep sage green (#3B6A58) rounded-square background, a single thick white ring that is almost closed (a gap at the top), with a small white dot sitting in the gap. Flat vector, no gradients, no text, no people, no dumbbells, generous padding, legible at 32 px. Premium, quiet, friendly.

Wordmark brief: lowercase "forma", geometric humanist sans-serif, semibold, slight negative tracking, charcoal #1D201E on warm stone #F4F2ED, paired left of the ring symbol.
