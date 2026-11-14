const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('../.tmp/community-check/node_modules/jsdom');
const {PGlite} = require('../.tmp/community-check/node_modules/@electric-sql/pglite');
const root = path.resolve(__dirname, '../docs/manual');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

test('deletion endpoint requires a live identity, password, and confirmation and ignores forged target IDs', async () => {
  const {createDeleteAccountHandler} = await import('../supabase/functions/delete-account/handler.mjs');
  const calls = [];
  let identityError = null, passwordError = null, deleteError = null, verifiedId = 'owner';
  const handler = createDeleteAccountHandler({url: 'https://test.supabase.co', anonKey: 'public', serviceKey: 'private', createClient(url, key, options) {
    assert.equal(options.auth.persistSession, false);
    return key === 'private' ? {auth: {
      getUser: async token => {calls.push(['identity', token]); return {data: {user: {id: 'owner', email: 'owner@example.com'}}, error: identityError};},
      admin: {deleteUser: async id => {calls.push(['delete', id]); return {error: deleteError};}}
    }} : {auth: {
      signInWithPassword: async values => {calls.push(['password', values]); return {data: {user: {id: verifiedId}}, error: passwordError};},
      signOut: async options => {calls.push(['signOut', options]);}
    }};
  }});
  const request = (body = {password: 'current-password', confirmation: 'DELETE'}, token = 'session') => new Request('https://test/functions/v1/delete-account', {
    method: 'POST', headers: token ? {Authorization: `Bearer ${token}`} : {}, body: JSON.stringify(body)
  });
  assert.equal((await handler(new Request('https://test', {method: 'OPTIONS'}))).status, 204);
  assert.equal((await handler(new Request('https://test'))).status, 405);
  assert.equal((await handler(request(undefined, ''))).status, 401);
  assert.equal((await handler(request({password: 'password'}))).status, 400);
  assert.equal(calls.length, 0);
  identityError = {message: 'expired'};
  assert.equal((await handler(request())).status, 401);
  identityError = null;
  passwordError = {status: 400};
  assert.equal((await handler(request())).status, 403);
  passwordError = {status: 429};
  assert.equal((await handler(request())).status, 429);
  passwordError = null;
  verifiedId = 'other';
  assert.equal((await handler(request())).status, 403);
  assert.ok(!calls.some(([name]) => name === 'delete'));
  verifiedId = 'owner';
  deleteError = {message: 'private provider detail'};
  const failure = await handler(request());
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), {error: 'unavailable'});
  deleteError = null;
  const success = await handler(request({password: 'current-password', confirmation: 'DELETE', user_id: 'victim'}));
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), {deleted: true});
  assert.deepEqual(calls.filter(([name]) => name === 'delete'), [['delete', 'owner'], ['delete', 'owner']]);
  assert.deepEqual(calls.at(-1), ['signOut', {scope: 'local'}]);
});

