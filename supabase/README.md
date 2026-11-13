# Community database updates

Run SQL files in Supabase's SQL Editor as the project owner, in this order:

1. `community.sql` — initial accounts/profiles and discussions.
2. `moderation.sql` — staff roles, private reports, restrictions, and topic locks.
3. `content-controls.sql` — word filters and reply deletion.

Each file is a one-time transactional migration. For an existing installation,
run only the migrations you have not applied, then push the website changes.
The content-controls migration preserves existing discussion text and starts
with an empty word-filter list.

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
