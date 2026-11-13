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
async function openReplies(dom, selector = '.community-replies') {
  const disclosure = dom.window.document.querySelector(selector);
  disclosure.open = true;
  disclosure.dispatchEvent(new dom.window.Event('toggle'));
  await flush();
}
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

test('staff labels use verified roles in localized headers and public Talk signatures', async () => {
  for (const name of ['index.html','ja.html','ko.html','yue.html']) {
    const dom = page(name, '#main/talk');
    const {emit} = mockAuth(dom);
    await dom.window.ManualCommunity.ready;
    const api = dom.window.ManualCommunity;
    const t = dom.window.ManualCommunityText;
    const topic = {id:'staff-topic',author_id:'admin',title:'Staff topic',body:'Opening',created_at:'2026-01-01',profiles:{username:'AdminUser'}};
    const replies = [
      {id:'mod-reply',author_id:'mod',profiles:{username:'ModUser'}},
      {id:'member-reply',author_id:'member',profiles:{username:'MemberUser',role:'admin'}},
      {id:'deleted-reply',author_id:null,profiles:null,deleted_at:'2026-01-02'}
    ].map(row => ({body:'Reply',created_at:'2026-01-01',...row}));
    const lookups = [];
    let unavailable = false;
    api.client.from = table => ({select(){return this;},eq(){return this;},order(){return this;},async range(){return {data:table==='community_topics'?[topic]:replies,error:null};}});
    api.client.rpc = async (name, payload) => {
      if (name !== 'community_staff_indicators') return {data:[],error:null};
      lookups.push([...payload.p_users]);
      if (unavailable) return {data:null,error:{code:'PGRST202'}};
      return {data:payload.p_users.filter(id => id !== 'member').map(id => ({user_id:id,role:id==='admin'?'admin':'moderator'})),error:null};
    };
    emit('SIGNED_IN',{user:{id:'member',user_metadata:{username:'MemberUser',role:'admin'}}});
    assert.equal(dom.window.document.querySelector('.account-state .community-staff'),null);
    api.staffRole = 'admin';
    dom.window.dispatchEvent(new dom.window.Event('moderationchange'));
    assert.equal(dom.window.document.querySelector('.account-state .community-staff').textContent,
      `(${t.admin.toLocaleLowerCase(dom.window.document.documentElement.lang)})`);
    evalScript(dom,'talk-timestamps.js');
    evalScript(dom,'manual.js');
    evalScript(dom,'community-talk.js');
    await flush();
    emit('SIGNED_OUT',null);
    await flush();
    assert.equal(dom.window.document.querySelector('.account-state .community-staff'),null);
    await openReplies(dom);
    const live = dom.window.document.querySelector('.community-talk');
    assert.equal(live.querySelectorAll('.community-staff').length,2);
    assert.equal(live.querySelector('.community-staff-admin').textContent,`(${t.admin.toLocaleLowerCase(dom.window.document.documentElement.lang)})`);
    assert.equal(live.querySelector('.community-staff-moderator').textContent,`(${t.moderator.toLocaleLowerCase(dom.window.document.documentElement.lang)})`);
    assert.equal(live.querySelector('#community-comment-member-reply .community-staff'),null);
    assert.equal(live.querySelector('#community-comment-deleted-reply .community-staff'),null);
    assert.deepEqual(lookups.at(-1),['mod','member']);
    unavailable = true;
    dom.window.dispatchEvent(new dom.window.Event('manualroutechange'));
    await flush();
    assert.ok(live.querySelector('.talk-signature b'));
    assert.equal(live.querySelector('.community-staff'),null);
    dom.window.close();
  }
});

