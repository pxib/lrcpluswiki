const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('../.tmp/community-check/node_modules/jsdom');
const root = path.join(__dirname, '../docs/manual');
const script = fs.readFileSync(path.join(root, 'update.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
function page(fetch, url = 'https://example.com/wiki/ja.html#main') {
  const dom = new JSDOM('<html lang="ja"><head><meta name="wiki-build" content="old"></head><body></body></html>', {
    url, runScripts: 'outside-only', pretendToBeVisual: true
  });
  dom.window.fetch = fetch;
  dom.window.eval(script);
  return dom;
}
test('a new deployment shows one localized notice using the deployment-relative manifest', async () => {
  let calls = 0;
  const dom = page(async (url, options) => {
    calls++;
    assert.equal(url.href, 'https://example.com/wiki/version.json');
    assert.equal(options.cache, 'no-store');
    return {ok: true, json: async () => ({build: 'new'})};
  });
  try {
    await settle();
    assert.equal(dom.window.document.querySelector('[role="status"] button').textContent, '再読み込み');
    dom.window.dispatchEvent(new dom.window.Event('focus'));
    await settle();
    assert.equal(calls, 1);
    assert.equal(dom.window.document.querySelectorAll('.wiki-update').length, 1);
  } finally { dom.window.close(); }
});
test('matching versions, invalid manifests, HTTP errors and offline failures stay quiet', async () => {
  for (const response of [
    async () => ({ok: true, json: async () => ({build: 'old'})}),
    async () => ({ok: true, json: async () => ({build: ''})}),
    async () => ({ok: false}),
    async () => { throw new Error('offline'); }
  ]) {
    const dom = page(response);
    try {
      await settle();
      assert.equal(dom.window.document.querySelector('.wiki-update'), null);
    } finally { dom.window.close(); }
  }
});
test('bundled file copies never fetch updates', async () => {
  let calls = 0;
  const dom = page(async () => { calls++; }, 'file:///manual/index.html');
  try { await settle(); assert.equal(calls, 0); }
  finally { dom.window.close(); }
});
test('every HTML entry point loads the indicator and carries a build marker', () => {
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    assert.match(html, /<meta name="wiki-build" content="[^"]+">/, name);
    assert.match(html, /src="update.js" defer/, name);
    assert.match(html, /href="update.css"/, name);
  }
});
