'use strict';
(() => {
  const get = id => document.getElementById(id);
  const markdown = get('markdown');
  const preview = get('preview');
  const article = get('article');
  let sources = { en: '', ja: '' };
  let saved = { ...sources };
  let language = 'en';
  let revision = '';
  let token = '';
  let ready = false;
  let saving = false;
  let timer;
  let previewVersion = 0;
  let templates = null;

  const dirty = () => sources.en !== saved.en || sources.ja !== saved.ja;
  function notice(message, error = false) {
    get('connection').textContent = message;
    get('connection').dataset.error = String(error);
  }
  function controls() {
    get('save').disabled = !ready || saving || !dirty();
    get('reload').disabled = !ready || saving;
    for (const id of ['en', 'ja', 'article', 'markdown']) get(id).disabled = !ready || saving;
    get('dirty').textContent = dirty() ? 'Unsaved changes' : 'No unsaved changes';
    get('save').textContent = saving ? 'Saving…' : 'Save to manual';
    for (const lang of ['en', 'ja']) get(lang).setAttribute('aria-pressed', String(lang === language));
  }
  async function request(path, payload) {
    const response = await fetch(path, payload === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Talk-Token': token },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  }
  function showArticle() {
    const filename = language === 'ja' ? 'ja.html' : 'index.html';
    get('open-manual').href = `${filename}#${article.value}/talk`;
    preview.lang = language;
    preview.replaceChildren();
    if (!templates) return;
    const heading = document.createElement('h1');
    heading.textContent = `${language === 'ja' ? 'ノート' : 'Talk'}: ${article.value}`;
    preview.append(heading);
    const template = [...templates.querySelectorAll('template[data-talk-for]')]
      .find(item => item.dataset.talkFor === article.value);
    if (template) {
      preview.append(template.content.cloneNode(true));
      const comments = [...preview.querySelectorAll('.talk-comment')];
      const dates = window.ManualTalkTimestamps.dates(comments, article.value);
      comments.forEach((comment, index) => {
        const time = document.createElement('time');
        time.dateTime = dates[index].toISOString();
        time.textContent = window.ManualTalkTimestamps.format(dates[index], language);
        time.title = language === 'ja' ? '架空の会話の日時' : 'Fictional discussion timestamp';
        comment.querySelector('.talk-signature').append(' ', time);
      });
    }
    else {
      const empty = document.createElement('p');
      empty.textContent = language === 'ja' ? 'このページにはまだ話題がありません。' : 'No topics for this article yet.';
      preview.append(empty);
    }
  }
  async function updatePreview() {
    clearTimeout(timer);
    const version = ++previewVersion;
    preview.setAttribute('aria-busy', 'true');
    get('preview-status').textContent = 'Updating…';
    get('preview-status').dataset.error = 'false';
    try {
      const result = await request('/api/preview', { lang: language, source: sources[language], sources });
      if (version !== previewVersion) return;
      templates = new DOMParser().parseFromString(result.html, 'text/html');
      showArticle();
      get('preview-status').textContent = 'Up to date';
    } catch (error) {
      if (version !== previewVersion) return;
      templates = null;
      preview.replaceChildren();
      get('preview-status').textContent = error.message;
      get('preview-status').dataset.error = 'true';
    } finally {
      if (version === previewVersion) preview.setAttribute('aria-busy', 'false');
    }
  }
  async function load() {
    if (dirty() && !window.confirm('Discard unsaved edits and reload the files from disk?')) return;
    try {
      const state = await request('/api/state');
      sources = { ...state.sources };
      saved = { ...sources };
      revision = state.revision;
      token = state.token;
      const selected = article.value;
      article.replaceChildren(...state.articles.map(id => new Option(id, id)));
      article.value = state.articles.includes(selected) ? selected : (state.articles.includes('main') ? 'main' : state.articles[0]);
      markdown.value = sources[language];
      ready = true;
      controls();
      notice('Connected to talk/en.md and talk/ja.md. Save writes both sources and rebuilds the manual.');
      await updatePreview();
    } catch (error) { notice(`Cannot connect: ${error.message}. Run Scripts/python.exe tools/edit_manual_talk.py and open its printed address.`, true); }
  }
  markdown.addEventListener('input', () => {
    sources[language] = markdown.value;
    controls();
    ++previewVersion; // Invalidate responses for the previous text immediately.
    clearTimeout(timer);
    get('preview-status').textContent = 'Updating…';
    timer = setTimeout(updatePreview, 250);
  });
  for (const lang of ['en', 'ja']) get(lang).addEventListener('click', () => {
    language = lang;
    markdown.value = sources[lang];
    controls();
    updatePreview();
  });
  article.addEventListener('change', showArticle);
  get('reload').addEventListener('click', load);
  async function save() {
    if (!ready || saving || !dirty()) return;
    saving = true;
    controls();
    try {
      const result = await request('/api/save', { sources, revision });
      revision = result.revision;
      saved = { ...sources };
      notice('Saved both Markdown files and rebuilt the manual. Refresh an open manual tab to see your changes.');
    } catch (error) { notice(error.message, true); }
    finally { saving = false; controls(); }
  }
  get('save').addEventListener('click', save);
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });
  window.addEventListener('beforeunload', event => {
    if (dirty()) { event.preventDefault(); event.returnValue = ''; }
  });
  function setTheme(dark) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    get('theme').setAttribute('aria-pressed', String(dark));
  }
  setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
  get('theme').addEventListener('click', () => setTheme(document.documentElement.dataset.theme !== 'dark'));
  if (location.protocol === 'file:') {
    notice('Start the editor with Scripts/python.exe tools/edit_manual_talk.py, then open the localhost address it prints.', true);
  } else load();
})();
