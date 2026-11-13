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
  const localeScript = dom.window.document.querySelector('script[src^="locales/"]');
  if (localeScript) dom.window.eval(read(localeScript.getAttribute('src')));
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
          if (table === 'user_pages') return {data: options.page || null, error: options.pageError || null};
          if (options.fetch) return options.fetch();
          return {data: options.missing ? null : {id, username: options.username || 'ExampleUser', joined_on: '2025-03-09'}, error: options.error || null};
        }
      };
    },
    async rpc(name, payload) {
      requests.push({rpc: name, payload});
      if (options.rpc) return options.rpc(name, payload);
      if (options.roleError) throw new Error('Missing migration');
      return {data: [{user_id: id, role: options.role || 'moderator'}], error: null};
    }
  };
  api.notice = 'Offline';
  if (options.owner) api.session = {user: {id}};
  w.eval(read('user-page-content.js'));
  w.eval(read('user-page.js'));
  return {dom, requests, api};
}
test('public user pages load only public profile columns in all eight languages', async () => {
  for (const file of ['user.html', 'ja-user.html', 'ko-user.html', 'yue-user.html', 'zh-user.html', 'zh-hant-user.html', 'cs-user.html', 'vi-user.html']) {
    const {dom, requests} = page(file);
    await flush();
    const doc = dom.window.document;
    assert.doesNotMatch(read(file), /\?{3,}/);
    assert.equal(doc.getElementById('user-details').hidden, false);
    assert.match(doc.getElementById('user-heading').textContent, /:ExampleUser$/);
    assert.equal(doc.getElementById('user-username').textContent, 'ExampleUser');
    assert.ok(doc.querySelector('.community-staff-moderator'));
    assert.equal(doc.getElementById('special-tab'), null);
    assert.equal(doc.querySelector('.user-page-editor').hidden, true);
    assert.equal(doc.querySelector('.user-details time').dateTime, '2025-03-09');
    assert.deepEqual(requests[0], {table: 'profiles', columns: 'id,username,joined_on', eq: ['id', id]});
    assert.equal(new URL(dom.window.location.href).searchParams.get('name'), 'ExampleUser');
    assert.equal(new URL(dom.window.location.href).searchParams.has('id'), false);
    for (const link of doc.querySelectorAll('.language-switch a')) {
      assert.equal(new URL(link.href).searchParams.get('name'), 'ExampleUser');
      assert.equal(new URL(link.href).searchParams.has('id'), false);
    }
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
test('user links prefer localized username URLs, fall back to IDs and leave deleted users unlinked', async () => {
  for (const [file, target] of [['user.html','user.html'], ['ja-user.html','ja-user.html'], ['ko-user.html','ko-user.html'], ['yue-user.html','yue-user.html'], ['zh-user.html','zh-user.html'], ['zh-hant-user.html','zh-hant-user.html'], ['cs-user.html','cs-user.html'], ['vi-user.html','vi-user.html']]) {
    const {dom, api} = page(file);
    await flush();
    const link = api.userLink('Example_User', id);
    const url = new URL(link.href);
    assert.ok(url.pathname.endsWith('/' + target));
    assert.equal(url.searchParams.get('name'), 'Example_User');
    assert.equal(url.searchParams.has('id'), false);
    assert.equal(new URL(api.userLink(null, id).href).searchParams.get('id'), id);
    assert.equal(new URL(api.userLink('<invalid>', id).href).searchParams.get('id'), id);
    assert.equal(api.userLink(null).nodeType, 3);
    dom.window.close();
  }
});
test('legacy URLs preserve context and resolve trusted usernames instead of editable auth metadata', async () => {
  const {dom, api, requests} = page('user.html', `?id=${id}&return=manual#introduction`);
  await flush();
  const url = new URL(dom.window.location.href);
  assert.equal(url.searchParams.get('name'), 'ExampleUser');
  assert.equal(url.searchParams.get('return'), 'manual');
  assert.equal(url.hash, '#introduction');
  assert.equal(requests[0].eq[1], id);
  api.session = {user: {id, user_metadata: {username: 'SomeoneElse'}}};
  dom.window.dispatchEvent(new dom.window.Event('communitychange'));
  const link = dom.window.document.querySelector('.account-state a');
  assert.equal(new URL(link.href).searchParams.get('id'), id);
  assert.equal(new URL(link.href).searchParams.has('name'), false);
  dom.window.close();
});

test('owners preview safe Markdown and publish using the loaded revision in all languages', async () => {
  for (const file of ['user.html','ja-user.html','ko-user.html','yue-user.html','zh-user.html','zh-hant-user.html','cs-user.html','vi-user.html']) {
    const options = {owner: true, page: {body: 'Old introduction', revision: 4}, rpc: async name => ({data: name === 'community_save_user_page' ? 5 : [], error: null})};
    const {dom, requests} = page(file, `?id=${id}`, options);
    await flush();
    const doc = dom.window.document;
    const edit = doc.querySelector('[aria-controls="user-page-editor"]');
    assert.equal(edit.hidden, false);
    edit.click();
    const editor = doc.querySelector('.user-page-editor');
    assert.equal(editor.hidden, false);
    const draft = editor.querySelector('textarea');
    assert.equal(draft.value, 'Old introduction');
    draft.value = '# Hello\n- **Bold** and *italic*\n[unsafe](javascript:alert)\n<img src=x onerror=alert(1)>';
    editor.querySelector('button[type="button"]').click();
    const preview = editor.querySelector('.user-page-preview');
    assert.equal(preview.querySelector('h2').textContent, 'Hello');
    assert.ok(preview.querySelector('li strong'));
    assert.equal(preview.querySelector('img,a'), null);
    assert.match(preview.textContent, /<img/);
    editor.dispatchEvent(new dom.window.Event('submit', {cancelable:true}));
    await flush();
    assert.equal(editor.hidden, true);
    assert.equal(doc.querySelector('#user-introduction h2').textContent, 'Hello');
    const save = requests.find(request => request.rpc === 'community_save_user_page');
    assert.equal(save.payload.p_revision, 4);
    assert.equal(save.payload.p_body.startsWith('# Hello'), true);
    dom.window.close();
  }
});
test('conflicts preserve drafts and signing out clears the editor', async () => {
  const {dom, api} = page('user.html', `?id=${id}`, {owner:true, page:{body:'Original',revision:1}, rpc:async name => ({data:[], error:name==='community_save_user_page'?{message:'edit_conflict'}:null})});
  await flush();
  const doc = dom.window.document;
  doc.querySelector('[aria-controls="user-page-editor"]').click();
  const editor = doc.querySelector('.user-page-editor');
  editor.querySelector('textarea').value = 'Keep this draft';
  doc.querySelector('[aria-controls="user-page-editor"]').click();
  assert.equal(editor.querySelector('textarea').value,'Keep this draft');
  editor.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  await flush();
  assert.equal(editor.hidden,false);
  assert.equal(editor.querySelector('textarea').value,'Keep this draft');
  assert.match(editor.querySelector('[role="status"]').textContent,/Another edit/);
  assert.equal(doc.getElementById('user-introduction').textContent,'Original');
  api.session=null;
  dom.window.dispatchEvent(new dom.window.Event('communitychange'));
  assert.equal(editor.hidden,true);
  assert.equal(editor.querySelector('textarea').value,'');
  assert.equal(doc.querySelector('[aria-controls="user-page-editor"]').hidden,true);
  dom.window.close();
});
test('reports target the public user page and clear private drafts on account changes', async () => {
  const {dom, api, requests} = page('user.html', `?id=${id}`, {page:{body:'Reported content',revision:2}, rpc:async name=>({data:name==='community_report'?'report-id':[],error:null})});
  await flush();
  const doc=dom.window.document;
  const report=doc.querySelector('.user-page-title .talk-comment-popup button');
  assert.equal(report.hidden,true);
  api.session={user:{id:'other-user'}};
  dom.window.dispatchEvent(new dom.window.Event('communitychange'));
  assert.equal(doc.querySelector('[aria-controls="user-page-editor"]').hidden,true);
  report.click();
  let form=doc.querySelector('.user-page-report form');
  form.querySelector('textarea').value='Private details';
  form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  await flush();
  const sent=requests.find(request=>request.rpc==='community_report');
  assert.deepEqual({...sent.payload},{p_type:'user_page',p_target:id,p_reason:'spam',p_details:'Private details'});
  assert.equal(form.querySelector('button[type="submit"]').hidden,true);
  assert.doesNotMatch(doc.getElementById('user-introduction').textContent,/Private details/);
  report.click();
  form=doc.querySelector('.user-page-report form');
  form.querySelector('textarea').value='Unsaved private details';
  api.session={user:{id:'different-user'}};
  dom.window.dispatchEvent(new dom.window.Event('communitychange'));
  assert.equal(doc.querySelector('.user-page-report').textContent,'');
  dom.window.close();
});
test('missing user-page migration retains profile viewing and disables editing', async () => {
  const {dom} = page('user.html', `?id=${id}`, {owner:true,pageError:{code:'42P01'}});
  await flush();
  const doc=dom.window.document;
  assert.equal(doc.getElementById('user-details').hidden,false);
  assert.equal(doc.querySelector('[aria-controls="user-page-editor"]').hidden,true);
  assert.match(doc.getElementById('user-status').textContent,/not available yet/);
  dom.window.close();
});
test('title menu copies the username link and supports Escape in every language', async () => {
  for (const file of ['user.html','ja-user.html','ko-user.html','yue-user.html','zh-user.html','zh-hant-user.html','cs-user.html','vi-user.html']) {
    const {dom} = page(file, '?name=ExampleUser');
    await flush();
    const doc=dom.window.document;
    const menu=doc.querySelector('.user-page-title .talk-comment-menu');
    assert.equal(menu.nextElementSibling.id,'user-heading');
    assert.equal(menu.hidden,false);
    const copy=menu.querySelector('a');
    let copied;
    Object.defineProperty(dom.window.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}}});
    menu.open=true;
    copy.click();
    await flush();
    assert.equal(new URL(copied).searchParams.get('name'),'ExampleUser');
    assert.equal(new URL(copied).searchParams.has('id'),false);
    assert.equal(new URL(copied).pathname.endsWith('/'+file),true);
    assert.ok(menu.querySelector('[role="status"]').textContent);
    menu.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(menu.open,false);
    assert.equal(doc.activeElement,menu.querySelector('summary'));
    menu.open=true;
    doc.body.click();
    assert.equal(menu.open,false);
    dom.window.close();
  }
});
test('copy menu offers a selected read-only link when clipboard access is unavailable', async () => {
  const {dom}=page();
  await flush();
  const doc=dom.window.document;
  const menu=doc.querySelector('.user-page-title .talk-comment-menu');
  menu.querySelector('a').click();
  await flush();
  const field=menu.querySelector('input');
  assert.equal(field.readOnly,true);
  assert.equal(new URL(field.value).searchParams.get('name'),'ExampleUser');
  assert.equal(doc.activeElement,field);
  assert.equal(menu.querySelector('textarea'),null);
  dom.window.close();
});
