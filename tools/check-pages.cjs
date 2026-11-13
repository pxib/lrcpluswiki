/* Validate resources inside the folder uploaded by the Pages workflow. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../docs/manual');
const errors = [];
function check(file, reference) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) return;
  const target = path.resolve(path.dirname(file), reference.split(/[?#]/)[0]);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) {
    errors.push(`${path.relative(root, file)}: missing published resource ${reference}`);
  }
}
for (const name of ['index.html', 'ja.html', 'ko.html', 'yue.html', 'account.html', 'ja-account.html', 'ko-account.html', 'yue-account.html', 'user.html', 'ja-user.html', 'ko-user.html', 'yue-user.html']) {
  const file = path.join(root, name);
  const html = fs.readFileSync(file, 'utf8');
  for (const [tag] of html.matchAll(/<(?:script|img|link)\b[^>]*>/gi)) {
    const resource = tag.match(/\bsrc="([^"]+)"/i)
      || (/^<link\b/i.test(tag) && /\brel="(?:stylesheet|icon|alternate)"/i.test(tag) && tag.match(/\bhref="([^"]+)"/i));
    if (resource) check(file, resource[1]);
  }
}
for (const name of fs.readdirSync(root).filter(name => name.endsWith('.css'))) {
  const css = path.join(root, name);
  for (const [, reference] of fs.readFileSync(css, 'utf8').matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) check(css, reference);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log('Pages entry points, scripts, styles, images, fonts, and language links are present.');
