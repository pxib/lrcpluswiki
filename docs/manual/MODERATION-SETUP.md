# Reports, moderators, and admins

## Enable the database changes

Run [moderation.sql](../../supabase/moderation.sql) once in Supabase's SQL Editor,
as the project owner. It is a separate migration for projects that already ran
`community.sql`. New projects must run `community.sql` first, then this migration.
It preserves existing profiles, topics, and replies. Publish the changed website
files through the existing GitHub Pages workflow.

## Assign your first admin

Register and verify your own wiki account. Find its **User UID** in
**Supabase → Authentication → Users**. In SQL Editor run the following, replacing
the placeholder with your own UUID:

```sql
insert into public.community_staff (user_id, role)
values ('YOUR-USER-UUID'::uuid, 'admin');
```

Refresh the wiki. **Moderation** appears in your signed-in personal tools and
opens `account.html#moderation` (or the localized account page).
No account is promoted automatically, including the first registered account.
The Supabase dashboard remains the owner's recovery path if staff access is lost.

## How reporting works

Open **••• → Report** on a live Talk topic or reply, select a reason (spam,
harassment, inaccurate information, or other), optionally add up to 2,000
characters of context, then submit. Reporting requires a verified account.
There is a one-minute limit between reports, independent of the posting limit,
and an account cannot submit duplicate open reports for the same post.

Reports and reporter identities are private to moderators/admins. Ordinary
members, including the reported author, cannot list reports or read the queue.
Staff see the reported content snapshot, reason, details, reporter, author, and
a link back to the post. Reports do not automatically hide or remove content.
Scripted examples cannot be reported.

## Staff tools

- **Moderators and admins:** review the paginated private queue; dismiss a report
  or remove its content; lock/unlock live topics from their Talk pages.
- **Admins:** use **Manage members** with an exact public username to assign a
  moderator/admin role, return staff to member status, or restrict/restore
  posting and reporting. Restricting an account does not prevent login or reading.
- Staff accounts must first be demoted before receiving a posting restriction.
  An administrator cannot change their own role/restriction, which also keeps
  the last admin from accidentally removing their own access.

Removing a topic removes all its replies. Removal has a confirmation prompt.
All open reports covering the removed content are closed together. Report
snapshots remain available in the review history. Dismissed and removed reports
can be viewed through the queue's status filter. Mutations are recorded in
`community_moderation_log`, readable by the project owner through Supabase.

Roles, restrictions, reports, and audit records have no direct browser table
privileges. Narrow database RPCs check the caller's user ID, email confirmation,
ban/restriction status, and current staff role on every operation. Changing
editable Auth metadata cannot grant staff access. Staff see public usernames,
not private account email addresses. No service-role key is sent to the browser.

## Verify before inviting staff

Use separate member, moderator, and admin accounts. Check a member can report a
post but cannot read the queue, change roles, remove content, or lock topics.
Check a moderator can review and lock but cannot manage members. Check an admin
can grant/revoke staff and restrict/restore a member. Restricting must block
both reporting and posting, including direct RPC calls. Verify a locked topic
rejects replies on the server. Remove a test topic and check its replies and
related open reports are handled together. Refresh after staff role changes.

Local automated checks run with `node --test tests/community.cjs` after installing
the test dependencies described in [COMMUNITY-SETUP.md](COMMUNITY-SETUP.md).
