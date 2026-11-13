# Community database updates

For automatic deployment with GitHub Actions, follow [AUTOMATION.md](AUTOMATION.md).
The numbered files in `migrations/` are the deployment source. The top-level
SQL files below are retained for the original manual installation workflow;
do not run them again after adopting migration tracking.

Run SQL files in Supabase's SQL Editor as the project owner, in this order:

1. `community.sql` — initial accounts/profiles and discussions.
2. `moderation.sql` — staff roles, private reports, restrictions, and topic locks.
3. `content-controls.sql` — word filters and reply deletion.
4. `talk-performance.sql` — batched public topic counts.
5. `user-pages.sql` — public joined dates, owner-edited introductions, and user-page reports (requires content-controls).
6. `installation-article.sql` — enables live Talk topics for the installation and setup guide (safe to reapply; included in new `community.sql` installations).
7. `talk-activity.sql` — public latest-comment timestamps and attribution for topic metadata and the Talk page summary (requires content-controls; safe to reapply).

Each file is a one-time transactional migration. For an existing installation,
run only the migrations you have not applied, then push the website changes.
The content-controls migration preserves existing discussion text and starts
with an empty word-filter list.

## User pages

Apply `user-pages.sql` before deploying the joined-date/editor/reporting client. It backfills `profiles.joined_on` from `auth.users.created_at` as a UTC date and updates the signup trigger for future accounts. It never publishes emails or the authentication table. Introductions start empty; there is no fabricated join date or biography.

`user_pages` allows public reads and no direct client writes. `community_save_user_page(text,bigint)` derives the owner from the verified session, checks restrictions, the 10,000-character limit, word filters and the existing posting cooldown. A revision check prevents overwrites from another tab or a moderator removal. Blank introductions are supported.

Reports reuse `community_report` with type `user_page` and the profile UUID. The migration preserves discussion reporting, extends the target constraint, and permits null article/topic fields for user pages. Private snapshots include the reported revision. The existing moderation queue links these reports to the public user page. Removal clears the introduction, advances its revision, closes matching reports, and logs the action. It preserves the account and joined date. If the introduction has changed, removal rejects with `report_outdated`; staff must review the current page and dismiss the outdated report before a new report can be filed by that reporter. Report records and snapshots remain inaccessible to public readers.

Run `node --test tests/user-pages-sql.cjs tests/user-pages.cjs` for the database and UI checks. Apply the migration in the live project separately; local checks do not change the hosted database.

Also apply `staff-indicators.sql` after `moderation.sql` to enable public staff
labels in Talk signatures. It exposes only user IDs and current admin/moderator
roles for up to 50 displayed authors per request, including for signed-out
readers. Private moderation tables remain inaccessible. Without this migration,
discussions still load with plain signatures. The signed-in header uses the
existing verified staff-role lookup. Labels are localized, with purple for
admins and green for moderators in both themes; deleted replies have no label.

## Talk loading and counts

Apply `talk-performance.sql` before deploying the updated Talk client. Its
`community_topic_stats(uuid[])` read-only function returns comment and distinct
participant totals for up to 20 topics in one request. The opening post and
deleted reply placeholders count as comments; null/deleted author IDs do not
count as participants. Invoker security preserves the caller's read policies.
No private moderation or authentication records are queried.

Apply `talk-activity.sql` to enable relative latest-comment links for live topics
and the page summary. Its invoker function returns the latest visible, undeleted
post in each article topic, including the opening when it has no replies. It
returns only public IDs, timestamps, titles, and attribution, without reply
bodies. The page summary selects the newest comment across scripted examples
and live topics, including topics beyond the first page. Without this migration,
live counts and replies remain available, and the summary uses scripted examples.

The initial Talk view loads 20 topic openings, one aggregate request, and one activity request,
without downloading reply bodies or author lists. Expand **Replies** to fetch
50 replies at a time. Comment permalinks resolve their topic directly, expand
its replies, and load through the linked comment. **Load more** continues to
offer the rest of the article's topics without duplicating that topic.

Posting and deleting a reply refresh that topic's aggregate. If the aggregate
function is missing, the client falls back to fetching only topic and author
IDs for the displayed topics, in pages of 1,000 replies, to calculate accurate
counts without downloading reply bodies. Apply `talk-performance.sql` to avoid
these additional attribution requests. A failed count update after posting or
deletion retains existing counts.

To bootstrap the first admin, register/verify your own wiki account, copy its
User UID from Supabase Authentication → Users, and run:

```sql
insert into public.community_staff(user_id, role)
values ('YOUR-USER-UUID'::uuid, 'admin');
```

Refresh the site to open **Moderation** in the signed-in header. Admins can
manage roles and posting restrictions there. The Supabase dashboard remains
the owner's recovery path for lost staff access.

## Word filters

Open **Moderation → Word filters** as an admin. Enter a word/phrase, choose a
matching mode, and add it. Rules can be enabled or disabled. The list is private
to admins, with at most 500 rules and terms up to 100 characters.

- **Whole word or phrase** matches with boundaries at both ends. Letters,
  numbers, and underscores count as word characters. This avoids blocking
  parts of longer words.
- **Anywhere in text** matches a literal substring, useful for languages that
  do not separate words with spaces.

Both modes normalize Unicode with NFKC, ignore letter case, and collapse runs
of whitespace. Terms are literal text: punctuation has no regular-expression
meaning. Obfuscated spellings may need additional rules or manual moderation.
Database triggers check new topic titles, topic bodies, and replies, including
staff posts and direct writes. Existing text is not retroactively changed.
Private report details and snapshots are not filtered, allowing users to
describe abuse. Rejected posts retain their browser draft and do not consume
the posting cooldown. No default offensive-word list is installed.

## Deleting replies

Verified, unrestricted members can select **••• → Delete comment** on their
own replies. Moderators/admins can delete any reply without waiting for a
report. Deletion requires confirmation and works on locked topics too.

Deletion clears the public text and author attribution. The reply's ID,
original timestamp, and position remain as a localized deletion placeholder,
preserving permalinks and other replies. Comment totals include placeholders;
participant totals count the remaining public attribution.

Open reports on the deleted reply close as removed. Existing report snapshots
remain private in moderation history, and deletion is logged privately with
the actor and target. There is no restore operation: the original text is
cleared from the public table. Report-based removal uses the same behavior.
Staff removal of an entire topic still removes that topic and all its replies.

After migrating, verify blocked titles/replies, allowed longer words, disabled
rules, owner deletion, rejection of another member's deletion, staff deletion,
and retained report evidence. Check placeholders in a signed-out browser.

## Local automated checks

With Node.js 24.15 or newer, from the repository root:

```powershell
npm install --prefix .tmp/community-check --no-save --ignore-scripts --cache .tmp/npm-cache jsdom@31.0.0 @electric-sql/pglite@0.5.16
node --test tests/community.cjs
node tools/check-pages.cjs
```

The tests use simulated Auth and embedded PostgreSQL. Live Supabase/email flows
still need verification after deployment. Test dependencies stay in the ignored
`.tmp` directory and are not published.