test('settings deletion confirms, handles errors, clears local identity, and preserves another session', async () => {
  const dom = new JSDOM(read('account.html'), {url: 'https://example.com/account.html#settings', runScripts: 'outside-only'});
  const w = dom.window;
  const user = {id: 'owner', email: 'owner@example.com', email_confirmed_at: '2026-01-01'};
  const calls = [];
  let response = {data: {deleted: true}}, confirmed = false, callback;
  w.ManualCommunityConfig = {supabaseUrl: 'https://test.supabase.co', publishableKey: 'sb_publishable_test'};
  w.confirm = () => confirmed;
  const auth = {
    onAuthStateChange(fn) {callback = fn;},
    async getSession() {return {data: {session: {user}}};},
    async getUser() {return {data: {user}};},
    async signOut(options) {calls.push(['logout', options]); callback('SIGNED_OUT', null); return {};}
  };
  w.supabase = {createClient() {return {auth,
    from() {return {select() {return this;}, eq() {return this;}, async single() {return {data: {username: 'Owner'}};}};},
    functions: {async invoke(name, options) {calls.push([name, options]); return typeof response === 'function' ? response() : response;}}
  };}};
  for (const file of ['community-i18n.js', 'community.js', 'account.js']) w.eval(read(file));
  await w.ManualCommunity.ready;
  w.eval(read('account-settings.js'));
  await flush();
  const doc = w.document;
  doc.getElementById('preferences-tab-1').click();
  const form = doc.getElementById('settings-delete-account-form');
  const submit = async () => {
    doc.getElementById('settings-delete-password').value = 'current-password';
    form.dispatchEvent(new w.Event('submit', {cancelable: true}));
    await flush();
  };
  await submit();
  assert.equal(calls.length, 0);
  confirmed = true;
  response = {error: {context: {json: async () => ({error: 'invalid_credentials'})}}};
  await submit();
  assert.match(form.previousSibling.textContent, /Check your email/);
  assert.equal(doc.getElementById('settings-delete-password').value, '');
  assert.equal(w.ManualCommunity.session.user.id, 'owner');
  response = async () => {w.ManualCommunity.session = {user: {id: 'other'}}; return {data: {deleted: true}};};
  await submit();
  assert.ok(!calls.some(([name]) => name === 'logout'));
  w.ManualCommunity.session = {user};
  response = {data: {deleted: true}};
  await submit();
  assert.equal(w.ManualCommunity.session, null);
  assert.equal(doc.querySelector('.account-settings').hidden, true);
  assert.match(doc.getElementById('settings-panel').textContent, /Your account has been deleted/);
  assert.equal(calls[0][0], 'delete-account');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), {body: {password: 'current-password', confirmation: 'DELETE'}});
  dom.window.close();
});

test('Auth deletion cascades private account data and preserves detached discussions and report evidence', async () => {
  const db = new PGlite();
  const owner = '10000000-0000-0000-0000-000000000001';
  const other = '10000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz,created_at timestamptz default now());
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;`);
    const directory = path.resolve(__dirname, '../supabase/migrations');
    for (const name of fs.readdirSync(directory).sort()) await db.exec(fs.readFileSync(path.join(directory, name), 'utf8'));
    await db.query(`insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values($1,'{"username":"Owner"}',now()),($2,'{"username":"Other"}',now())`, [owner, other]);
    const topic = (await db.query("insert into community_topics(article_id,author_id,title,body) values('main',$1,'Topic','Opening') returning id", [owner])).rows[0].id;
    await db.query("insert into community_comments(topic_id,author_id,body) values($1,$2,'Reply')", [topic, owner]);
    await db.query("insert into user_pages(user_id,body) values($1,'Introduction');", [owner]);
    await db.query("insert into community_staff values($1,'admin');", [owner]);
    await db.query("insert into community_post_limits values($1,now());", [owner]);
    await db.query("insert into community_restrictions values($1,'Restricted');", [owner]);
    await db.query("insert into community_reports(reporter_id,target_type,target_id,article_id,topic_id,author_id,content,reason) values($1,'topic',$2,'main',$2,$1,'Private evidence','other')", [owner, topic]);
    await db.query('delete from auth.users where id=$1', [owner]);
    for (const table of ['profiles', 'user_pages', 'community_staff', 'community_restrictions', 'community_post_limits']) {
      const column = table === 'profiles' ? 'id' : 'user_id';
      assert.equal((await db.query(`select * from ${table} where ${column}=$1`, [owner])).rows.length, 0, table);
    }
    assert.deepEqual((await db.query('select body,author_id from community_topics')).rows, [{body: 'Opening', author_id: null}]);
    assert.deepEqual((await db.query('select body,author_id from community_comments')).rows, [{body: 'Reply', author_id: null}]);
    assert.deepEqual((await db.query('select content,reporter_id,author_id from community_reports')).rows, [{content: 'Private evidence', reporter_id: null, author_id: null}]);
    assert.equal((await db.query('select * from auth.users where id=$1', [other])).rows.length, 1);
    // A previously issued JWT must not allow the deleted account to post.
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'`);
    await assert.rejects(db.query("select community_reply($1,'stale token')", [topic]), /verified_account_required/);
  } finally {await db.close();}
});
