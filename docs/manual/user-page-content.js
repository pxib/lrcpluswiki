'use strict';
// Deliberately limited Markdown. Every string becomes text, never raw HTML.
window.ManualUserPageContent = (host, source) => {
  host.replaceChildren();
  function inline(parent, value) {
    const pattern = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^\s)]+)\)/g;
    let offset = 0;
    for (const match of value.matchAll(pattern)) {
      parent.append(document.createTextNode(value.slice(offset, match.index)));
      let node;
      if (match[1] || match[2]) {
        node = document.createElement(match[1] ? 'strong' : 'em');
        node.textContent = match[1] || match[2];
      } else {
        try {
          const url = new URL(match[4], location.href);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported link');
          node = document.createElement('a');
          node.href = url.href;
          node.textContent = match[3];
          node.rel = 'nofollow ugc';
        } catch { node = document.createTextNode(match[0]); }
      }
      parent.append(node);
      offset = match.index + match[0].length;
    }
    parent.append(document.createTextNode(value.slice(offset)));
  }
  let list = null;
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) { list = null; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    let node;
    if (bullet) {
      if (!list) { list = document.createElement('ul'); host.append(list); }
      node = document.createElement('li');
      list.append(node);
    } else {
      list = null;
      node = document.createElement(heading ? `h${heading[1].length + 1}` : 'p');
      host.append(node);
    }
    inline(node, heading ? heading[2] : bullet ? bullet[1] : line);
  }
};
