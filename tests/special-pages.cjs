const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../.tmp/community-check/node_modules/jsdom');
const base = path.join(__dirname, '../docs/manual');
const read = name => fs.readFileSync(path.join(base, name), 'utf8');
const editions = [
  ['account.html', 'index.html', 'Special pages'],
  ['ja-account.html', 'ja.html', '特別ページ'],
  ['ko-account.html', 'ko.html', '특수 문서'],
  ['yue-account.html', 'yue.html', '特殊頁面']
];
function page(name, mode) {
  const dom = new JSDOM(read(name), {
    url: `https://example.com/manual/${name}?return=%23ayami%2Ftalk#${mode}`,
    runScripts: 'outside-only'
  });
  dom.window.eval(read('community-i18n.js'));
  dom.window.ManualCommunity = {ready: Promise.resolve(), client: null, notice: 'Offline', recovery: false};
  dom.window.eval(read('account.js'));
  return dom;
}
test('all editions expose a working special-page directory and retain return/language context', async () => {
  for (const [account, manual, title] of editions) {
    const dom = page(account, 'special-pages');
    await new Promise(resolve => setImmediate(resolve));
    const doc = dom.window.document;
    assert.equal(doc.getElementById('special-pages-panel').hidden, false);
    assert.equal(doc.getElementById('special-pages-heading').textContent, title);
    assert.equal(doc.querySelectorAll('.special-page-groups>section').length, 3);
    assert.equal(doc.getElementById('login-panel').hidden, true);
    assert.equal(doc.querySelectorAll('.page-tabs a').length, 1);
    assert.equal(doc.getElementById('manual-return').closest('.special-return')?.tagName, 'DIV');
    assert.equal(new URL(doc.getElementById('manual-return').href).hash, '#ayami/talk');
    for (const anchor of doc.querySelectorAll('.language-switch a')) {
      assert.equal(new URL(anchor.href).hash, '#special-pages');
      assert.equal(new URL(anchor.href).searchParams.get('return'), '#ayami/talk');
    }
    assert.ok(read(manual).includes(`${account}#special-pages`));
    for (const anchor of doc.querySelectorAll('.special-page-groups a[href^="#"]')) {
      dom.window.location.hash = anchor.hash;
      dom.window.dispatchEvent(new dom.window.Event('hashchange'));
      assert.equal(doc.getElementById('special-pages-panel').hidden, true);
      assert.equal(doc.getElementById(`${anchor.hash.slice(1)}-panel`).hidden, false);
    }
    dom.window.close();
  }
});
test('preferences tabs support keyboard selection and retain field drafts in all editions', () => {
  for (const [account] of editions) {
    const dom = page(account, 'settings');
    dom.window.eval(read('account-settings.js'));
    const doc = dom.window.document;
    const tabs = [...doc.querySelectorAll('[role="tab"]')];
    const panels = [...doc.querySelectorAll('[role="tabpanel"]')];
    assert.equal(tabs.length, 2);
    assert.equal(panels[0].hidden, false);
    assert.equal(panels[1].hidden, true);
    tabs[0].dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
    assert.equal(tabs[0].tabIndex, -1);
    assert.equal(panels[1].hidden, false);
    assert.equal(panels[0].hidden, true);
    assert.ok(panels[1].contains(doc.getElementById('settings-password-form')));
    const password = doc.getElementById('settings-new-password');
    password.value = 'draft-password';
    tabs[1].dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'Home', bubbles: true}));
    tabs[0].dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'End', bubbles: true}));
    assert.equal(password.value, 'draft-password');
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
    tabs[0].click();
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
    assert.ok(panels[0].contains(doc.getElementById('settings-email-form')));
    dom.window.close();
  }
});
