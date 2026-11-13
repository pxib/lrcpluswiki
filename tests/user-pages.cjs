const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('../.tmp/community-check/node_modules/jsdom');
const root = path.join(__dirname, '../docs/manual');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const id = 'e832950b-8173-42a2-b4b8-0065953f0163';
const flush = () => new Promise(resolve => setImmediate(resolve));
function page(file = 'user.html', query = `?id=${id}`, options = {}) {
  const dom = new JSDOM(read(file), {url: `https://example.com/manual/${file}${query}`, runScripts: 'outside-only'});
  const w = dom.window;
  w.ManualCommunityConfig = {};
  w.eval(read('community-i18n.js'));
  w.eval(read('community.js'));
  const api = w.ManualCommunity;
  const requests = [];
  api.client = options.offline ? null : {
    from(table) {
      const request = {table};
      requests.push(request);
      return {
        select(columns) {request.columns = columns; return this;},
        eq(key, value) {request.eq = [key, value]; return this;},
        ilike(key, value) {request.ilike = [key, value]; return this;},
        async maybeSingle() {
          if (options.fetch) return options.fetch();
          return {data: options.missing ? null : {id, username: options.username || 'ExampleUser'}, error: options.error || null};
        }
      };
    },
    async rpc(name, payload) {
      requests.push({rpc: name, payload});
      if (options.roleError) throw new Error('Missing migration');
      return {data: [{user_id: id, role: options.role || 'moderator'}], error: null};
    }
  };
  api.notice = 'Offline';
  w.eval(read('user-page.js'));
  return {dom, requests, api};
}
test('public user pages load only public profile columns in all four languages', async () => {
  for (const file of ['user.html', 'ja-user.html', 'ko-user.html', 'yue-user.html']) {
    const {dom, requests} = page(file);
    await flush();
    const doc = dom.window.document;
    assert.doesNotMatch(read(file), /\?{3,}/);
    assert.equal(doc.getElementById('user-details').hidden, false);
    assert.match(doc.getElementById('user-heading').textContent, /:ExampleUser$/);
    assert.equal(doc.getElementById('user-username').textContent, 'ExampleUser');
    assert.ok(doc.querySelector('.community-staff-moderator'));
    assert.equal(doc.getElementById('special-tab'), null);
    assert.equal(doc.querySelectorAll('form,textarea').length, 0);
    assert.deepEqual(requests[0], {table: 'profiles', columns: 'id,username', eq: ['id', id]});
    for (const link of doc.querySelectorAll('.language-switch a')) assert.equal(new URL(link.href).searchParams.get('id'), id);
    dom.window.close();
  }
});
test('username lookup escapes wildcard underscores and renders untrusted text safely', async () => {
  const {dom, requests} = page('user.html', '?name=Example_User', {username: '<img src=x onerror=alert(1)>'});
  await flush();
  assert.deepEqual(requests[0].ilike, ['username', 'Example\\_User']);
  assert.equal(dom.window.document.querySelector('#user-details img'), null);
  assert.match(dom.window.document.getElementById('user-heading').textContent, /<img/);
  dom.window.close();
});
test('missing, invalid and offline user pages show useful states without bogus profiles', async () => {
  for (const [query, options, message] of [
    ['', {}, /No user selected/],
    ['?name=%25', {}, /User not found/],
    ['?id=invalid', {}, /User not found/],
    [`?id=${id}`, {missing: true}, /User not found/],
    [`?id=${id}`, {offline: true}, /Offline/]
  ]) {
    const {dom, requests} = page('user.html', query, options);
    await flush();
    assert.equal(dom.window.document.getElementById('user-details').hidden, true);
    assert.match(dom.window.document.getElementById('user-status').textContent, message);
    if (!query || options.offline || query.includes('invalid') || query.includes('%25')) assert.equal(requests.length, 0);
    dom.window.close();
  }
});
test('profile read errors can be retried and missing staff RPC leaves the profile readable', async () => {
  const options = {error: {message: 'Failed'}};
  const {dom} = page('user.html', `?id=${id}`, options);
  await flush();
  assert.equal(dom.window.document.getElementById('user-retry').hidden, false);
  options.error = null;
  options.roleError = true;
  dom.window.document.getElementById('user-retry').click();
  await flush();
  assert.equal(dom.window.document.getElementById('user-details').hidden, false);
  assert.equal(dom.window.document.getElementById('user-role').textContent, '');
  dom.window.close();
});
test('late responses after leaving the page do not repopulate the profile', async () => {
  let resolve;
  const {dom} = page('user.html', `?id=${id}`, {fetch: () => new Promise(done => {resolve = done;})});
  await flush();
  dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  resolve({data: {id, username: 'LateUser'}, error: null});
  await flush();
  assert.equal(dom.window.document.getElementById('user-details').hidden, true);
  dom.window.close();
});
test('user links use localized files and stable IDs and leave deleted users unlinked', async () => {
  for (const [file, target] of [['user.html','user.html'], ['ja-user.html','ja-user.html'], ['ko-user.html','ko-user.html'], ['yue-user.html','yue-user.html']]) {
    const {dom, api} = page(file);
    await flush();
    const link = api.userLink('UntrustedMetadata', id);
    const url = new URL(link.href);
    assert.ok(url.pathname.endsWith('/' + target));
    assert.equal(url.searchParams.get('id'), id);
    assert.equal(url.searchParams.has('name'), false);
    assert.equal(api.userLink(null).nodeType, 3);
    dom.window.close();
  }
});
