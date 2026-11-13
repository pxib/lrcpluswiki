/* Install test-only dependencies as described in COMMUNITY-SETUP.md. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../.tmp/community-check/node_modules/jsdom');
const { PGlite } = require('../.tmp/community-check/node_modules/@electric-sql/pglite');
const base = path.join(__dirname, '../docs/manual');
const read = name => fs.readFileSync(path.join(base, name), 'utf8');
function page(name = 'account.html', hash = '', protocol = 'https:') {
  const dom = new JSDOM(read(name), { url: `${protocol}//example.com/manual/${name}${hash}`, runScripts: 'outside-only' });
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {get() { return this.textContent; }});
  dom.window.alert = () => {};
  return dom;
}
function evalScript(dom, file) { dom.window.eval(read(file)); }
function mockAuth(dom, config = true) {
  const calls = [];
  let callback;
  const auth = {
    onAuthStateChange(fn) { callback = fn; return { data: {} }; },
    async getSession() { return { data: { session: null }, error: null }; }
  };
  for (const method of ['signUp','signInWithPassword','resetPasswordForEmail','updateUser','signOut']) {
    auth[method] = async (payload, options) => { calls.push({ method, payload, options }); return { data: {}, error: null }; };
  }
  dom.window.ManualCommunityConfig = config ? { supabaseUrl: 'https://test.supabase.co', publishableKey: 'sb_publishable_test' } : {};
  dom.window.supabase = { createClient() { return { auth }; } };
  evalScript(dom, 'community-i18n.js');
  evalScript(dom, 'community.js');
  return { auth, calls, emit: (event, session) => callback(event, session) };
}
async function flush() { await new Promise(resolve => setImmediate(resolve)); }
async function submit(dom, mode, values) {
  dom.window.location.hash = mode;
  dom.window.dispatchEvent(new dom.window.Event('hashchange'));
  for (const [key, value] of Object.entries(values)) dom.window.document.getElementById(`${mode}-${key}`).value = value;
  dom.window.document.getElementById(`${mode}-form`).dispatchEvent(new dom.window.Event('submit', {cancelable: true}));
  await flush();
}

test('all editions preserve script order, offline reading, and localized account forms', async () => {
  for (const name of ['account.html','ja-account.html','ko-account.html','yue-account.html']) {
    const dom = page(name);
    const { calls } = mockAuth(dom);
    evalScript(dom, 'account.js');
    await dom.window.ManualCommunity.ready;
    await flush();
    const document = dom.window.document;
    assert.equal(document.querySelectorAll('.account-form').length, 4);
    assert.equal(document.getElementById('login-email').type, 'email');
    assert.equal(document.getElementById('create-account-password').minLength, 12);
    assert.equal(document.getElementById('new-password-password').disabled, true);
    assert.ok(Object.values(dom.window.ManualCommunityText).every(Boolean));
    assert.deepEqual(calls, []);
    dom.window.close();
  }
  for (const name of ['index.html','ja.html','ko.html','yue.html']) {
    const dom = page(name, '#main', 'file:');
    let requests = 0;
    dom.window.fetch = () => { requests++; throw Error('Offline request'); };
    mockAuth(dom);
    evalScript(dom, 'talk-timestamps.js');
    evalScript(dom, 'manual.js');
    evalScript(dom, 'community-talk.js');
    await dom.window.ManualCommunity.ready;
    assert.equal(requests, 0);
    assert.equal(dom.window.ManualCommunity.client, null);
    assert.equal(dom.window.document.getElementById('main').hidden, false);
    dom.window.close();
  }
});

test('unconfigured/offline accounts do not load external scripts or accept submissions', async () => {
  for (const protocol of ['https:','file:']) {
    const dom = page('account.html', '', protocol);
    mockAuth(dom, false);
    evalScript(dom, 'account.js');
    await dom.window.ManualCommunity.ready;
    await flush();
    assert.equal(dom.window.ManualCommunity.client, null);
    assert.equal(dom.window.document.getElementById('login-email').disabled, true);
    assert.equal(dom.window.document.querySelectorAll('script[src^="https:"]').length, 0);
    assert.match(dom.window.document.querySelector('.account-feedback').textContent, /not available|online version/);
    dom.window.close();
  }
});

test('signup validates confirmation and sends public username plus safe callback', async () => {
  const dom = page('account.html', '?return=%23ayami%2Ftalk');
  const { calls } = mockAuth(dom);
  evalScript(dom, 'account.js');
  await dom.window.ManualCommunity.ready;
  const values = { username: 'Test_User', email: 'person@example.com', password: 'long-password-test', confirm: 'different-password' };
  await submit(dom, 'create-account', values);
  assert.equal(calls.length, 0);
  assert.match(dom.window.document.querySelector('#create-account-panel .account-feedback').textContent, /do not match/);
  await submit(dom, 'create-account', {...values, confirm: values.password});
  assert.equal(calls[0].method, 'signUp');
  assert.equal(calls[0].payload.options.data.username, 'Test_User');
  assert.equal(new URL(calls[0].payload.options.emailRedirectTo).searchParams.get('return'), '#ayami/talk');
  assert.match(dom.window.document.querySelector('#create-account-panel .account-feedback').textContent, /confirm your account/);
  dom.window.close();
});

test('password recovery requires the recovery event and logout clears the header', async () => {
  const dom = page();
  const { calls, emit } = mockAuth(dom);
  evalScript(dom, 'account.js');
  await dom.window.ManualCommunity.ready;
  await submit(dom, 'password-reset', {email: 'person@example.com'});
  assert.equal(calls[0].method, 'resetPasswordForEmail');
  assert.equal(new URL(calls[0].options.redirectTo).searchParams.get('recovery'), '1');
  const session = {user: {id: 'user-1', user_metadata: {username: 'Test_User'}}};
  emit('PASSWORD_RECOVERY', session);
  assert.equal(dom.window.document.getElementById('new-password-panel').hidden, false);
  assert.equal(dom.window.document.querySelector('.account-state').textContent, 'Test_User');
  await submit(dom, 'new-password', {password: 'replacement-password', confirm: 'replacement-password'});
  assert.deepEqual(calls.map(call => call.method), ['resetPasswordForEmail','updateUser','signOut']);
  emit('SIGNED_OUT', null);
  assert.equal(dom.window.document.querySelector('.account-state').textContent, 'Not logged in');
  assert.equal(dom.window.document.getElementById('new-password-password').disabled, true);
  dom.window.close();
});

test('private API keys are rejected before client creation', async () => {
  const dom = page();
  mockAuth(dom);
  dom.window.ManualCommunityConfig.publishableKey = 'sb_secret_never_publish';
  evalScript(dom, 'community.js');
  await dom.window.ManualCommunity.ready;
  assert.equal(dom.window.ManualCommunity.client, null);
  assert.ok(dom.window.ManualCommunity.error);
  dom.window.close();
});

test('failed login preserves inputs and displays a useful error', async () => {
  const dom = page();
  const { auth } = mockAuth(dom);
  auth.signInWithPassword = async () => ({error: {code: 'invalid_credentials'}});
  evalScript(dom, 'account.js');
  await dom.window.ManualCommunity.ready;
  await submit(dom, 'login', { email: 'person@example.com', password: 'wrong-password' });
  assert.match(dom.window.document.querySelector('#login-panel .account-feedback').textContent, /Check your email/);
  assert.equal(dom.window.document.getElementById('login-email').value, 'person@example.com');
  assert.equal(dom.window.document.querySelector('#login-form button').disabled, false);
  dom.window.close();
});

async function settingsPage(name = 'account.html') {
  const dom = page(name, '?return=%23ayami%2Ftalk#settings');
  const mock = mockAuth(dom);
  await dom.window.ManualCommunity.ready;
  const user = {id:'settings-user',email:'person@example.com',email_confirmed_at:'2026-01-01',user_metadata:{username:'UntrustedMetadata'}};
  mock.auth.getUser = async () => ({data:{user},error:null});
  dom.window.ManualCommunity.client.from = table => {
    assert.equal(table, 'profiles');
    return {select() { return this; }, eq(key, id) { assert.equal(key,'id'); assert.equal(id,user.id); return this; }, async single() { return {data:{username:'Public_Name'},error:null}; }};
  };
  mock.emit('SIGNED_IN', {user});
  evalScript(dom, 'account.js');
  evalScript(dom, 'account-settings.js');
  await flush();
  return {dom, user, ...mock};
}
async function settingsSubmit(dom, form, values) {
  for (const [id, value] of Object.entries(values)) dom.window.document.getElementById(id).value = value;
  dom.window.document.getElementById(`settings-${form}-form`).dispatchEvent(new dom.window.Event('submit', {cancelable:true}));
  await flush();
}

test('settings are localized, use the protected profile, and clear private data on logout', async () => {
  for (const name of ['account.html','ja-account.html','ko-account.html','yue-account.html']) {
    const {dom, emit} = await settingsPage(name);
    const doc = dom.window.document;
    assert.equal(doc.getElementById('settings-panel').hidden, false);
    assert.equal(doc.getElementById('login-panel').hidden, true);
    assert.match(doc.querySelector('.account-details').textContent, /Public_Name/);
    assert.doesNotMatch(doc.querySelector('.account-details').textContent, /UntrustedMetadata/);
    const link = doc.querySelector('[data-account-settings]');
    assert.equal(link.hidden, false);
    assert.equal(new URL(link.href).hash, '#settings');
    assert.equal(new URL(link.href).searchParams.get('return'), '#ayami/talk');
    emit('SIGNED_OUT', null);
    await flush();
    assert.equal(doc.querySelector('.account-settings').hidden, true);
    assert.doesNotMatch(doc.querySelector('.account-details').textContent, /person@example.com/);
    assert.equal(doc.getElementById('settings-email').disabled, true);
    assert.equal(link.hidden, true);
    dom.window.close();
  }
});

test('password settings validate confirmation, require the current password, and preserve drafts across auth events', async () => {
  const {dom, user, auth, calls, emit} = await settingsPage();
  const values = {'settings-current-password':'current-password','settings-new-password':'new-long-password','settings-confirm-password':'different-password'};
  await settingsSubmit(dom,'password',values);
  assert.equal(calls.length,0);
  auth.signInWithPassword = async () => ({error:{code:'invalid_credentials'}});
  values['settings-confirm-password'] = values['settings-new-password'];
  await settingsSubmit(dom,'password',values);
  assert.equal(calls.length,0);
  assert.match(dom.window.document.querySelector('#settings-password-form').previousSibling.textContent, /Check your email/);
  auth.signInWithPassword = async payload => {
    assert.equal(payload.email,user.email);
    assert.equal(payload.password,'current-password');
    emit('SIGNED_IN',{user});
    return {data:{user},error:null};
  };
  await settingsSubmit(dom,'password',values);
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,'updateUser');
  assert.equal(calls[0].payload.password,'new-long-password');
  assert.equal(dom.window.document.getElementById('settings-new-password').value,'');
  assert.match(dom.window.document.querySelector('#settings-password-form').previousSibling.textContent, /has been changed/);
  dom.window.close();
});

test('email changes request confirmation and other-device logout retains the current session', async () => {
  const {dom, user, auth, calls} = await settingsPage();
  auth.signInWithPassword = async () => ({data:{user},error:null});
  await settingsSubmit(dom,'email',{'settings-email':'new@example.com','settings-email-password':'current-password'});
  assert.equal(calls[0].method,'updateUser');
  assert.equal(calls[0].payload.email,'new@example.com');
  assert.equal(new URL(calls[0].options.emailRedirectTo).hash,'#settings');
  assert.match(dom.window.document.querySelector('#settings-email-form').previousSibling.textContent, /confirmation emails/);
  assert.match(dom.window.document.querySelector('.account-details').textContent,/person@example.com/);
  await settingsSubmit(dom,'sessions',{});
  assert.equal(calls[1].method,'signOut');
  assert.equal(calls[1].payload.scope,'others');
  assert.equal(dom.window.ManualCommunity.session.user.id,user.id);
  dom.window.close();
});

test('settings discard stale profile responses after logout', async () => {
  const {dom, auth, emit} = await settingsPage();
  dom.window.location.hash = '#login';
  dom.window.dispatchEvent(new dom.window.Event('hashchange'));
  let resolve;
  auth.getUser = () => new Promise(done => { resolve = done; });
  dom.window.location.hash = '#settings';
  dom.window.dispatchEvent(new dom.window.Event('hashchange'));
  await flush();
  emit('SIGNED_OUT', null);
  await flush();
  resolve({data:{user:{id:'settings-user',email:'private@example.com'}},error:null});
  await flush();
  assert.equal(dom.window.document.querySelector('.account-settings').hidden,true);
  assert.doesNotMatch(dom.window.document.getElementById('settings-panel').textContent,/private@example.com/);
  dom.window.close();
});

test('settings reload after a browser history restore and block unavailable accounts', async () => {
  const {dom} = await settingsPage();
  dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  assert.equal(dom.window.document.querySelector('.account-settings').hidden,true);
  dom.window.dispatchEvent(new dom.window.Event('pageshow'));
  await flush();
  assert.equal(dom.window.document.querySelector('.account-settings').hidden,false);
  dom.window.close();
  const offline = page('account.html','#settings','file:');
  mockAuth(offline,false);
  evalScript(offline,'account.js');
  evalScript(offline,'account-settings.js');
  await offline.window.ManualCommunity.ready;
  await flush();
  assert.equal(offline.window.document.getElementById('settings-email').disabled,true);
  assert.match(offline.window.document.getElementById('settings-panel').textContent,/online version/);
  offline.window.close();
});

test('Talk renders untrusted text safely and verified sessions can compose topics and replies', async () => {
  const dom = page('index.html', '#main/talk');
  const { emit } = mockAuth(dom);
  await dom.window.ManualCommunity.ready;
  const api = dom.window.ManualCommunity;
  const topic = { id: 'topic-1', title: '<img src=x onerror=alert(1)>', body: '<script>alert(1)</script>', created_at: '2026-01-01T00:00:00Z', profiles: {username:'Alice'} };
  const comment = { id: 'comment-1', body: '<b>Plain text reply</b>', created_at: topic.created_at, profiles: {username:'Bob'} };
  let reads = 0;
  const posted = [];
  api.client.from = table => {
    const builder = {
      select() { return this; }, eq() { return this; }, order() { return this; },
      async range() { reads++; return {data: table === 'community_topics' ? [topic] : [comment], error: null}; }
    };
    return builder;
  };
  api.client.rpc = async (name, payload) => { posted.push({name,payload}); return {data:'new-id',error:null}; };
  evalScript(dom, 'talk-timestamps.js');
  evalScript(dom, 'manual.js');
  evalScript(dom, 'community-talk.js');
  await flush();
  const doc = dom.window.document;
  const live = doc.querySelector('.community-talk');
  assert.match(live.textContent, /<script>alert\(1\)<\/script>/);
  assert.equal(live.querySelectorAll('script,img,b b').length, 0);
  assert.ok(live.querySelector('a[href*="account.html"]'));
  assert.equal(doc.querySelectorAll('.community-scripted-label').length, 1);
  emit('SIGNED_IN', {user:{id:'alice',user_metadata:{username:'Alice'}}});
  await flush();
  const topicButton = [...live.querySelectorAll('button')].find(b => b.textContent === 'Start a new topic');
  topicButton.click();
  let form = live.querySelector('form');
  form.querySelector('input').value = 'A new topic';
  form.querySelector('textarea').value = 'Real community message';
  const readsBefore = reads;
  emit('TOKEN_REFRESHED', api.session);
  assert.equal(reads, readsBefore);
  assert.equal(live.querySelector('form'), form);
  form.dispatchEvent(new dom.window.Event('submit', {cancelable:true}));
  await flush();
  assert.equal(posted[0].name, 'community_start_topic');
  assert.equal(posted[0].payload.p_article, 'main');
  assert.equal(posted[0].payload.p_title, 'A new topic');
  const reply = [...live.querySelectorAll('button')].find(b => b.textContent === 'Reply');
  reply.click();
  form = live.querySelector('form');
  form.querySelector('textarea').value = 'A real reply';
  form.dispatchEvent(new dom.window.Event('submit', {cancelable:true}));
  await flush();
  assert.equal(posted[1].name, 'community_reply');
  assert.equal(posted[1].payload.p_topic, 'topic-1');
  assert.equal(doc.querySelectorAll('.community-scripted-label').length, 1);
  dom.window.close();
});

test('PostgreSQL enforces public reads, protected attribution, verification and posting limits', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb, email_confirmed_at timestamptz, banned_until timestamptz);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      grant usage on schema public, auth to anon, authenticated;
    `);
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/community.sql'),'utf8'));
    const articles = [...read('index.html').matchAll(/<article id="([^"]+)/g)].map(m => m[1]);
    const stored = (await db.query('select id from community_articles')).rows.map(r => r.id);
    assert.deepEqual(articles.sort(), stored.sort());
    const alice = '00000000-0000-0000-0000-000000000001';
    const bob = '00000000-0000-0000-0000-000000000002';
    const unverified = '00000000-0000-0000-0000-000000000003';
    await db.exec(`insert into auth.users values
      ('${alice}', '{"username":"Alice"}', now(), null),
      ('${bob}', '{"username":"Bob"}', now(), null),
      ('${unverified}', '{"username":"Unverified"}', null, null);`);
    await assert.rejects(db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000004', '{"username":"alice"}', now(), null)`), /unique/);
    await db.exec('set role anon');
    assert.equal((await db.query('select * from profiles')).rows.length, 3);
    await assert.rejects(db.query('select * from community_post_limits'), /permission denied/);
    await assert.rejects(db.query("select community_start_topic('main','forged','body')"), /permission denied/);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${unverified}'`);
    await assert.rejects(db.query("select community_start_topic('main','test','body')"), /verified_account_required/);
    await db.exec(`set request.jwt.claim.sub = '${alice}'`);
    await assert.rejects(db.query("insert into community_topics(article_id,author_id,title,body) values ('main',null,'forged','body')"), /permission denied/);
    await assert.rejects(db.query("update profiles set username = 'Bob'"), /permission denied/);
    await assert.rejects(db.query("select community_start_topic('nonexistent','test','body')"), /foreign key/);
    await assert.rejects(db.query("select community_start_topic('main','  ','body')"), /check constraint/);
    const topic = (await db.query("select community_start_topic('main','First topic','<script>alert(1)</script>') as id")).rows[0].id;
    assert.equal((await db.query('select author_id from community_topics')).rows[0].author_id, alice);
    await assert.rejects(db.query(`select community_reply('${topic}','too soon')`), /posting_too_fast/);
    await db.exec(`set request.jwt.claim.sub = '${bob}'`);
    await db.query(`select community_reply('${topic}','A real reply')`);
    await assert.rejects(db.query(`delete from community_topics where id = '${topic}'`), /permission denied/);
    await db.exec(`reset role; update auth.users set raw_user_meta_data = '{"username":"Bob"}' where id = '${alice}'`);
    assert.equal((await db.query('select username from profiles where id = $1',[alice])).rows[0].username, 'Alice');
    await db.exec(`delete from auth.users where id = '${alice}'`);
    assert.equal((await db.query('select author_id from community_topics')).rows[0].author_id, null);
    await db.exec(`delete from community_topics where id = '${topic}'`);
    assert.equal((await db.query('select * from community_comments')).rows.length, 0);
  } finally { await db.close(); }
});
