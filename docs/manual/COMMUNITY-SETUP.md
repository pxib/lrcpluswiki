# Enable accounts and Talk discussions

The code is ready to connect to a Supabase project. Until configured, account
forms are disabled and Talk shows an unavailable message. Reading the manual
and its scripted examples still works offline.

## 1. Create the backend

1. Create a project at [Supabase](https://supabase.com/dashboard).
2. Open **SQL Editor**, paste the contents of
   [community.sql](../../supabase/community.sql), and run it once in the new
   project. The script is transactional; an error rolls it back.
3. In **Authentication → Providers → Email**, enable email/password signup and
   **Confirm email**. Set the minimum password length to **12** in the password
   security settings. The browser also checks this minimum.
4. Configure [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
   before opening registration to the public. Supabase's default mail service
   has restrictions intended for testing.

## 2. Configure email return URLs

Serve the repository's `docs/manual` directory over HTTPS on your existing
host. For local testing, serve the repository over HTTP on localhost; direct
`file://` opening intentionally disables accounts.

In **Authentication → URL Configuration**, set **Site URL** to the full online
address of `account.html`. Add redirect allowlist entries for all four account
pages. For example, if your manual is at `https://example.com/manual/`, use:

```text
https://example.com/manual/account.html**
https://example.com/manual/ja-account.html**
https://example.com/manual/ko-account.html**
https://example.com/manual/yue-account.html**
```

The trailing `**` allows query parameters that preserve the originating Talk
page and identify recovery links. Replace the example origin/path with your
actual host. Add the equivalent localhost entries when testing locally. Keep
the default confirmation and recovery email links using `{{ .ConfirmationURL }}`.

## 3. Connect the website

Find the project URL and **publishable key** in Supabase's project connection/API
settings. Edit [community-config.js](community-config.js):

```js
window.ManualCommunityConfig = Object.freeze({
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  publishableKey: 'sb_publishable_YOUR_PUBLIC_KEY'
});
```

This is public configuration and may be committed. Never use a secret key,
service-role key, database password, or SMTP password here. A legacy `anon` key
also works. The account pages allow connections to `https://*.supabase.co`;
if using a Supabase custom domain, update their `connect-src` policies too.

Publish the changed files through your existing hosting workflow. There is no
build step. Only configured online pages fetch the pinned Supabase JavaScript
SDK from jsDelivr; manual reading has no dependency on that CDN.

## 4. Verify the complete flow

1. Register with a valid email, a unique public username (3–30 ASCII letters,
   digits or underscores), and a password of at least 12 characters.
2. Open the confirmation email, then log in. Confirm the header shows your name
   across the manual and the localized account pages. Logging in returns to
   the originating Talk route. Sessions persist in browser storage until logout
   or expiry; do not use a shared browser for a persistent account session.
3. Open an article's Talk tab and start a topic. Check it appears in a second
   browser without logging in. After one minute, log in there with another
   verified account and reply. All languages share the same article discussions.
4. Verify immediate repeat posts fail with a wait message, anonymous posting
   fails, and raw HTML in a message is displayed as text.
5. Log out, use **Reset password**, open the recovery email, and save a new
   password. The reset form requires a recovery session. Log in with the new
   password; the old password should fail.
6. Disconnect the network: reading still works; account requests and discussion
   loading should report an error without claiming success.

## Permissions and maintenance

Email addresses and passwords remain in Supabase Auth and are never exposed by
the discussion tables. Public profiles contain only user IDs and usernames.
Usernames are unique ignoring case, fixed at signup, and copied to a protected
table so editing Auth metadata cannot change a post's public attribution.

Visitors may read profiles, topics, and replies. Browser clients have no direct
insert, update, or delete privileges. The two posting RPCs derive the author and
timestamp on the server, verify email confirmation and ban status, validate
lengths and article IDs, and serialize rate-limit checks within the transaction.
No wiki article editing is enabled. Posts are plain text, with 160-character
titles and 10,000-character bodies. Topics and replies use pagination; refresh
to see other people's new posts.

Moderation is initially owner-operated in Supabase's Table Editor: delete spam
comments or topics (deleting a topic also deletes its replies), and ban abusive
accounts in Authentication. There are no public moderator controls or user
editing/deletion yet. Deleting an Auth user removes their profile and retains
their posts with a “Deleted user” label. Add newly created manual article IDs to
`community_articles` before allowing discussions on them. Back up the database
and review SMTP and Auth rate limits before public use.

The bundled scripted discussions remain clearly labeled read-only examples;
they are not imported into the real account database.

References: [Password authentication](https://supabase.com/docs/guides/auth/passwords),
[public user data](https://supabase.com/docs/guides/auth/managing-user-data), and
[row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Local automated checks

From the repository root, with Node.js 24.15 or newer:

```powershell
npm install --prefix .tmp/community-check --no-save --ignore-scripts --cache .tmp/npm-cache jsdom@31.0.0 @electric-sql/pglite@0.5.16
node --test tests/community.cjs
```

These test dependencies stay in the ignored `.tmp` directory and are not shipped
to the website. Tests exercise the DOM with a mocked authentication service and
run the SQL against an embedded PostgreSQL database with simulated Supabase
roles. They do not verify SMTP delivery or a real Supabase deployment.
