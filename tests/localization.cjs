const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('../.tmp/community-check/node_modules/jsdom');
const root = path.resolve(__dirname, '../docs/manual');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const editions = ['index', 'ja', 'ko', 'yue', 'zh', 'cs', 'vi'];
const translated = ['zh', 'cs', 'vi'];
const sorted = items => [...items].sort();
function page(lang, hash = '#main', protocol = 'https:') {
  const dom = new JSDOM(read(`${lang}.html`), {url: `${protocol}//example.com/manual/${lang}.html${hash}`, runScripts: 'outside-only'});
  const w = dom.window;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {get() {return this.textContent;}});
  for (const file of [`locales/${lang}.js`, 'community-i18n.js', 'talk-timestamps.js', 'manual.js']) w.eval(read(file));
  return dom;
}
test('every edition has seven matching manual, account and user language destinations', () => {
  for (const base of editions) for (const kind of ['', 'account', 'user']) {
    const file = kind ? `${base === 'index' ? '' : base + '-'}${kind}.html` : `${base}.html`;
    const dom = new JSDOM(read(file));
    const doc = dom.window.document;
    const links = [...doc.querySelectorAll('.language-switch a')];
    assert.equal(links.length, 7, file);
    assert.equal(links.filter(a => a.hasAttribute('aria-current')).length, 1, file);
    for (const a of links) assert.ok(fs.existsSync(path.join(root, a.getAttribute('href'))), `${file}: ${a.outerHTML}`);
    if (!kind) assert.equal(doc.querySelectorAll('link[rel="alternate"]').length, 7);
    dom.window.close();
  }
});
test('full translated manuals retain every section, link, screenshot, table and literal syntax example', () => {
  const source = new JSDOM(read('index.html'));
  const original = source.window.document.getElementById('articles');
  for (const lang of translated) {
    const dom = new JSDOM(read(`${lang}.html`));
    const articles = dom.window.document.getElementById('articles');
    for (const selector of ['article', '[id]', 'table', 'img', 'code', 'kbd']) assert.equal(articles.querySelectorAll(selector).length, original.querySelectorAll(selector).length, `${lang}: ${selector}`);
    assert.deepEqual(sorted([...articles.querySelectorAll('[id]')].map(n => n.id)), sorted([...original.querySelectorAll('[id]')].map(n => n.id)), lang);
    assert.deepEqual(sorted([...articles.querySelectorAll('a')].map(n => n.getAttribute('href'))), sorted([...original.querySelectorAll('a')].map(n => n.getAttribute('href'))), lang);
    assert.deepEqual([...articles.querySelectorAll('code, kbd')].map(n => n.textContent), [...original.querySelectorAll('code, kbd')].map(n => n.textContent), lang);
    assert.deepEqual([...articles.querySelectorAll('img')].map(n => n.getAttribute('src')), [...original.querySelectorAll('img')].map(n => n.getAttribute('src')), lang);
    assert.ok([...articles.querySelectorAll('a')].every(n => n.textContent.trim()), `${lang}: empty article link`);
    assert.ok(!articles.textContent.includes('<a href='), `${lang}: escaped translation markup`);
    assert.doesNotMatch(articles.innerHTML, /ZXSEG|ZXQ\d|QXZ|undefined/);
    dom.window.close();
  }
  source.window.close();
});
test('community timestamp month names follow each new edition', () => {
  const expected = {zh: /11月/, cs: /listopadu/, vi: /tháng 11/};
  for (const lang of translated) {
    const dom = page(lang);
    const stamp = dom.window.ManualTalkTimestamps.format(new Date('2026-11-13T10:30:00Z'), lang);
    assert.match(stamp, expected[lang]);
    assert.ok(stamp.endsWith('(UTC)'));
    dom.window.close();
  }
});
test('translated article, search, source and Talk routes work offline and preserve language context', () => {
  for (const lang of translated) {
    const dom = page(lang, '#editor/editor-timing', 'file:');
    const w = dom.window, doc = w.document;
    assert.equal(doc.getElementById('editor').hidden, false);
    assert.equal(doc.getElementById('main').hidden, true);
    assert.notEqual(doc.querySelector('#editor .toc summary').textContent, 'Contents');
    const route = hash => {w.location.hash = hash; w.dispatchEvent(new w.Event('hashchange'));};
    route('#editor/source');
    assert.equal(doc.getElementById('source-panel').hidden, false);
    assert.ok(doc.getElementById('source-code').textContent.includes('<article id="editor"'));
    const title = doc.getElementById('editor').dataset.title;
    route(`#search/${encodeURIComponent(title)}`);
    assert.equal(doc.getElementById('search-results').hidden, false);
    assert.ok(doc.querySelector('#search-results a[href="#editor"]'));
    assert.doesNotMatch(doc.getElementById('search-summary').textContent, /\{query\}|\{count\}|articles found/);
    route('#editor/talk');
    assert.equal(doc.getElementById('talk-panel').hidden, false);
    const login = new URL(doc.getElementById('talk-browse-link').href);
    assert.equal(login.pathname, `/manual/${lang}-account.html`);
    assert.equal(login.searchParams.get('return'), '#editor/talk');
    for (const a of doc.querySelectorAll('.language-switch a')) assert.equal(a.hash, '#editor/talk');
    w.close();
  }
});
test('welcome notices consistently invite logging in while keeping valid list markup', () => {
  for (const edition of editions) {
    const dom = new JSDOM(read(`${edition}.html`));
    const notice = dom.window.document.querySelector('.talk-reading');
    assert.equal(notice.querySelectorAll('ul > li').length, 2, edition);
    assert.equal(notice.querySelector('ul a'), null, edition);
    assert.doesNotMatch(notice.textContent, /Youkoso|read-only|架空|가상의|虛構|真正發文/);
    assert.ok(notice.querySelector('a[href$="account.html#login"]'));
    dom.window.close();
  }
});
