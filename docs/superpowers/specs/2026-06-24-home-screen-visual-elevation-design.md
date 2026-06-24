# Home/Vault Screen Visual Elevation (Phase 1) — Design

Status: Approved
Date: 2026-06-24

## Goal

Elevate the Home/Vault screen's perceived quality from "vibe coded" to
collector-grade premium, since this is the screen a watch collector would
actually be proudest to show someone — the literal "here's my collection"
moment. This is Phase 1 of a broader visual redesign; Results/Scan/Edit
Details screens get the same design system applied in a later phase, once
this one has proven out the approach.

## Non-goals

- No "Featured Watch" hero card — that needs a `favorite`/`featured` data
  field that doesn't exist yet. Mixing a new data-model concept into a
  pure visual-polish phase would blur scope; that's a natural Phase 2
  enhancement once such a field exists.
- No layout restructuring beyond what's described (still a 2-column
  grid, not a hero+grid hybrid or single-column list).
- No changes to Scan, Results, Edit Details, Settings, or auth screens —
  next phase, once this design system is proven on one screen.
- No color palette overhaul — the existing dark-background + gold-accent
  palette already tested close to the recommended luxury palette from the
  design system search; this phase sharpens its application, not its hue.

## 1. Typography — new luxury type system

Add three new dependencies: `expo-font`, `@expo-google-fonts/bodoni-moda`,
`@expo-google-fonts/jost`. These are native-adjacent (font assets bundled
at build time), so this requires one EAS dev-client rebuild — bundled
together with the other new dependency in this phase (see section 5) so
only one rebuild is needed, not two.

- **Bodoni Moda** (display serif): collection-value number on the stats
  card, the "Horology Vault" header, and watch brand names on grid cards.
- **Jost** (clean geometric sans): body text, labels, kickers — replaces
  the current system-font usage for these roles.

`src/theme/index.ts`'s `typography` tokens (`display`, `title`, `heading`,
`body`, `label`, `caption`) gain a `fontFamily` per token instead of
relying solely on `fontWeight` against the system font. Fonts load once at
app startup via `expo-font`'s `useFonts` hook in `app/_layout.tsx`, gating
render behind a brief branded loading state (reusing the existing dark
`LoadingScreen` component already used for auth-session resolution — not
a blank white screen).

## 2. Icons — replace every emoji on this screen

Standardize on **Ionicons** (already available via `@expo/vector-icons`,
already a dependency — zero new cost) as the one icon language for this
screen, replacing:
- The 🕒 placeholder-image emoji → `watch-outline` glyph inside a soft
  circular badge.
- The 🕒 empty-state emoji → same `watch-outline` glyph, larger.
- The ☁️/🔄 sync-status emoji badges → `cloud-done-outline` (synced) /
  `sync-outline` (pending).

This is scoped to Home screen only in this phase; the same emoji-to-icon
cleanup on Results/Scan/Edit Details/ErrorBoundary is carried forward as
explicit follow-up work for the next phase, not silently done here.

## 3. Card treatment

- Image height increases from 140px to ~190px so watch photography reads
  as photography, not a cropped thumbnail.
- Press feedback: scale-to-0.97 on press via `react-native-reanimated`
  (already installed, already used for the scanner reticle) + a light
  haptic tap via `expo-haptics` (already installed, already used
  elsewhere) — makes the grid feel tactile and responsive.
- Entrance animation: staggered fade-up per card on initial list render
  (`FadeInDown` with ~40ms per-index delay) — the specific polish that
  makes a grid read as "designed" rather than "just rendered." This
  pattern was sketched in an earlier, never-implemented design from this
  project's history (`2026-06-22-modern-ui-collection-sharing-design.md`,
  section 1) — reused here now that it's actually being built.

## 4. Stats card & header

- Collection-value number and "Horology Vault" header render in Bodoni
  Moda for an immediate premium read.
- A small Ionicons accent (not decorative clutter — a quiet visual
  anchor, not a badge-fest) sits near "COLLECTION VALUE."
- Existing dark+gold palette unchanged; only typography and icon
  treatment change here.

## 5. Subtle gradient depth

Add `expo-linear-gradient` (one more native dependency, bundled into the
same single rebuild as section 1's font packages — no additional rebuild
cost) for a soft gold-to-transparent glow behind the stats card. This
directly matches the "Liquid Glass" style's recommended key effect
(dynamic blur/gradient behind hero elements) from the design-system
search, applied tastefully — one glow, one place, not a glow on every
element.

## Testing

No automated test convention exists for screens/components in this
codebase. Verification is manual, via a rebuilt EAS dev-client (this
phase adds 3 new native-adjacent dependencies: `expo-font` and the two
font packages, plus `expo-linear-gradient` — one rebuild covers all of
them):

- Fonts render correctly (Bodoni Moda visibly serif/display on header and
  value number; Jost on body/labels) with no FOIT/blank-text flash before
  fonts load (loading gate works).
- Empty state and populated grid both show `watch-outline` Ionicons glyph,
  no emoji anywhere on this screen.
- Sync badges show the correct Ionicons glyph per entry's `synced` state.
- Cards show staggered fade-up on initial load, scale-down + haptic on
  press, in both light handling (single watch) and a fuller collection
  (10+ watches) — confirm no jank/dropped frames.
- Stats card shows the gradient glow, Bodoni Moda value number, and
  Ionicons accent, all without regressing the existing collection-value
  calculation or the retention-hidden-count note beneath it.
- Confirm Share Collection / Share / long-press Delete/Share (from the
  prior collection-sharing phase) all still work unchanged — this phase
  must not regress that functionality.
