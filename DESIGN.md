# Design notes

Why this extension is built the way it is. The short version of each decision is in
bold; the rest is the reason it is not done the obvious way.

- **IGT only.** RTA is quarantined in `rtaByType` and used solely for VOD seeking.
  Comparing an IGT run against an RTA PB is the easiest silent bug to introduce here.
- **A live run cannot normalize against itself.** With no final split, using the
  current time as the denominator makes every row full width, and a 2 minute run looks
  the same length as a 9 minute one. Unfinished runs round up to the next 3 minutes
  instead, and the space left on the right is the gap to that step.
- **Column order is not chronological.** Bastion-first and fortress-first runs both
  exist, so splits are sorted by value, never by column position.
- **Context events are not mixed into `items`.** Segments are painted by the event
  that precedes them, so mixing context events in corrupts the fill. They are drawn
  separately, and are off by default.
- **Context events are not filtered against a known list.** The API already separates
  them into `contextEventList`; screening those names again only drops the ones
  PaceMan adds later. An early version did exactly that and silently swallowed
  `rsg.distract_piglin`. Names without an icon fall back to a tick.
- **Nothing is mounted until PaceMan has hydrated.** Adding a sibling to server-rendered
  markup before React hydrates it is a mismatch: React discards the whole tree and
  rebuilds it (production error #418), and the anchor element the mount is holding is
  never reconnected, so the timeline never comes back. `document_idle` is not a
  guarantee that hydration is done — React 19 commits it in a scheduler callback, which
  can land after `load` — and Firefox lost that race almost every time on the home page.
  Whether a node is hydrated can only be read from the React properties React puts on
  the DOM node, and those are invisible from the isolated world in both browsers, so the
  check lives in the MAIN world next to the tee and only the answer crosses over. The
  keep-alive observer also re-resolves the anchor when the element it held is gone,
  since a tree rebuild can happen for reasons of PaceMan's own.
- **Nothing is mounted inside a node React owns.** A single Shadow DOM host goes in as
  a sibling, and an observer puts it back if PaceMan's render removes it. The list and
  history panels do not inject into rows either — they draw their own list in one
  panel.
- **The current position of a live run is estimated locally.** PaceMan exposes no
  current IGT, and the TIME column just shows the last split without ticking. The
  marker advances from the furthest point known for the run — the largest IGT across
  its splits *and* its context events — anchored on `lastUpdated`, the wall time of
  that event rather than the moment we fetched. Anchoring on the fetch would start a
  five-minute-old run five minutes behind and jump backwards on every reload. If
  `lastUpdated` is unusable (in the future, or over 30 minutes old) the observation
  time stands in. The anchor is re-based only when the furthest point advances, since
  re-basing on every response makes the marker step backwards once a second. The
  motion follows [MCSRPaceWidget](https://github.com/mcrtabot/MCSRPaceWidget)'s face
  marker.
- **The list and history read the page's own traffic.** `liveruns`, `players` and
  `getPlayerRuns` are teed in the MAIN world. The patch installs at `document_start`
  and the UI mounts at `document_idle`, so the first response has already landed
  before anything subscribes — the MAIN world replays the most recent response it
  holds to fill that gap (`TEE_REPLAY`). Individual runs and PBs cannot be teed, so
  those are fetched.
- **Each page scales differently, on purpose.** The run page fits its single run to
  the width. The pace table scales each row on its own with a 15 minute floor — one
  shared denominator let the leading run squash everything else, at one point drawing
  a 1:57 run as 9% of the column. The history panel puts the slowest finish on screen
  at 100%, since those rows are static and meant to be read side by side.
- **The run page timeline is capped at 960px.** Its column stretches to the container
  width, 1320px on a wide screen, while PaceMan's run card below is about 441px. A
  full-width bar over that card reads as two unrelated things. Matching the card
  exactly is too narrow the other way: eight 40px icons across 441px start touching.
- **The Image Builder link carries the run in the URL.** Nothing is posted anywhere,
  so a run can be handed over without the extension needing an endpoint of its own. On
  a run still going it takes whatever is on the bar at the moment of the click. The
  events it sends are the 1.16.1 RSG set.
- **Icons default to PaceMan's own.** The same split can have different art — a gold
  block is the bastion on PaceMan and the fortress in MCSRImageBuilder's default theme
  — which next to the page's own split card reads as being off by one row. PaceMan's
  files are referenced same-origin rather than bundled, falling back to the bundled
  copies if they cannot be loaded.

The theme is a port of MCSRImageBuilder's `default` (`src/timeline/theme/default.ts`).
It differs from the original in exactly three ways, each documented with its reason at
the top of that file.
