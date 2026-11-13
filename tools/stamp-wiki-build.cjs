/* Stamp the uploaded HTML and manifest together, without modifying source commits. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
function stampHtml(html, build) {
  if (!html.includes('<meta name="wiki-build"')) throw new Error('Missing wiki-build meta');
  html = html.replace(/<meta name="wiki-build" content="[^"]*">/, `<meta name="wiki-build" content="${build}">`);
  // New HTML must not reuse a previous deployment's cached locale or application code.
  return html.replace(/<(?:script|link)\b[^>]*>/gi, tag => {
    if (/^<link\b/i.test(tag) && !/\brel="stylesheet"/i.test(tag)) return tag;
    return tag.replace(/\b(src|href)="([^"]+)"/i, (attribute, key, reference) => {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) return attribute;
      const [resource, fragment] = reference.split('#');
      const queryIndex = resource.indexOf('?');
      const pathname = queryIndex < 0 ? resource : resource.slice(0, queryIndex);
      if (!/\.(?:js|css)$/i.test(pathname)) return attribute;
      const query = new URLSearchParams(queryIndex < 0 ? '' : resource.slice(queryIndex + 1).replaceAll('&amp;', '&'));
      query.set('v', build);
      return `${key}="${pathname}?${query.toString().replaceAll('&', '&amp;')}${fragment === undefined ? '' : '#' + fragment}"`;
    });
  });
}
function stampWiki(root, build) {
  for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
    const file = path.join(root, name);
    const html = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, stampHtml(html, build));
  }
  fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({build}) + '\n');
}
if (require.main === module) {
  const root = path.resolve(__dirname, '../docs/manual');
  const build = process.env.GITHUB_SHA
    ? `${process.env.GITHUB_SHA}-${process.env.GITHUB_RUN_ID || 'local'}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
    : `local-${Date.now()}`;
  stampWiki(root, build);
  console.log(`Stamped wiki build ${build}`);
}
module.exports = {stampHtml, stampWiki};
