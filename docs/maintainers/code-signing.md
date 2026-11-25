# Code signing (SignPath Foundation)

An unsigned installer makes Windows show **Windows protected your PC** (SmartScreen) and asks
volunteers to choose **More info → Run anyway**. Signing removes that, and lets installed copies
check that an update really comes from tScore.

tScore uses the [SignPath Foundation](https://signpath.org/) programme: free code signing for
open-source projects. The certificate belongs to SignPath Foundation and its private key never
leaves SignPath's hardware. GitHub Actions sends the built files; SignPath signs them only if
they were built by this repository's release workflow from a tagged release. Windows then shows
the publisher as **SignPath Foundation**, and the file's details link to this project.

The release workflow ([`.github/workflows/release.yml`](../../.github/workflows/release.yml))
already has the signing steps. They stay off, and releases stay unsigned, until the repository
variable `SIGNPATH_ORGANIZATION_ID` is set.

## 1. Apply (repository owner, about 20 minutes, then a wait)

1. Read the [conditions](https://signpath.org/terms) and check tScore meets them. It does today:
   - an OSI-approved licence (Apache-2.0) with no proprietary parts in the signed files;
   - built only from this public repository, by GitHub Actions;
   - maintained, with releases;
   - a code signing policy page: [CODE_SIGNING_POLICY.md](../../CODE_SIGNING_POLICY.md).
2. Apply through the form on <https://signpath.org/apply>. Use the project's details:
   - **Project:** tScore, <https://github.com/offdarecord/tScore>;
   - **Licence:** Apache-2.0;
   - **What is signed:** the Windows app (`tScore.exe`) and its installer (`tScore-Setup-*.exe`);
   - **Build system:** GitHub Actions, workflow `release.yml`, on release tags only.
3. Use the tScore-only email address for the application, not a personal one.
4. Turn on two-factor sign-in for the GitHub account and the SignPath account when asked:
   SignPath requires it for anyone who can approve a signing request.

## 2. Set up the project in SignPath (once approved)

SignPath gives you an organisation. In it:

1. **Project** with slug `tScore`, linked to the GitHub repository (the **Trusted Build
   System** is GitHub.com).
2. **Artifact configurations**, one for each pass:
   - slug `app`: a single portable executable, `tScore.exe`;
   - slug `installer`: a single portable executable, `tScore-Setup-*.exe`.

   Ask SignPath support for the configuration XML if the form doesn't fit: a single PE file
   with Authenticode signing is all each needs.

3. **Signing policy** with slug `release-signing`, using the release certificate, requiring
   manual approval by you (recommended: nothing is signed without your click), and allowing
   only builds from the `release.yml` workflow on tags `v*`.
4. **An API token** for a CI user with permission to submit signing requests (not to approve
   them).

## 3. Turn it on in GitHub (5 minutes)

In the repository: Settings → Secrets and variables → Actions.

| Kind     | Name                       | Value                                                      |
| -------- | -------------------------- | ---------------------------------------------------------- |
| Variable | `SIGNPATH_ORGANIZATION_ID` | The organisation id from SignPath (a GUID)                 |
| Secret   | `SIGNPATH_API_TOKEN`       | The CI user's API token                                    |
| Variable | `SIGNPATH_PROJECT_SLUG`    | Only if not `tScore`                                       |
| Variable | `SIGNPATH_POLICY_SLUG`     | Only if not `release-signing`                              |
| Variable | `SIGNPATH_PUBLISHER`       | Only if the certificate's name isn't `SignPath Foundation` |

Or from PowerShell:

```powershell
gh variable set SIGNPATH_ORGANIZATION_ID --repo offdarecord/tScore --body "<organisation id>"
```

```powershell
gh secret set SIGNPATH_API_TOKEN --repo offdarecord/tScore
```

## What happens at each release

1. The installer job builds the app as usual. With signing on, the app's update settings name
   the publisher, so installed copies accept only updates signed by the same publisher.
2. `tScore.exe` goes to SignPath (artifact configuration `app`). You get an email: approve it.
3. The installer is rebuilt around the signed app, then goes to SignPath (`installer`). Approve
   it.
4. Signing changes the installer's bytes, so `latest.yml` (the update check) and the
   `.blockmap` (small downloads) are refreshed for the signed file
   ([`scripts/refresh-update-info.mjs`](../../scripts/refresh-update-info.mjs)). Without this,
   installed copies would refuse the update.
5. The job checks both files have a valid signature, then attaches them to the GitHub Release.

## Checking it worked

On a Windows 11 PC that has never run tScore, download the new installer from the release page
and run it. There should be no **Windows protected your PC** screen, and right-click → Properties
→ Digital Signatures shows **SignPath Foundation**. Then install the next release over it with
the app's own update: it should update without a warning.

A brand-new certificate can still show SmartScreen for a few days until it has built up
reputation; that clears on its own.

## If it goes wrong

- **A signing step fails or times out:** the release is still created, without the installer
  attached. Re-run the installer job once the request is approved in SignPath.
- **To go back to unsigned releases:** delete the `SIGNPATH_ORGANIZATION_ID` variable. Copies
  installed from a signed release will then refuse unsigned updates (that is the point of the
  check), so only do this if signing is gone for good, and tell users to reinstall.
