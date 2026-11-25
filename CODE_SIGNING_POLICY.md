# Code signing policy

Free code signing is provided by [SignPath.io](https://about.signpath.io/), with a certificate
from the [SignPath Foundation](https://signpath.org/).

## What is signed

Only the Windows app (`tScore.exe`) and its installer (`tScore-Setup-<version>.exe`) attached to
a [GitHub Release](https://github.com/offdarecord/tScore/releases) of this repository. They are
built by the repository's release workflow
([`.github/workflows/release.yml`](.github/workflows/release.yml)) on GitHub Actions, from the
release's tag, with no files added by hand. Nothing built anywhere else is signed.

## Who can approve signing

| Role      | Members                                         |
| --------- | ----------------------------------------------- |
| Committer | Maintainers with write access to the repository |
| Reviewer  | Maintainers with write access to the repository |
| Approver  | The repository owner                            |

Every change reaches `main` through a reviewed pull request with passing checks. Each signing
request is approved by hand.

## Privacy

tScore runs offline. It sends nothing about you or your events anywhere, except checking GitHub
for a newer version when the laptop is online and no event is open (see the
[user guide](docs/guide/getting-started.md#updates)). It never sends event data, rider data or
files.