test('Talk renders untrusted text safely and verified sessions can compose topics and replies', async () => {
  const dom = page('index.html', '#main/talk');
  const { emit } = mockAuth(dom);
  await dom.window.ManualCommunity.ready;
  const api = dom.window.ManualCommunity;
  const topic = { id: 'topic-1', author_id: 'alice', title: '<img src=x onerror=alert(1)>', body: '<script>alert(1)</script>', created_at: '2026-01-01T00:00:00Z', profiles: {username:'Alice'} };
  const comment = { id: 'comment-1', author_id: 'bob', body: '<b>Plain text reply</b>', created_at: topic.created_at, profiles: {username:'Bob'} };
  let reads = 0;
  const posted = [];
  api.client.from = table => {
    const builder = {
      select() { return this; }, eq() { return this; }, order() { return this; },
      async range() { reads++; return {data: table === 'community_topics' ? [topic] : [comment], error: null}; }
    };
    return builder;
  };
  api.client.rpc = async (name, payload) => {
    if (name === 'community_topic_stats') return {data:[{topic_id:topic.id,comment_count:2,participant_count:2}],error:null};
    if (name === 'community_staff_indicators') return {data:[],error:null};
    posted.push({name,payload}); return {data:'new-id',error:null};
  };
  evalScript(dom, 'talk-timestamps.js');
  evalScript(dom, 'manual.js');
  evalScript(dom, 'community-talk.js');
  await flush();
  const doc = dom.window.document;
  const live = doc.querySelector('.community-talk');
  assert.equal(reads, 1, 'initial view only loads topics');
  assert.equal(live.querySelector('.talk-depth-1'), null);
  await openReplies(dom);
  assert.equal(live.nextElementSibling.id, 'talk-body');
  assert.equal(live.querySelector('.talk-topic h2').firstChild.textContent, topic.title);
  assert.equal(live.querySelector('.talk-depth-0 .community-message').textContent, topic.body);
  assert.equal(live.querySelector('.talk-depth-1 .community-message').textContent, comment.body);
  assert.equal(live.querySelector('#community-contents').hidden, false);
  assert.equal(live.querySelector('#community-contents a').hash, '#main/talk/community-topic-topic-1');
  assert.equal(live.querySelector('.section-link').hash, '#main/talk/community-topic-topic-1');
  assert.equal(live.querySelectorAll('.talk-actions').length, 2);
  assert.equal(live.querySelector('.talk-meta').hidden, false);
  assert.deepEqual([...live.querySelectorAll('.talk-meta-item')].map(node => node.textContent), ['2 comments', '2 people in discussion']);
  assert.equal(live.querySelector('.talk-depth-0 .talk-signature').textContent, '— Alice 1 January 2026 at 00:00 (UTC)');
  assert.equal(live.querySelector('.talk-depth-1 .talk-signature').textContent, '— Bob 1 January 2026 at 00:00 (UTC)');
  assert.ok(live.querySelector('.talk-actions a[href*="account.html"]'));
  let copied;
  Object.defineProperty(dom.window.navigator, 'clipboard', {value: {async writeText(value) { copied = value; }}});
  assert.equal(live.querySelectorAll('.talk-comment-popup button').length, 0);
  live.querySelector('.talk-depth-1 .talk-comment-popup a').click();
  await flush();
  assert.equal(new URL(copied).hash, '#main/talk/community-comment-comment-1');
  assert.match(live.textContent, /<script>alert\(1\)<\/script>/);
  assert.equal(live.querySelectorAll('script,img,b b').length, 0);
  assert.ok(live.querySelector('a[href*="account.html"]'));
  assert.equal(doc.querySelectorAll('.community-scripted-label').length, 1);
  emit('SIGNED_IN', {user:{id:'alice',user_metadata:{username:'Alice'}}});
  await flush();
  await openReplies(dom);
  assert.equal(live.querySelectorAll('.talk-actions > a').length, 2);
  assert.equal(live.querySelectorAll('.talk-actions > button').length, 0);
  assert.equal(live.querySelectorAll('.talk-actions [aria-disabled]').length, 0);
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
  const reply = live.querySelector('.talk-actions > a');
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

test('community metadata uses a batched aggregate without downloading replies', async () => {
  const dom = page('index.html', '#main/talk');
  mockAuth(dom);
  await dom.window.ManualCommunity.ready;
  const topic = {id: 'paged', author_id: 'alice', title: 'Paged topic', body: 'Opening', created_at: '2026-01-01T00:00:00Z', profiles: {username: 'Alice'}};
  let replies = Array.from({length: 1001}, (_, i) => ({
    id: `reply-${i}`, author_id: i % 2 ? 'alice' : 'bob', body: 'Reply',
    created_at: topic.created_at, profiles: {username: i % 2 ? 'Alice' : 'Bob'}
  }));
  let replyReads = 0;
  const statsCalls = [];
  dom.window.ManualCommunity.client.rpc = async (name, payload) => {
    assert.equal(name, 'community_topic_stats');
    statsCalls.push(payload);
    return {data:[{topic_id:topic.id,comment_count:replies.length + 1,
      participant_count:new Set([topic.author_id,...replies.map(row => row.author_id)].filter(Boolean)).size}],error:null};
  };
  dom.window.ManualCommunity.client.from = table => ({
    select() { return this; }, eq() { return this; }, order() { return this; },
    async range(start, end) {
      if (table === 'community_comments') replyReads++;
      return {data: (table === 'community_topics' ? [topic] : replies).slice(start, end + 1), error: null};
    }
  });
  evalScript(dom, 'talk-timestamps.js');
  evalScript(dom, 'manual.js');
  evalScript(dom, 'community-talk.js');
  await flush();
  const doc = dom.window.document;
  const labels = () => [...doc.querySelectorAll('.community-talk .talk-meta-item')].map(node => node.textContent);
  assert.deepEqual(labels(), ['1,002 comments', '2 people in discussion']);
  assert.equal(replyReads, 0);
  assert.equal(statsCalls.length, 1);
  assert.deepEqual(Array.from(statsCalls[0].p_topics), ['paged']);
  await openReplies(dom);
  assert.equal(doc.querySelectorAll('.community-talk .talk-depth-1').length, 50);
  const more = doc.querySelector('.community-replies button');
  more.click();
  await flush();
  assert.equal(doc.querySelectorAll('.community-talk .talk-depth-1').length, 100);
  assert.equal(replyReads, 2, 'Load more appends a page instead of resetting replies');
  assert.deepEqual(labels(), ['1,002 comments', '2 people in discussion']);
  replies = [];
  [...doc.querySelectorAll('.community-toolbar button')].find(node => node.textContent === 'Refresh').click();
  await flush();
  assert.deepEqual(labels(), ['1 comment', '1 person in discussion']);
  assert.equal(replyReads, 2);
  dom.window.close();
});

test('comment permalinks load their topic directly and expand paginated replies', async () => {
  const dom = page('index.html', '#main/talk/community-comment-reply-54');
  mockAuth(dom);
  await dom.window.ManualCommunity.ready;
  const topics = Array.from({length:21}, (_, i) => ({id:`topic-${i}`,title:`Topic ${i}`,body:'Opening',created_at:'2026-01-01',author_id:'alice'}));
  const replies = Array.from({length:55}, (_, i) => ({id:`reply-${i}`,topic_id:'topic-20',body:`Reply ${i}`,created_at:'2026-01-01',author_id:'bob'}));
  const reads = [];
  const stats = [];
  const api = dom.window.ManualCommunity;
  api.client.rpc = async (name, payload) => {
    stats.push(Array.from(payload.p_topics));
    return {data:payload.p_topics.map(id => ({topic_id:id,comment_count:id === 'topic-20' ? 56 : 1,participant_count:2})),error:null};
  };
  api.client.from = table => {
    const filters = {};
    return {
      select() { return this; }, eq(key, value) { filters[key] = value; return this; }, order() { return this; },
      async maybeSingle() { reads.push({table,filters}); return {data:replies.find(row => row.id === filters.id),error:null}; },
      async range(start, end) {
        reads.push({table,filters,start,end});
        const rows = (table === 'community_topics' ? topics : replies)
          .filter(row => Object.entries(filters).every(([key,value]) => key === 'article_id' || row[key] === value));
        return {data:rows.slice(start,end + 1),error:null};
      }
    };
  };
  evalScript(dom,'talk-timestamps.js'); evalScript(dom,'manual.js'); evalScript(dom,'community-talk.js');
  await flush();
  const doc = dom.window.document;
  assert.ok(doc.getElementById('community-comment-reply-54'));
  assert.equal(doc.querySelector('.community-replies').open,true);
  assert.equal(doc.querySelectorAll('.community-talk .talk-topic').length,1);
  assert.equal(reads.filter(row => row.table === 'community_topics').length,1);
  assert.equal(reads.find(row => row.table === 'community_topics').filters.id,'topic-20');
  assert.deepEqual(stats,[['topic-20']]);
  const moreTopics = doc.querySelector('.community-talk').lastElementChild;
  moreTopics.click(); await flush();
  assert.equal(doc.querySelectorAll('.community-talk .talk-topic').length,21);
  assert.equal(stats[1].length,20);
  moreTopics.click(); await flush();
  assert.equal(doc.querySelectorAll('.community-talk .talk-topic').length,21, 'preferred topic is not duplicated');
  assert.equal(moreTopics.hidden,true);
  assert.equal(reads.filter(row => row.table === 'community_comments' && row.start !== undefined).length,2,
    'only the requested topic downloads replies');
  dom.window.close();
});

test('missing stats migration and failed reply requests retain readable topics and a retry', async () => {
  const dom = page('yue.html','#main/talk');
  mockAuth(dom);
  await dom.window.ManualCommunity.ready;
  const api = dom.window.ManualCommunity;
  let fail = true;
  api.client.rpc = async () => ({data:null,error:{code:'PGRST202'}});
  api.client.from = table => ({
    select(){return this;},eq(){return this;},order(){return this;},
    async range(){return table === 'community_topics'
      ? {data:[{id:'topic',title:'Topic',body:'Opening',created_at:'2026-01-01'}],error:null}
      : fail ? {data:null,error:Error('Network failure')}
      : {data:[{id:'reply',body:'Recovered reply',created_at:'2026-01-01'}],error:null};}
  });
  evalScript(dom,'talk-timestamps.js');evalScript(dom,'manual.js');evalScript(dom,'community-talk.js');
  await flush();
  const doc = dom.window.document;
  assert.equal(doc.querySelector('.community-replies summary').textContent,'回覆');
  assert.equal(doc.querySelector('.community-talk .talk-meta').hidden,true);
  await openReplies(dom);
  const more = doc.querySelector('.community-replies button');
  assert.equal(more.hidden,false);
  assert.equal(more.disabled,false);
  fail = false; more.click(); await flush();
  assert.match(doc.querySelector('.community-replies').textContent,/Recovered reply/);
  dom.window.close();
});

test('PostgreSQL topic aggregates count all comments, respect RLS, and retain deletion totals', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;`);
    for (const file of ['community.sql','moderation.sql','content-controls.sql','talk-performance.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));
    }
    const alice = '30000000-0000-0000-0000-000000000001';
    const bob = '30000000-0000-0000-0000-000000000002';
    await db.exec(`insert into auth.users values
      ('${alice}','{"username":"Alice"}',now(),null),('${bob}','{"username":"Bob"}',now(),null);`);
    const topic = (await db.query("insert into community_topics(article_id,author_id,title,body) values('main',$1,'Topic','Opening') returning id",[alice])).rows[0].id;
    await db.query(`insert into community_comments(topic_id,author_id,body)
      select $1,case when n % 2 = 0 then $2::uuid else $3::uuid end,'Reply'
      from generate_series(1,1001) n`,[topic,alice,bob]);
    await db.query("insert into community_comments(topic_id,body,deleted_at) values($1,'[deleted]',now())",[topic]);
    async function counts(ids = [topic]) {
      return (await db.query('select * from community_topic_stats($1::uuid[])',[ids])).rows
        .map(row => [row.topic_id,Number(row.comment_count),Number(row.participant_count)]);
    }
    await db.exec('set role anon');
    assert.deepEqual(await counts(),[[topic,1003,2]]);
    assert.deepEqual(await counts([topic,topic]),[[topic,1003,2]]);
    assert.deepEqual(await counts([]),[]);
    await assert.rejects(counts(Array(21).fill(topic)),/too_many_topics/);
    await assert.rejects(db.query('select * from community_reports'),/permission denied/);
    await db.exec(`reset role;delete from auth.users where id='${bob}';set role authenticated`);
    assert.deepEqual(await counts(),[[topic,1003,1]],'deleted profiles lose attribution without reducing comment counts');
    await db.exec("reset role;alter policy comments_read on community_comments using (body <> 'Reply');set role anon");
    assert.deepEqual(await counts(),[[topic,2,1]],'invoker aggregates respect comment read policies');
    await db.exec('reset role;alter policy topics_read on community_topics using (false);alter policy comments_read on community_comments using (false);set role anon');
    assert.deepEqual(await counts(),[]);
  } finally { await db.close(); }
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

test('moderation SQL keeps reports private and enforces roles, locks, restrictions, and review history', async () => {
  const db = new PGlite();
  const admin='10000000-0000-0000-0000-000000000001';
  const moderator='10000000-0000-0000-0000-000000000002';
  const member='10000000-0000-0000-0000-000000000003';
  const author='10000000-0000-0000-0000-000000000004';
  const unverified='10000000-0000-0000-0000-000000000005';
  async function as(id) {await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}'`);}
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;`);
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/community.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/moderation.sql'),'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/staff-indicators.sql'),'utf8'));
    await db.exec(`insert into auth.users values
      ('${admin}','{"username":"AdminUser"}',now(),null),
      ('${moderator}','{"username":"ModUser"}',now(),null),
      ('${member}','{"username":"MemberUser","role":"admin"}',now(),null),
      ('${author}','{"username":"AuthorUser"}',now(),null),
      ('${unverified}','{"username":"Unverified"}',null,null);
      insert into community_staff values('${admin}','admin'),('${moderator}','moderator');`);
    await as(author);
    const topic=(await db.query("select community_start_topic('main','A reported topic','Original content') as id")).rows[0].id;
    await db.exec('reset role');
    const comment=(await db.query('insert into community_comments(topic_id,author_id,body) values($1,$2,$3) returning id',[topic,author,'A reported reply'])).rows[0].id;
    await db.exec('set role anon');
    assert.deepEqual((await db.query('select * from community_staff_indicators($1::uuid[]) order by user_id', [[admin,moderator,member]])).rows,
      [{user_id:admin,role:'admin'},{user_id:moderator,role:'moderator'}]);
    assert.equal((await db.query('select * from community_staff_indicators($1::uuid[])', [[]])).rows.length,0);
    await assert.rejects(db.query('select * from community_staff_indicators($1::uuid[])', [Array(51).fill(admin)]),/too_many_users/);
    await assert.rejects(db.query('select * from community_reports'),/permission denied/);
    await assert.rejects(db.query(`select community_report('topic','${topic}','spam','')`),/permission denied/);
    await as(unverified);
    await assert.rejects(db.query(`select community_report('topic','${topic}','spam','')`),/verified_account_required/);
    await as(member);
    assert.equal((await db.query('select community_staff_role() as role')).rows[0].role,null);
    for(const table of ['community_reports','community_staff','community_restrictions','community_moderation_log']) {
      await assert.rejects(db.query(`select * from ${table}`),/permission denied/);
    }
    await assert.rejects(db.query(`insert into community_staff values('${member}','admin')`),/permission denied/);
    await assert.rejects(db.query('select * from community_report_queue()'),/staff_required/);
    await assert.rejects(db.query(`select community_manage_member('AuthorUser','block','abuse')`),/staff_required/);
    await assert.rejects(db.query(`select community_report('topic','${topic}','invalid','')`),/check constraint/);
    const report=(await db.query(`select community_report('topic','${topic}','spam','Private context') as id`)).rows[0].id;
    await assert.rejects(db.query(`select community_report('topic','${topic}','spam','again')`),/already_reported/);
    await assert.rejects(db.query(`select community_report('comment','${comment}','spam','')`),/posting_too_fast/);
    // Reporting does not consume the member's independent posting allowance.
    await db.query("select community_start_topic('main','Independent post','body')");
    await assert.rejects(db.query(`select community_review_report('${report}','remove')`),/staff_required/);
    await assert.rejects(db.query(`select community_lock_topic('${topic}',true)`),/staff_required/);
    await as(moderator);
    const queue=(await db.query('select * from community_report_queue()')).rows;
    assert.equal(queue[0].reporter,'MemberUser');
    assert.equal(queue[0].content,'A reported topic\n\nOriginal content');
    assert.equal(queue[0].details,'Private context');
    assert.equal(queue[0].email,undefined);
    await assert.rejects(db.query("select community_manage_member('MemberUser','admin','')"),/staff_required/);
    await db.query(`select community_lock_topic('${topic}',true)`);
    await db.exec("reset role;update community_post_limits set last_post_at=now()-interval '2 minutes'");
    await as(member);
    await assert.rejects(db.query(`select community_reply('${topic}','blocked reply')`),/topic_locked/);
    await db.exec("reset role;update community_reports set created_at=now()-interval '2 minutes'");
    await as(member);
    await db.query(`select community_report('comment','${comment}','harassment','context')`);
    await as(moderator);
    await db.query(`select community_review_report('${report}','remove')`);
    assert.equal((await db.query("select * from community_report_queue('removed',0)")).rows.length,2);
    assert.equal((await db.query('select * from community_comments')).rows.length,0);
    await as(admin);
    await assert.rejects(db.query("select community_manage_member('AdminUser','member','')"),/cannot_change_self/);
    await assert.rejects(db.query("select community_manage_member('ModUser','block','abuse')"),/staff_member_protected/);
    await db.query("select community_manage_member('MemberUser','block','Repeated abuse')");
    await as(member);
    await assert.rejects(db.query("select community_start_topic('main','bypass','body')"),/account_restricted/);
    await assert.rejects(db.query(`select community_report('topic','${topic}','spam','')`),/account_restricted/);
    await as(admin);
    await db.query("select community_manage_member('MemberUser','unblock','')");
    await db.query("select community_manage_member('ModUser','member','')");
    await as(moderator);
    assert.equal((await db.query('select community_staff_role() as role')).rows[0].role,null);
    await assert.rejects(db.query('select * from community_report_queue()'),/staff_required/);
    await db.exec('reset role');
    assert.ok((await db.query('select * from community_moderation_log')).rows.length>=5);
  } finally {await db.close();}
});

test('live post Report submits a private report and leaves the content visible', async () => {
  const dom=page('index.html','#main/talk');
  const {emit}=mockAuth(dom);
  await dom.window.ManualCommunity.ready;
  const api=dom.window.ManualCommunity;
  emit('SIGNED_IN',{user:{id:'member',user_metadata:{username:'Member'}}});
  api.client.from=table=>({select(){return this;},eq(){return this;},order(){return this;},async range(){return {data:table==='community_topics'?[{id:'reported-topic',title:'A topic',body:'Keep this visible',created_at:'2026-01-01',author_id:'author',profiles:{username:'Author'}}]:[],error:null};}});
  const calls=[];
  api.client.rpc=async(name,payload)=>{calls.push({name,payload});return {data:name==='community_staff_role'?null:'report-id',error:null};};
  evalScript(dom,'talk-timestamps.js');
  evalScript(dom,'manual.js');
  evalScript(dom,'community-moderation.js');
  evalScript(dom,'community-talk.js');
  await flush();
  const doc=dom.window.document;
  assert.equal(doc.querySelector('#talk-body .community-report'),null);
  const report=[...doc.querySelectorAll('.community-talk .talk-comment-popup button')].find(node=>node.textContent==='Report');
  assert.ok(report);
  report.click();
  const form=doc.querySelector('.community-report');
  assert.match(form.textContent,/Only moderators and admins/);
  form.querySelector('select').value='harassment';
  form.querySelector('textarea').value='Private context';
  form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  await flush();
  const sent=calls.find(call=>call.name==='community_report');
  assert.equal(sent.payload.p_type,'topic');
  assert.equal(sent.payload.p_target,'reported-topic');
  assert.equal(sent.payload.p_reason,'harassment');
  assert.equal(sent.payload.p_details,'Private context');
  assert.match(form.textContent,/Report received/);
  assert.equal(form.querySelector('button[type="submit"]').hidden,true);
  assert.match(doc.querySelector('.community-talk').textContent,/Keep this visible/);
  dom.window.close();
});

test('moderation queue renders text safely, limits admin controls, and clears on logout', async () => {
  const dom=page('account.html','#moderation');
  const {emit}=mockAuth(dom);
  await dom.window.ManualCommunity.ready;
  const api=dom.window.ManualCommunity;
  const calls=[];
  let reviewed=false;
  api.client.rpc=async(name,payload)=>{
    calls.push({name,payload});
    if(name==='community_staff_role')return {data:'moderator',error:null};
    if(name==='community_report_queue')return {data:reviewed?[]:[{id:'report-1',reporter:'Reporter',author:'Author',target_type:'topic',target_id:'topic-1',article_id:'main',content:'<img src=x onerror=alert(1)>',reason:'spam',details:'Private details',status:'open',created_at:'2026-01-01'}],error:null};
    if(name==='community_review_report')reviewed=true;
    return {data:null,error:null};
  };
  emit('SIGNED_IN',{user:{id:'mod',user_metadata:{username:'Moderator'}}});
  evalScript(dom,'account.js');
  evalScript(dom,'community-moderation.js');
  await flush();
  const panel=dom.window.document.getElementById('moderation-panel');
  assert.match(panel.textContent,/Private details/);
  assert.match(panel.textContent,/<img src=x/);
  assert.equal(panel.querySelector('img'),null);
  assert.doesNotMatch(panel.textContent,/Manage members/);
  assert.equal(dom.window.document.querySelector('[data-moderation]').hidden,false);
  [...panel.querySelectorAll('button')].find(node=>node.textContent==='Dismiss report').click();
  await flush();
  assert.equal(calls.find(call=>call.name==='community_review_report').payload.p_action,'dismiss');
  emit('SIGNED_OUT',null);
  assert.doesNotMatch(panel.textContent,/Private details/);
  await flush();
  assert.equal(dom.window.document.querySelector('[data-moderation]').hidden,true);
  dom.window.close();
});

test('word filters enforce literal normalized matching and reply deletion preserves private report evidence', async () => {
  const db=new PGlite();
  const admin='20000000-0000-0000-0000-000000000001';
  const mod='20000000-0000-0000-0000-000000000002';
  const author='20000000-0000-0000-0000-000000000003';
  const member='20000000-0000-0000-0000-000000000004';
  async function as(id){await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`);}
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;`);
    for(const file of ['community.sql','moderation.sql','content-controls.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));
    await db.exec(`insert into auth.users values
      ('${admin}','{"username":"AdminUser"}',now(),null),('${mod}','{"username":"ModUser"}',now(),null),
      ('${author}','{"username":"AuthorUser"}',now(),null),('${member}','{"username":"MemberUser"}',now(),null);
      insert into community_staff values('${admin}','admin'),('${mod}','moderator');`);
    await as(author);
    const topic=(await db.query("select community_start_topic('main','Original topic','Existing blocked text') as id")).rows[0].id;
    await db.exec('reset role');
    const comment=(await db.query('insert into community_comments(topic_id,author_id,body) values($1,$2,$3) returning id',[topic,author,'Original reply to preserve in report'])).rows[0].id;
    const second=(await db.query('insert into community_comments(topic_id,author_id,body) values($1,$2,$3) returning id',[topic,member,'Second reply'])).rows[0].id;
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from community_word_filters'),/permission denied/);
    await assert.rejects(db.query(`select community_delete_comment('${comment}')`),/permission denied/);
    await as(member);
    await assert.rejects(db.query('select * from community_list_word_filters()'),/staff_required/);
    await assert.rejects(db.query("select community_set_word_filter('blocked','whole_word',true)"),/staff_required/);
    await assert.rejects(db.query(`select community_delete_comment('${comment}')`),/comment_delete_forbidden/);
    await db.query(`select community_report('comment','${comment}','spam','Private evidence')`);
    await as(mod);
    await assert.rejects(db.query("select community_set_word_filter('blocked','contains',true)"),/staff_required/);
    await as(admin);
    await db.query("select community_set_word_filter('Blocked','whole_word',true)");
    await db.query("select community_set_word_filter('ＢＬＯＣＫＥＤ','whole_word',true)");
    assert.equal((await db.query('select * from community_list_word_filters()')).rows.length,1);
    await db.query("select community_set_word_filter('bad phrase','whole_word',true)");
    await db.query("select community_set_word_filter('禁止','contains',true)");
    await db.query("select community_set_word_filter('c++.*','contains',true)");
    await as(member);
    await assert.rejects(db.query("select community_check_words('blocked')"),/permission denied/);
    for(const text of ['BLOCKED!','ＢＬＯＣＫＥＤ','a bad\n\tphrase here','これは禁止です','literal c++.* string']) {
      await assert.rejects(db.query("select community_start_topic('main','Clean title',$1)",[text]),/word_filtered/);
    }
    await assert.rejects(db.query("select community_start_topic('main','blocked','clean body')"),/word_filtered/);
    // Failed filtered attempts roll back the posting cooldown.
    await db.query("select community_start_topic('main','Clean title','unblocked and c+++ are allowed')");
    await db.exec("reset role;update community_post_limits set last_post_at=now()-interval '2 minutes'");
    await as(author);
    await assert.rejects(db.query(`select community_reply('${topic}','blocked')`),/word_filtered/);
    await db.query(`select community_reply('${topic}','A clean reply')`);
    await db.query(`select community_delete_comment('${comment}')`);
    const deleted=(await db.query('select * from community_comments where id=$1',[comment])).rows[0];
    assert.equal(deleted.body,'[deleted]');
    assert.equal(deleted.author_id,null);
    assert.ok(deleted.deleted_at);
    await assert.rejects(db.query(`update community_comments set body='Restore text' where id='${comment}'`),/permission denied/);
    // A different account cannot report an already deleted placeholder.
    await assert.rejects(db.query(`select community_report('comment','${comment}','spam','')`),/target_not_found/);
    await as(mod);
    const reports=(await db.query("select * from community_report_queue('removed',0)")).rows;
    assert.equal(reports[0].content,'Original reply to preserve in report');
    assert.equal(reports[0].details,'Private evidence');
    await db.query(`select community_report('comment','${second}','spam','')`);
    const report=(await db.query('select * from community_report_queue()')).rows[0];
    await db.query(`select community_review_report('${report.id}','remove')`);
    assert.ok((await db.query('select deleted_at from community_comments where id=$1',[second])).rows[0].deleted_at);
    await as(admin);
    await db.query("select community_set_word_filter('blocked','whole_word',false)");
    await as(member);
    await db.query("select community_start_topic('main','blocked','Now allowed')");
    await db.exec('reset role');
    await assert.rejects(db.query('insert into community_comments(topic_id,author_id,body) values($1,$2,$3)',[topic,member,'bad phrase']),/word_filtered/);
    await assert.rejects(db.query('insert into community_comments(topic_id,body,deleted_at) values($1,$2,now())',[topic,'Hidden original text']),/check constraint/);
    assert.ok((await db.query("select * from community_moderation_log where action='delete_comment'")).rows.length>=2);
  }finally{await db.close();}
});

test('comment menus offer owner deletion with confirmation and render deleted placeholders', async () => {
  const dom=page('index.html','#main/talk');
  const {emit}=mockAuth(dom);
  await dom.window.ManualCommunity.ready;
  const api=dom.window.ManualCommunity;
  emit('SIGNED_IN',{user:{id:'owner',user_metadata:{username:'Owner'}}});
  const rows=[
    {id:'own-reply',body:'Owner original text',author_id:'owner',created_at:'2026-01-01',profiles:{username:'Owner'}},
    {id:'other-reply',body:'Other person text',author_id:'other',created_at:'2026-01-01',profiles:{username:'Other'}}
  ];
  api.client.from=table=>({select(){return this;},eq(){return this;},order(){return this;},async range(){return {data:table==='community_topics'?[{id:'topic',title:'Topic',body:'Opening',created_at:'2026-01-01',author_id:'other',profiles:{username:'Other'}}]:rows,error:null};}});
  const calls=[];
  api.client.rpc=async(name,payload)=>{
    calls.push({name,payload});
    if(name==='community_delete_comment')Object.assign(rows[0],{body:'[deleted]',author_id:null,profiles:null,deleted_at:'2026-01-02'});
    return {data:null,error:null};
  };
  evalScript(dom,'talk-timestamps.js');evalScript(dom,'manual.js');evalScript(dom,'community-moderation.js');evalScript(dom,'community-talk.js');
  await flush();
  await openReplies(dom);
  const doc=dom.window.document;
  const own=doc.getElementById('community-comment-own-reply');
  const other=doc.getElementById('community-comment-other-reply');
  assert.ok([...own.querySelectorAll('button')].find(node=>node.textContent==='Delete comment'));
  assert.equal([...other.querySelectorAll('button')].find(node=>node.textContent==='Delete comment'),undefined);
  const remove=[...own.querySelectorAll('button')].find(node=>node.textContent==='Delete comment');
  dom.window.confirm=()=>false;remove.click();await flush();
  assert.equal(calls.filter(call=>call.name==='community_delete_comment').length,0);
  dom.window.confirm=()=>true;remove.click();await flush();
  assert.equal(calls.find(call=>call.name==='community_delete_comment').payload.p_comment,'own-reply');
  const placeholder=doc.getElementById('community-comment-own-reply');
  assert.match(placeholder.textContent,/This comment was deleted/);
  assert.doesNotMatch(placeholder.textContent,/Owner original text/);
  assert.equal([...placeholder.querySelectorAll('button')].find(node=>['Report','Delete comment'].includes(node.textContent)),undefined);
  dom.window.close();
});

test('admins manage literal word filters through the moderation page', async () => {
  const dom=page('account.html','#moderation');
  const {emit}=mockAuth(dom);
  await dom.window.ManualCommunity.ready;
  const api=dom.window.ManualCommunity;
  const calls=[];
  const filters=[];
  api.client.rpc=async(name,payload)=>{
    calls.push({name,payload});
    if(name==='community_staff_role')return {data:'admin',error:null};
    if(name==='community_list_word_filters')return {data:filters,error:null};
    if(name==='community_set_word_filter') {
      filters.splice(0,filters.length,{term:payload.p_term,match_mode:payload.p_mode,enabled:payload.p_enabled});
      return {data:'filter-id',error:null};
    }
    return {data:[],error:null};
  };
  emit('SIGNED_IN',{user:{id:'admin',user_metadata:{username:'Admin'}}});
  evalScript(dom,'account.js');evalScript(dom,'community-moderation.js');await flush();
  const section=dom.window.document.querySelector('.community-word-filters');
  assert.match(section.textContent,/No word filters/);
  section.querySelector('input').value='Test phrase';
  section.querySelector('select').value='contains';
  section.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await flush();
  const saved=calls.find(call=>call.name==='community_set_word_filter');
  assert.equal(saved.payload.p_term,'Test phrase');assert.equal(saved.payload.p_mode,'contains');assert.equal(saved.payload.p_enabled,true);
  const disable=[...section.querySelectorAll('button')].find(node=>node.textContent==='Disable');
  disable.click();await flush();
  assert.equal(calls.filter(call=>call.name==='community_set_word_filter').at(-1).payload.p_enabled,false);
  assert.ok([...section.querySelectorAll('button')].find(node=>node.textContent==='Enable'), section.outerHTML);
  dom.window.close();
});
