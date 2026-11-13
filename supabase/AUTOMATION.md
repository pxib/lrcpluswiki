   # Automatic database migrations

The Pages workflow can apply pending Supabase migrations before publishing the
wiki. Supabase tracks completed versions, so later deploys skip them. A database
failure stops the website deployment. Ordinary deploys remain unchanged until
you finish setup and enable the repository variable below.

## One-time setup for this existing project

You confirmed that **all eight original SQL files have already been applied**.
The setup run records their versions as completed; it does not execute those
SQL files again. Use this setup option only against that existing database.

1. Create a Supabase personal access token at
   <https://supabase.com/dashboard/account/tokens>.
2. Find the project reference in your Supabase project dashboard URL:
   `https://supabase.com/dashboard/project/PROJECT_REF`.
3. Get the project's database password (the password used for PostgreSQL
   connections, not an API key). Supabase's **Connect** dialog shows connection
   details; its database settings let you reset the password if necessary.
4. Open the repository's
   [Actions secrets](https://github.com/pxib/lrcpluswiki/settings/secrets/actions).
   Add these **repository secrets** with **New repository secret**:

   | Secret | Value |
   | --- | --- |
   | `SUPABASE_ACCESS_TOKEN` | The personal access token from step 1 |
   | `SUPABASE_PROJECT_ID` | The project reference from step 2 |
   | `SUPABASE_DB_PASSWORD` | The database password from step 3 |

   Enter these values directly in GitHub; do not put them in source files or chat.
   The workflow also supports secrets on the existing `github-pages` environment.
5. Commit and push the prepared workflow, config, migration files, and this guide
   to `main`. The first push continues to deploy the wiki without running SQL,
   because automatic migrations are still disabled.
6. Open [Actions](https://github.com/pxib/lrcpluswiki/actions), select
   **Deploy wiki to GitHub Pages**, and click **Run workflow**. Select `main`,
   check **One-time setup: all eight original SQL files are already applied in
   this database**, and run it.
7. Check that **Apply database migrations** succeeds. It links to the project,
   records the eight existing versions, previews pending migrations, and applies
   anything pending. With the current eight files, no SQL migrations should run.
   The wiki then deploys.
8. In the repository's
   [Actions variables](https://github.com/pxib/lrcpluswiki/settings/variables/actions),
   add the **repository variable** `SUPABASE_MIGRATIONS_ENABLED` with value `true`.

After setup, pushes to `main` and normal manual runs apply pending migrations
automatically. Leave the one-time checkbox unchecked on future manual runs.
The existing workflow concurrency group prevents overlapping database deploys.
No credentials are published in the wiki artifact.

Each workflow attempt uploads and deploys a matching artifact named
`github-pages-RUN_ID-ATTEMPT`. The workflow waits for that artifact to appear in
the listing API before deploying, so a retry does not select an older attempt's
artifact. When updating the workflow to fix a failed run, push the changes and
start a new run: rerunning an old job keeps that job's original workflow code.

## Adopted versions

| Version | Already-applied original SQL |
| --- | --- |
| `20261113000001` | `community.sql` |
| `20261113000002` | `moderation.sql` |
| `20261113000003` | `content-controls.sql` |
| `20261113000004` | `talk-performance.sql` |
| `20261113000005` | `staff-indicators.sql` |
| `20261113000006` | `user-pages.sql` |
| `20261113000007` | `installation-article.sql` |
| `20261113000008` | `talk-activity.sql` |

This adoption list is frozen in the workflow. Never add a future migration to
the repair command: new migrations must execute normally. If setup partially
fails, inspect the failed step; the same history-repair operation can be retried
for these original eight versions. Do not record a version as applied when its
SQL has not actually been run.

The repair command passes `--yes` because the current CLI requires explicit
confirmation for hosted migration-history changes in unattended Actions runs.
Its version arguments come before `--remote` so an optional target argument
cannot consume a migration version.

## Future changes

Create a new file in `supabase/migrations/` named
`YYYYMMDDHHMMSS_description.sql`, with a unique timestamp newer than the existing
versions. With the CLI installed, `supabase migration new description` creates
the timestamped file. Put the new SQL in that file, test it, then commit and
push it with the website changes. Do not edit applied migration files: the CLI
does not reapply them. The old top-level SQL files remain as legacy references;
the numbered migration directory is now the deployment source.
The imported files omit the manual scripts' outer `begin`/`commit` wrappers;
the CLI manages each migration's transaction and history record together.

Check the Actions log for the dry run and successful application. If a migration
fails, fix the failure in a new change as appropriate; the website will not
publish until the database step passes. The setup uses the current stable CLI
through `supabase/setup-cli@v1` (`version: latest`).

For a **new, empty project**, add its secrets, enable the variable, and run a
normal deployment with the setup checkbox **unchecked**. All eight migrations
will execute in order. For an existing project with other CLI migration
history or schema changes outside these SQL files, reconcile that history
before using this adoption procedure.

References: [Supabase CI/CD](https://supabase.com/docs/guides/deployment/managing-environments)
and [migration history repair](https://supabase.com/docs/reference/cli/supabase-migration-repair).
