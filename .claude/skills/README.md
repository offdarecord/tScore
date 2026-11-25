# Maintainer skills

Repeatable maintainer jobs as Claude Code skills (`.claude/skills/<name>/SKILL.md`). Anyone who
clones tScore and runs Claude Code can invoke them, e.g. `/cut-release`.

Every skill:

- asks for its inputs;
- works on a branch and ends with a pull request, never a push to `main`;
- runs the relevant checks;
- anonymises its inputs and refuses to read or commit real entry lists, scoring workbooks,
  or card photos showing names.

| Skill                                                        | Purpose                                                                             | Phase |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----- |
| [`/cut-release`](cut-release/SKILL.md)                       | Volunteer-friendly changelog wording, release checks, update verification           | 0 ✅  |
| [`/triage-feature-request`](triage-feature-request/SKILL.md) | A suggestion → drafted issue and reply, personal details removed, duplicates linked | 0 ✅  |
| `/add-card-profile`                                          | A new scorecard design → profile JSON + fixtures                                    | 1     |
| `/add-golden-event`                                          | A past event → anonymised regression test                                           | 1     |
| `/add-label-template`                                        | New label stock + alignment test print                                              | 2     |
| `/add-import-mapping`                                        | A new entry-system export                                                           | 2     |
| `/triage-support-bundle`                                     | Diagnose a "Report a problem" zip; draft an issue with no personal data             | 2     |
| `/add-region`                                                | Classes, rules and tie-breaks for a new state or country                            | 3     |
| `/change-results-format`                                     | Schema change: additive stays `/1`, breaking becomes `/2`                           | 3     |
