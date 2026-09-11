# CLAUDE.md

## STOP: memory-public is NOT TO BE USED

**`ferrosadb/ferrosa-memory` (memory-public) is old and must never be used.** <!-- memory-public-ok: the rule itself -->
Use **`ferrosadb/ferrosa-memory-private`** for every build, clone, CI checkout,
version pin, submodule, release download and doc link.

The public repo is a filtered mirror of private. They share tag names but not
code: on 2026-09-11 the mirror was at schema v64 and private at v66. Anything
built, cloned, pinned or downloaded from the mirror silently downgrades schemas
and breaks installs. Its release workflows are disabled, so its releases are
stale forever.

Check this repo with `scripts/guard-no-memory-public.sh` (CI runs it). A line
that must name the public repo, such as this rule's own text, carries the
marker `memory-public-ok: <reason>`.

End-user install scripts in this repo still download from memory-public,
because anonymous users get a 404 from the private repo. Each such line is a
KNOWN VIOLATION tracked by forge task t_03a95aa5 (move end-user downloads to
downloads.ferrosa.ai). List them with `git grep -n 'KNOWN VIOLATION t_03a95aa5'`.
