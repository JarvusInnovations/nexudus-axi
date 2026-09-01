---
status: done
depends: [room-finding]
specs:
  - specs/commands/rooms.md
issues: []
pr: 11
---

# Plan: Favorites order = preference ranking

## Scope

**In:** the favorites list's stored order becomes meaningful — `rooms free`/`rooms day` render candidates in rank order when the favorites lens is active (making `free`'s first row and `book` suggestion the top-ranked free room), the `rooms` catalog sorts favorites by rank within its favorites-first group and the `fav` column carries the rank, and `rooms favorites` shows a `rank` column. `add` appends; re-add keeps rank; re-ranking = clear + re-add. **Out:** a dedicated reorder subcommand (clear+add suffices until it doesn't), rank influencing `book`'s room resolution.

## Implements

- `specs/commands/rooms.md` § rooms favorites — the ordered-lens semantics across favorites/free/day/list.

## Approach

`applyLens` sorts its favorites-lens candidates by index in the stored array (Promise.all preserves candidate order, so free/day rows follow for free). `roomsList` builds a rank map: favorites sort by rank, others by DisplayOrder after them; `fav` column renders the 1-based rank. `rooms favorites` renders rank explicitly.

## Validation

- [x] With favorites [B, A], `rooms free` lists a free B before a free A even when A's DisplayOrder is lower; the book suggestion names B (fixture-driven).
- [x] `rooms day` rows follow rank order under the favorites lens; `--all` restores DisplayOrder.
- [x] `rooms` shows favorites first by rank with the rank in the `fav` column; non-favorites keep DisplayOrder.
- [x] `rooms favorites` shows the rank column; re-add keeps existing rank (no-op).
- [x] Live: bare `rooms free` puts Purple first per the owner's stated ranking.

## Risks / unknowns

None of note — pure presentation-order semantics over existing data.

## Notes

- Live check was a nice proof: the #1-ranked room was outside its bookable shift at the queried hour, so #2 correctly led the free list while #1 showed in busy with its conflict range.
- Promise.all preserving candidate order means the lens sort is the single ordering point — free/day inherit it with no per-command sorting.

## Follow-ups

None.
