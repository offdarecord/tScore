# 0004. Licensing: Apache-2.0 app, MIT schemas, CC BY 4.0 docs

- **Status:** Accepted
- **Date:** 2026-11-22

## Context

tScore is open source so that it does not depend on one maintainer. Results sites (such as
trials.au) and other tools should be able to adopt the results format without any licence
question. The project owner wants to keep the option of a paid or supported edition later.

## Decision

- **Application code:** Apache License 2.0 (`LICENSE` and `NOTICE` at the repo root).
- **`schemas/`** (event setup and results formats): MIT (`schemas/LICENSE`).
- **Documentation** (`docs/`): Creative Commons Attribution 4.0 (`docs/LICENSE`).
- **No contributor licence agreement.** Contributions are accepted under the project licence
  (Apache-2.0 §5; GitHub's terms of service).

## Consequences

- Explicit patent grant and contribution terms; clear "no rights to the name" clause, so forks
  cannot call themselves tScore and their bug reports don't land on us.
- Anyone, including a vendor, may sell a closed copy. Accepted: the protection is the name,
  being free and well supported, and being the version linked from trials.au.
- The project can still move to a copyleft licence for future versions if ever needed.
- Forks must keep `NOTICE` and mark changed files.
- Third-party dependencies must have licences compatible with Apache-2.0.

## Alternatives considered

- **GPL-3.0:** chosen first, then reversed. Leaving GPL later needs every past contributor's
  permission, and it would block a paid or closed edition even for the owner.
- **MIT:** no patent or contribution terms.
- **AGPL-3.0:** adds nothing for a desktop app and would bind a results site running the engine.
- **MPL-2.0:** less familiar; the file-by-file rule is subtle.
