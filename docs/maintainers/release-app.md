# The tScore Release GitHub App

release-please opens and updates the release PR (`chore(main): release X.Y.Z`). If it does that
with the workflow's built-in token, GitHub starts **no** workflows on the PR (a rule that stops
workflows triggering each other in loops). Then the required checks never run and the PR can't
be merged without overriding branch protection.

So release-please acts as a small private GitHub App instead. Its pushes start CI like anyone
else's. An app token lasts an hour, can only touch this repository, and isn't tied to a person's
account, so it keeps working when maintainers change.

The release workflow ([`.github/workflows/release.yml`](../../.github/workflows/release.yml))
uses the app when the repository has both of these, and the built-in token otherwise:

| Where                                                      | Name                      | Value                               |
| ---------------------------------------------------------- | ------------------------- | ----------------------------------- |
| Settings → Secrets and variables → Actions → **Variables** | `RELEASE_APP_CLIENT_ID`   | The app's Client ID                 |
| Settings → Secrets and variables → Actions → **Secrets**   | `RELEASE_APP_PRIVATE_KEY` | The whole private key file (`.pem`) |

## Setting it up (about 10 minutes, repository owner)

1. **Create the app.** For a personal account: <https://github.com/settings/apps/new>. For an
   organisation: the organisation's Settings → Developer settings → GitHub Apps → New.
   - **Name:** anything unused on GitHub, e.g. `tScore Release (<owner>)`.
   - **Homepage URL:** the repository's URL.
   - **Webhook:** untick **Active**. The app receives nothing; it only lends its token.
   - **Repository permissions:**
     - Contents: **Read and write** (release branch, tags, releases);
     - Pull requests: **Read and write** (the release PR);
     - Issues: **Read and write** (release-please's labels on the PR);
     - Metadata: Read-only (set automatically).
   - Everything else: **No access**.
   - **Where can this GitHub App be installed?** Only on this account.
   - Create it.
2. **Note the Client ID** shown at the top of the app's page.
3. **Generate a private key** (bottom of the same page). A `.pem` file downloads.
4. **Install the app** (left menu, Install App) on the account, choosing **Only select
   repositories** and the tScore repository.
5. **Store both in the repository** (Settings → Secrets and variables → Actions): the Client ID
   as the variable `RELEASE_APP_CLIENT_ID`, and the full contents of the `.pem` file, including
   the `BEGIN` and `END` lines, as the secret `RELEASE_APP_PRIVATE_KEY`. Or with the GitHub CLI,
   from PowerShell:

   ```powershell
   gh variable set RELEASE_APP_CLIENT_ID --repo offdarecord/tScore --body "<client id>"
   ```

   ```powershell
   Get-Content -Raw "$HOME\Downloads\<file>.pem" | gh secret set RELEASE_APP_PRIVATE_KEY --repo offdarecord/tScore
   ```

6. **Delete the downloaded `.pem`** (or move it into a password manager). GitHub keeps only its
   public half, so a lost key is replaced by generating a new one; the old one can then be
   deleted on the app's page.

## Checking it works

The next push to `main` runs the Release workflow. Its `release-please` job should show a
**Create GitHub App token** step that succeeded, and the release PR's latest update should
then start CI and the PR title check on its own. If the step is skipped, the variable is
missing; if it fails, the key or Client ID is wrong, or the app isn't installed on the repository.

## If the key leaks

Generate a new private key on the app's page, update the secret, then delete the old key there.
The app can only reach this repository's contents, pull requests and issues.
