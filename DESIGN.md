# Relay Design

## Direction: paper and graphite

Relay is a quiet desk. The content (your tasks, dates and projects) is the
interface, and the chrome steps back. The UI follows the system light or dark
setting and uses neutral surfaces with one ink-blue accent. Hierarchy comes
from type, weight and space, not from boxes.

Rules:

- **No boxes around page sections.** A section is a small heading plus its
  content. Space separates sections (32-40px); hairline dividers separate rows.
- **Cards only for things you can move or open.** Project and task cards on a
  board are the only cards. They are flat (raised surface, 1px hairline,
  10px corners, no shadow) and never nest.
- **Floating layers** (menus, dialogs, side panels, toasts) are the only
  elements with a shadow.
- **One accent.** Ink blue marks the current place, the primary action and
  focus. Everything else is neutral. Category colours (project deadline, task
  deadline, event) appear only as small marks, and every mark is paired with an
  icon or text.
- **Controls stay quiet.** On devices that can hover, per-card controls appear
  on hover or keyboard focus. On touch they stay visible.
- **No helper paragraphs.** If the UI needs a sentence to explain itself, fix
  the UI.
- **One primary button per screen.** Other actions are quiet (ghost/outline).

## Color tokens

Text meets 4.5:1 and control boundaries meet 3:1 against the canvas.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas `--background` | `#FAFAF9` | `#141519` |
| Raised `--card` (cards, menus, dialogs) | `#FFFFFF` | `#1B1C21` |
| Subtle fill `--secondary` (hover, active nav, columns) | `#F0F0EE` | `#23252B` |
| Hairline `--border` (dividers, card edges) | `#E4E4E1` | `#2B2D34` |
| Control boundary `--control-border` | `#878A92` | `#686C77` |
| Ink `--foreground` | `#1A1B1F` | `#E9E9EC` |
| Muted ink `--muted-foreground` | `#62656D` | `#9DA0AA` |
| Accent `--primary` | `#3B4BDB` | `#8E9CFF` |
| On accent `--primary-foreground` | `#FFFFFF` | `#12131A` |
| Danger `--destructive` | `#C23A2B` | `#F2887B` |
| Project deadline | `#0E8C7C` | `#4CC2B0` |
| Task deadline | `#A86A00` | `#E0A84B` |
| Event | accent | accent |

## Typography

DM Sans (packaged locally). One family; hierarchy from size and weight.

| Use | Size / line | Weight |
| --- | --- | --- |
| Page title (h1) | 26px / 1.2, -0.02em | 600 |
| Section heading (h2) | 15px / 1.3 | 600 |
| Body | 14px / 1.55 | 400 |
| Meta, counts, captions | 12.5px / 1.4 | 400, muted |

Sentence case everywhere. No all-caps labels.

## Layout

- Pages fill the width beside the sidebar with 40px desktop, 24px tablet and
  16px mobile padding. Prose is capped at about 70ch.
- The sidebar shares the canvas colour, separated by one hairline. Navigation
  is Today, Projects and Calendar; the active item gets a subtle fill and the
  accent icon.
- Boards: columns are unboxed (heading row plus a list); cards sit on the
  canvas.
- Calendar: hairline grid, today marked with a subtle fill, items rendered as
  tinted chips with a colour mark and an icon.

## Components and states

- Radius: controls 8px, cards 10px, floating layers 12px.
- Controls are at least 40px tall (44px touch targets for navigation).
- Buttons: primary (accent fill), outline (control boundary), ghost (text
  only), destructive (danger text and boundary).
- Inputs: canvas fill, control boundary, 2px accent focus ring.
- Visible focus everywhere (2px accent outline, 2px offset).
- Dialogs and menus: raised surface, hairline, soft shadow, Escape closes.
- Routine success and Undo are non-blocking notifications; failures are
  inline errors next to the input.
- Empty states are one line naming the next action.

## Motion

Only in answer to an action (open, close, complete, drag), 150-200ms
ease-out. No page-load choreography. Reduced motion turns it off.

## Review

Check 1440x900, 1366x768 and 390x844 in both light and dark, plus keyboard
navigation, focus, contrast, zoom and reduced motion.
