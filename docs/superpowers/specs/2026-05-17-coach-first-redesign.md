# Premium Checkers — Coach-first Redesign

## Why

Today's HUD treats AI Coach as one of seven equally-weighted controls in the right
sidebar. The README sells the product as a coaching-first experience; the interface
should match. The left half of the screen is empty, the right panel is dense and
hierarchy-less, and the post-game coach report (`buildCoachReport`) is not actually
shown to the user in a focused way.

## Goals

1. AI Coach is visually and structurally the protagonist of the screen.
2. The opponent has a name and a face, not "Casual / Classic / Hard" buttons.
3. Game chrome (settings, theme, skin) is demoted to a compact icon rail.
4. The post-match Coach Review becomes a real screen, not a single inline card.
5. No regressions: hotseat, themes, surrender, leaderboard, Pro skin all still work.

## Non-goals

- Backend, real multiplayer, real ratings — out of scope. City leaderboard stays
  local/stubbed.
- New game rules. Engine (`rules.ts`, `ai.ts`, `coach.ts`) is not touched.
- Mobile-first redesign. We keep the existing `<920px` collapse behavior; the new
  layout collapses gracefully on narrow screens but desktop is the canvas.

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  PREMIUM CHECKERS · Russian 8x8                          [⚙][≡]    │  ← slim header
├──────────────────────┬─────────────────────────────────┬────────────┤
│                      │     [Captured: black stack]     │            │
│   ┌────────────┐     │                                 │   ┌────┐   │
│   │ AI COACH   │     │                                 │   │ AI │   │  ← icon rail
│   │ ●  Dana    │     │                                 │   │1500│   │     mode
│   │   1500     │     │                                 │   ├────┤   │     theme
│   │            │     │       3D / 2D BOARD             │   │ ☼  │   │     skin
│   │ • Tip      │     │                                 │   ├────┤   │     pro
│   │ • Look for │     │                                 │   │ ⤴ │   │     invite
│   │            │     │                                 │   └────┘   │
│   │ [eval bar] │     │                                 │            │
│   └────────────┘     │     [Captured: white stack]     │            │
│                      │                                 │            │
│   ┌────────────┐     │     ▸ White to move             │   ┌────┐   │
│   │ HISTORY    │     │                                 │   │ 2D │   │  ← board corner
│   │ 1. e3-d4   │     │                                 │   └────┘   │
│   │ 1.. f6-e5  │     │                                 │            │
│   └────────────┘     │                                 │            │
└──────────────────────┴─────────────────────────────────┴────────────┘
```

### Zones

- **Header** (`.checkers-top`): brand block + menu (≡) only. No more "Hide Panel"
  button; the rails replace it. "Free move" pill is removed. The turn status pill
  moves under the board (see Turn pill below); settings move into the icon rail.
- **Coach Rail** (new, `.ck-coach-rail`): fixed left, ~280px wide, full height minus
  header. Two stacked cards: Coach (above) and History (below).
- **Board**: centered. Visual captured stacks above and below.
- **Turn pill** (`.ck-turn-board`): floats under the board, not in the header.
- **Icon Rail** (new, `.ck-icon-rail`): right, ~64px wide, full-height column of
  icons. Click opens a popover with the related controls. 2D/3D toggle pinned to
  the bottom-right corner of the board.
- **Help line**: shown until the first piece is selected, then auto-hides.

## Components

### Coach Card (`.ck-coach-card`)

- **Header**: persona avatar (32px circle, SVG), persona name, rating, faded tagline.
- **Live tip**: existing `getLiveCoachTip` output, tone-coded (good/warning/idea).
  When `aiThinking` is true, shows skeleton ("Thinking…").
- **Look for**: short one-line cue about what the player should watch for next move.
  Derived from the same call as live tip; for now it just splits the live tip into
  two: tip + an actionable verb. (No new AI model — purely formatting.)
- **Eval bar**: horizontal bar, 8px, white-on-left / black-on-right, fill driven by
  a lightweight position score (piece count + king weight, computed locally — does
  not call AI). 50/50 at start.

### History Card (`.ck-history-card`)

- Replaces the existing `#ck-moves` block. Same content, different position.
- Each row: "1. e3-d4 / 1… f6-e5" formatted from `formatMove` and history pairs.

### Captured Stacks (`.ck-captured-stack`)

- Two strips above and below the board. Each piece captured is drawn as a small
  2D SVG disc (matches piece color). Cap at 12; extras shown as `+N`. Replaces the
  `Captured W/B 0/0` text stat.

### Icon Rail (`.ck-icon-rail`)

