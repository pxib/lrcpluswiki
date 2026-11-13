/* Stamp the uploaded HTML and manifest together, without modifying source commits. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../docs/manual');
const build = process.env.GITHUB_SHA
  ? `${process.env.GITHUB_SHA}-${process.env.GITHUB_RUN_ID || 'local'}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
  : `local-${Date.now()}`;
for (const name of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
  const file = path.join(root, name);
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('<meta name="wiki-build"')) throw new Error(`Missing wiki-build meta: ${name}`);
  fs.writeFileSync(file, html.replace(/<meta name="wiki-build" content="[^"]*">/, `<meta name="wiki-build" content="${build}">`));
}
fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({build}) + '\n');
console.log(`Stamped wiki build ${build}`);
