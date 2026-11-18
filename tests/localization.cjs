const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {runInNewContext} = require('node:vm');
const {JSDOM} = require('../.tmp/community-check/node_modules/jsdom');
const {buildArticleLanguages} = require('../tools/build-article-languages.cjs');
const root = path.resolve(__dirname, '../docs/manual');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const editions = ['index', 'ja', 'ko', 'yue', 'zh', 'zh-hant', 'cs', 'vi'];
const translated = ['zh', 'zh-hant', 'cs', 'vi'];
const sorted = items => [...items].sort();
function page(lang, hash = '#main', protocol = 'https:') {
  const dom = new JSDOM(read(`${lang}.html`), {url: `${protocol}//example.com/manual/${lang}.html${hash}`, runScripts: 'outside-only'});
  const w = dom.window;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {get() {return this.textContent;}});
  const localeFiles = translated.includes(lang) ? [`locales/${lang}.js`] : [];
  for (const file of [...localeFiles, 'community-i18n.js', 'talk-timestamps.js', 'article-languages.js', 'manual.js']) w.eval(read(file));
  return dom;
}
test('every edition has eight matching manual, account and user language destinations', () => {
  for (const base of editions) for (const kind of ['', 'account', 'user']) {
    const file = kind ? `${base === 'index' ? '' : base + '-'}${kind}.html` : `${base}.html`;
    const dom = new JSDOM(read(file));
    const doc = dom.window.document;
    const links = [...doc.querySelectorAll('.language-switch a')];
    assert.equal(links.length, 8, file);
    assert.equal(links.filter(a => a.hasAttribute('aria-current')).length, 1, file);
    for (const a of links) assert.ok(fs.existsSync(path.join(root, a.getAttribute('href'))), `${file}: ${a.outerHTML}`);
    if (!kind) assert.equal(doc.querySelectorAll('link[rel="alternate"]').length, 8);
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
  const expected = {zh: /11月/, 'zh-hant': /11月/, cs: /listopadu/, vi: /tháng 11/};
  for (const lang of translated) {
    const dom = page(lang);
    const stamp = dom.window.ManualTalkTimestamps.format(new Date('2026-11-13T10:30:00Z'), dom.window.document.documentElement.lang);
    assert.match(stamp, expected[lang]);
    assert.ok(stamp.endsWith('(UTC)'));
    dom.window.close();
  }
});
test('Traditional Chinese uses its own locale and destinations, separate from Simplified Chinese and Cantonese', () => {
  const dom = page('zh-hant');
  const doc = dom.window.document;
  assert.equal(doc.documentElement.lang, 'zh-Hant');
  assert.equal(doc.querySelector('.language-switch [aria-current]').textContent, '繁體中文');
  assert.equal(doc.querySelector('link[hreflang="zh-Hant"]').getAttribute('href'), 'zh-hant.html');
  assert.equal(doc.querySelector('link[hreflang="zh"]').getAttribute('href'), 'zh.html');
  assert.equal(doc.querySelector('link[hreflang="yue-Hant"]').getAttribute('href'), 'yue.html');
  assert.equal(dom.window.ManualCommunityText.login, '登入');
  assert.equal(dom.window.ManualCommunityText.settings, '帳號設定');
  assert.equal(dom.window.ManualLocale.account, 'zh-hant-account.html');
  assert.equal(dom.window.ManualLocale.user, 'zh-hant-user.html');
  assert.ok(doc.querySelector('.welcome').textContent.includes('歡迎'));
  dom.window.close();
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
test('the language menu disables unavailable article translations and restores links when navigating away', () => {
  const articleRoute = '#pronunciation-guide/pronunciation-guide-kana';
  for (const protocol of ['https:', 'file:']) {
    const dom = page('index', articleRoute, protocol);
    const w = dom.window, doc = w.document;
    const languages = [...doc.querySelectorAll('.language-switch a')];
    const english = languages.find(link => link.hreflang === 'en');
    const neko = languages.find(link => link.hreflang === 'neko');
    const translations = languages.filter(link => link !== english && link !== neko);
    const navigate = hash => { w.location.hash = hash; w.dispatchEvent(new w.Event('hashchange')); };

    assert.equal(english.hash, articleRoute);
    assert.equal(neko.hash, '');
    for (const hash of [articleRoute, '#pronunciation-guide/source', '#pronunciation-guide/talk']) {
      navigate(hash);
      for (const link of translations) {
        assert.equal(link.getAttribute('aria-disabled'), 'true', link.hreflang);
        assert.equal(link.hasAttribute('href'), false, link.hreflang);
        assert.equal(link.getAttribute('role'), 'link');
        link.focus();
        assert.notEqual(doc.activeElement, link, link.hreflang);
      }
    }

    for (const hash of ['#editor/editor-timing', '#search/lyrics']) {
      navigate(hash);
      for (const link of translations) {
        assert.equal(link.hash, hash, link.hreflang);
        assert.equal(link.hasAttribute('aria-disabled'), false, link.hreflang);
      }
    }
    w.close();
  }
});
test('article language coverage follows new articles and translations in the edition HTML', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-article-languages-'));
  const write = (file, html) => fs.writeFileSync(path.join(directory, file), html);
  const bundle = path.join(directory, 'article-languages.js');
  const coverage = () => {
    buildArticleLanguages(directory);
    const window = {};
    runInNewContext(fs.readFileSync(bundle, 'utf8'), {window});
    return window.ManualArticleLanguages;
  };
  const main = '<article id="main"></article>';
  const future = '<article id="future-guide"></article>';
  try {
    write('index.html', '<link rel="alternate" hreflang="en" href="index.html">\n'
      + '<link rel="alternate" hreflang="ja" href="ja.html">\n' + main + future);
    write('ja.html', main);
    assert.deepEqual(Array.from(coverage().get('future-guide')), ['en']);

    write('ja.html', main + future + '<article id="local-guide"></article>');
    const updated = coverage();
    assert.equal(updated.has('future-guide'), false);
    assert.deepEqual(Array.from(updated.get('local-guide')), ['ja']);
  } finally {
    for (const file of ['index.html', 'ja.html', 'article-languages.js']) {
      fs.rmSync(path.join(directory, file), {force: true});
    }
    fs.rmdirSync(directory);
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