- 5 buttons: **Opponent** (avatar), **Theme**, **Settings** (camera + skin), **Pro**
  (or crown if active), **Invite**.
- Opponent click opens "Change opponent" popover with the three personas.
- Theme cycles light/midnight directly (single click).
- Settings opens a popover with camera and skin toggles + surrender.
- Pro click triggers existing upgrade flow.
- Invite click triggers existing share flow.

### Turn Pill (`.ck-turn-board`)

- Single line under the board: "● White to move" / "● Black to move" / "● AI thinking".
  Color dot matches the side.

### 2D/3D Toggle (`.ck-camera-toggle`)

- Pinned bottom-right of the board container. Two-state pill: "2D" / "3D". Maps to
  existing camera modes (top-down ↔ cinematic).

### Surrender Confirm (`.ck-confirm`)

- Surrender is its own item inside the Settings popover, separated by a divider
  and styled red. Click → confirm dialog with explicit copy: "Surrender counts as
  a loss. Continue?" → confirm/cancel. Cancel closes the dialog without ending the
  game. Confirm calls the existing `surrender()` handler.

### Coach Review screen (`.ck-review`)

- Triggered after match. The existing `.checkers-gameover` modal gains two CTAs:
  primary "Coach Review" → opens the review screen; secondary "New Match" →
  restarts. The review screen is a separate fullscreen overlay on top of the
  gameover modal.
- Fullscreen overlay above the game.
- Layout:
  - Big score number (0–100 from `buildCoachReport.score`).
  - Headline ("Masterclass", "Strong tactical game"…).
  - One-paragraph summary.
  - List of `CoachInsight` cards with tone-coded left border (same as today, just
    larger and on a dedicated screen).
  - CTA row: `Play again` (primary), `Back to menu` (secondary).
  - Pro upsell strip at the bottom (only if `!profile.pro`): "Unlock per-move deep
    analysis — Upgrade to Pro".

## Personas

Stored in a new const in scene.ts (no engine change):

| Depth | Handle           | Rating | Tagline                       | Accent  |
|-------|------------------|--------|-------------------------------|---------|
| 2     | "Yara Bishop"    | 1100   | "Tactical training partner"   | #7ef5b3 |
| 4     | "Dana Endgame"   | 1500   | "Solid positional play"       | #6fd0ff |
| 6     | "Magnus 8"       | 2000   | "Punishes mistakes"           | #ff9a5c |

Notes:
- Avatars are CSS-rendered SVG monograms with the persona accent.
- "Dana Endgame" already appears as the seeded leader in `seedLeaderboardEntries`,
  so it's continuity, not a new face.
- Hotseat mode shows a different left card: "Two players — local hotseat" with no
  rating/persona, but the same eval bar and Look-for tile still apply.

## State changes

- New profile field is NOT required. All existing profile fields (handle, city,
  theme, skin, pro) stay as-is.
- New ephemeral UI flags in scene scope: `firstMovePlayed: boolean`,
  `confirmingSurrender: boolean`, `openPopover: 'opponent' | 'settings' | null`.
- `gameStarted` already exists; we reuse it.

## CSS strategy

- All new selectors are namespaced under `.checkers-root` (or `.ck-*`), matching the
  existing convention. No global selector changes.
- The right side panel CSS (`.checkers-side`) is replaced; the class disappears.
- Light theme parity: every new card needs a `.theme-light` override.

## Acceptance criteria

1. Loading `npm run dev` and starting a Player-vs-AI match shows the new layout:
   left coach rail, right icon rail, captured stacks above/below board, turn pill
   under the board.
2. Live tip text in the coach card updates on every turn (white & AI) and shows a
   skeleton during AI think.
3. The help line under the board is visible on first frame of a match and is gone
   permanently after the first piece is selected.
4. Surrender requires confirmation. Surrender from the popover ends the match.
5. After a match, clicking "AI Coach Review" opens a fullscreen review with score,
   summary, and insights. "Play again" restarts a fresh match.
6. Theme toggle still flips midnight/light across all new components.
7. `npm test`, `npm run typecheck`, `npm run build` all pass.

## Risks

- `scene.ts` is 48k and tightly coupled. New CSS selectors and a refactored overlay
  template will be a meaningful diff. Mitigation: keep the engine code untouched,
  only replace the HTML template + add CSS + add a few render helpers.
- 3D camera + new chrome may overlap on smaller widths. Mitigation: shrink the coach
  rail at `<1100px`; collapse to a top toast on `<920px`.

## Out of scope (future Pro hooks)

- Per-move deep analysis using stronger AI search.
- Saved analysis sessions.
- Custom persona unlocks tied to Pro.
