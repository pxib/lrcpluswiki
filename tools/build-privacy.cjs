/* Build static privacy editions using the wiki's existing translated navigation. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('../.tmp/community-check/node_modules/jsdom');
const root = path.resolve(__dirname, '../docs/manual');
const editions = [['en', ''], ['ja', 'ja-'], ['ko', 'ko-'], ['yue-Hant', 'yue-'], ['zh', 'zh-'], ['zh-Hant', 'zh-hant-'], ['cs', 'cs-'], ['vi', 'vi-']];
function buildPrivacy(check = false) {
  const source = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8').trimEnd();
  for (const [lang, prefix] of editions) {
    const dom = new JSDOM(source);
    const document = dom.window.document;
    const shell = new JSDOM(fs.readFileSync(path.join(root, `${prefix}account.html`), 'utf8'));
    const navigation = shell.window.document;
    document.documentElement.lang = lang;
    document.querySelector('.sidebar').replaceWith(document.importNode(navigation.querySelector('.sidebar'), true));
    document.querySelector('.skip-link').textContent = navigation.querySelector('.skip-link').textContent;
    document.querySelector('.page-tabs a:nth-child(2)').textContent = navigation.querySelector('#manual-return').textContent;
    document.querySelector('#theme-toggle').textContent = navigation.querySelector('#theme-toggle').textContent;
    document.querySelectorAll('link[rel="alternate"], script[src^="locales/"], link[href="traditional-fonts.css"]').forEach(node => node.remove());
    if (['zh', 'zh-Hant', 'cs', 'vi'].includes(lang)) {
      const script = document.createElement('script');
      script.src = `locales/${prefix.slice(0, -1)}.js`;
      document.head.querySelector('script').before(script);
    }
    if (lang === 'zh-Hant') {
      const fonts = document.createElement('link');
      fonts.rel = 'stylesheet'; fonts.href = 'traditional-fonts.css';
      document.head.querySelector('link[href="manual.css"]').after(fonts);
    }
    if (prefix) {
      const text = JSON.parse(fs.readFileSync(path.join(root, `locales/privacy/${prefix.slice(0, -1)}.json`), 'utf8'));
      document.title = `${text.title} · LRCPlus.wiki`;
      document.querySelector('#privacy-heading').textContent = text.title;
      document.querySelector('.page-tabs a').textContent = text.title;
      document.querySelector('footer a').textContent = text.title;
      const subtitle = document.querySelector('.subtitle');
      const time = subtitle.querySelector('time');
      time.textContent = text.date;
      subtitle.replaceChildren(`${text.updated} `, time);
      for (const [selector, values] of [['article > p:not(.subtitle)', text.paragraphs], ['article h2', text.headings], ['article li', text.items]]) {
        const nodes = [...document.querySelectorAll(selector)];
        if (nodes.length !== values.length || values.some(value => !value?.trim())) throw new Error(`Incomplete privacy translation: ${lang} ${selector}`);
        nodes.forEach((node, i) => {node.innerHTML = values[i];});
      }
    }
    document.querySelectorAll('a[href]').forEach(a => {
      if (a.closest('.language-switch')) return;
      a.setAttribute('href', a.getAttribute('href').replace(/^(?:[a-z-]+-)?privacy\.html/, `${prefix}privacy.html`).replace(/^account\.html/, `${prefix}account.html`).replace(/^index\.html/, prefix ? `${prefix.slice(0, -1)}.html` : 'index.html'));
    });
    const links = [...document.querySelectorAll('.language-switch a')];
    if (links.length !== editions.length) throw new Error(`Unexpected language navigation: ${lang}`);
    links.forEach((a, i) => {a.href = `${editions[i][1]}privacy.html`;});
    for (const [code, dest] of editions) {
      const alternate = document.createElement('link');
      alternate.rel = 'alternate'; alternate.hreflang = code; alternate.href = `${dest}privacy.html`;
      document.head.append(alternate);
    }
    const file = path.join(root, `${prefix}privacy.html`);
    const html = dom.serialize().replace(/^[\t ]+$/gm, '') + '\n';
    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== html) throw new Error(`Outdated privacy output: ${prefix}privacy.html`);
    } else fs.writeFileSync(file, html);
    shell.window.close(); dom.window.close();
  }
  // Keep existing manual, account, and user footer links in the same edition.
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html') && !name.endsWith('privacy.html'))) {
    const file = path.join(root, name);
    const html = fs.readFileSync(file, 'utf8');
    const lang = html.match(/<html\b[^>]*\blang="([^"]+)"/i)?.[1];
    const edition = editions.find(([code]) => code.toLowerCase() === lang?.toLowerCase());
    if (!edition) continue;
    const updated = html.replace(/(<footer\b[^>]*>[\s\S]*?<a\b[^>]*href=")(?:[a-z-]+-)?privacy\.html("[^>]*>)/, `$1${edition[1]}privacy.html$2`);
    if (updated === html) continue;
    if (check) throw new Error(`Outdated privacy footer link: ${name}`);
    fs.writeFileSync(file, updated);
  }
}
if (require.main === module) {
  buildPrivacy(process.argv.includes('--check'));
  console.log('All eight privacy policy editions are current.');
}
module.exports = {buildPrivacy};
