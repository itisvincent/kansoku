# Agent lessons

What the agent queue has learned from its own mistakes and successes. The daily review
(`scripts/agent/RETRO.md`) writes it through `node scripts/agent/queue.mjs lessons`; the owner
may edit it by hand; the next lessons PR rewrites the file into this form and waits for the owner.
Workers read it before starting; reviewers check each PR against it.

A lesson seen on 3 different days moves up to **Rules**. That move needs the
owner: a lessons PR that changes the rules waits for them to merge it.

## Rules

Must be followed. A reviewer asks for changes when a PR breaks one.

_None yet._

## Lessons

Should be followed. `avoid` = a mistake not to repeat; `keep` = something that worked.

_None yet._
