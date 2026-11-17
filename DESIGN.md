# Relay Design

## Scene and Direction

The owner is returning to unfinished work at a laptop or checking a commitment
on a phone. Phase 1.2 uses warm charcoal/brown solids and muted honey, enclosed
rounded cards, and mostly symmetrical bento layouts. No gradients, glow,
decorative animation, filler cards, deep nesting, or simulated AI.

## Color Tokens

Warm dark solids with a muted honey accent. Essential control borders must meet
3:1 contrast; text 4.5:1 (large text 3:1). Subtle card borders are decorative.

| Role | Value |
| --- | --- |
| Background | `#261F19` |
| Surface | `#322A23` |
| Elevated surface | `#3D332A` |
| Foreground | `#F2E8DC` |
| Muted foreground | `#C3B5A5` |
| Border | `#665444` |
| Primary | `#D8B477` |
| Primary foreground | `#261F19` |
| Focus | `#D8B477` |
| Danger | `#EBA493` |

Project deadline: `#8B5CF6`; task deadline: `#F59E0B`; event: `#3B82F6`.
Pair every category/status color with text or an icon.

## Typography and Layout

Locally packaged DM Sans, no network font dependency at runtime/build.
Body 15-16px; compact labels remain readable. Headings use moderate weight,
balanced wrapping, and no tighter than -0.03em tracking.
Desktop uses collapsible navigation with an icon rail; search is inside it.
Mobile uses a compact accessible drawer. Page shells take full available width
with 32px desktop, 24px tablet, 16px mobile padding; gaps 16-24px.
Bound prose to 65-75ch, not the page. Cards have complete 1px borders,
12-16px corners, and 20-24px padding. Boards/calendar scroll within their region.
Home uses Create, three actionable metrics, Focus/Upcoming, Projects/Momentum,
and Overview/Matrix views. Settings uses responsive cards without filler.

## Components and States

shadcn/ui conventions with Radix primitives, Tailwind, and lucide icons.
Shared buttons, inputs, labels, alerts, dialogs, and status vocabulary.
Controls are at least 40px tall, with visible focus and distinct disabled,
loading, error, and destructive states. Controls use smaller coherent corners;
cards 12-16px. No decorative shadows or deeply nested cards.

Empty states explain a useful next action. Loading skeletons preserve layout.
Errors preserve entered text. Confirmed deletion lists affected records.
Dialogs restore focus and support Escape; menus and drag operations have
keyboard/touch alternatives. No browser alert/confirm/prompt flows. Routine
success/Undo is nonblocking Sonner feedback with persistent History recovery.
Deferred Chat says "Coming soon"; no repeated AI warnings on other pages.

## Motion

Motion is reserved for feedback/state transitions, 150-200ms ease-out.
Respect reduced motion. Content is visible by default; no page-load choreography.

## Review

Verify desktop 1440x900, short laptop 1366x768, touch mobile 390x844, zoom,
keyboard navigation, labels, accessible native SVG/progress summaries,
focus, contrast, dark states, overflow, and reduced motion. Apply Impeccable
critique/audit and its mechanical detector to changed UI before acceptance.
