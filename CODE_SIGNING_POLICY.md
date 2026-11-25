# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

## What is signed

Only the Windows app (`tScore.exe`) and its installer (`tScore-Setup-<version>.exe`) attached to
a [GitHub Release](https://github.com/offdarecord/tScore/releases) of this repository. They are
built by the repository's release workflow
([`.github/workflows/release.yml`](.github/workflows/release.yml)) on GitHub Actions, from the
release's tag, with no files added by hand. Nothing built anywhere else is signed, and no other
project's files are signed with this certificate.

## Team roles

| Role                     | Members                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Committers and reviewers | [Contributors with write access](https://github.com/offdarecord/tScore/graphs/contributors) |
| Approvers                | [The repository owner](https://github.com/offdarecord)                                      |

Every change reaches `main` through a pull request with passing checks; changes from anyone
without write access are reviewed by a committer first. Every signing request is approved by
hand. Everyone in these roles uses two-factor sign-in for GitHub and SignPath.

## Privacy

This program will not transfer any information to other networked systems unless specifically
requested by the user or the person installing or operating it, with one exception: when the
laptop is online and no event is open, tScore asks GitHub whether a newer version exists (an
ordinary HTTPS request to github.com, which sees the laptop's IP address and the tScore version),
and downloads it if so. See [Updates](docs/guide/getting-started.md#updates) in the user guide.

tScore never sends event data, rider data or files anywhere. Results are saved where you choose.
**Suggest a feature** opens your own email program with text you can read first; tScore sends
nothing itself.
