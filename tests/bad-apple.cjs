'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('../.tmp/community-check/node_modules/jsdom');
const root = path.join(__dirname, '../docs/manual');
const source = fs.readFileSync(path.join(root, 'bad-apple.js'), 'utf8');
const themeSource = fs.readFileSync(path.join(root, 'theme.js'), 'utf8');
const {inflateSync} = require('node:zlib');
const frameAsset = fs.readFileSync(path.join(root, 'assets/media/bad-apple-frames.js'), 'utf8');
const framePayload = JSON.parse(frameAsset.match(/window.ManualBadAppleFrames = (\{.*\});/s)[1]);
const frameData = {...framePayload, data: inflateSync(Buffer.from(framePayload.deflate, 'base64'))};
delete frameData.deflate;
const settle = () => new Promise(resolve => setImmediate(resolve));

function page({load = true, reduced = false, canPlayType = () => 'probably', cells = frameData, lyrics = {defaultLanguage: 'ja', tracks: {ja: {label: '日本語', lrc: ''}}}} = {}) {
  const dom = new JSDOM('<head><style>*{visibility:visible;opacity:1;font-size:16px;font-family:Arial;font-weight:400}main{background-color:rgb(255,255,255);color:rgb(32,33,34)}</style></head><body><aside>Navigation</aside><main id="content"><h1>Existing article</h1><p>These are the actual words already on this page.</p><input id="search"><div contenteditable="true" id="editor"></div></main></body>', {
    url: 'https://example.com/manual/ja.html#main', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const {window: w} = dom;
  const frames = new Map(), draws = [], attempts = [], warnings = [];
  let id = 0, clock = 0, loads = 0, plays = 0, video;
  w.matchMedia = query => ({matches: query.includes('reduced-motion') ? reduced : false, addEventListener() {}});
  w.scrollTo = () => {};
  w.console.warn = (...args) => warnings.push(args);
  w.HTMLMediaElement.prototype.canPlayType = canPlayType;
  w.ManualBadAppleFrames = cells;
  w.ManualBadAppleLyrics = lyrics;
  w.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  w.cancelAnimationFrame = key => frames.delete(key);
  Object.defineProperty(w.performance, 'now', {value: () => clock});
  Object.defineProperty(w.document, 'currentScript', {value: {src: 'https://example.com/manual/bad-apple.js'}});
  w.Range.prototype.getBoundingClientRect = () => ({left: 30, top: 80, width: 8, height: 16, right: 38, bottom: 96});
  w.document.querySelector('main').getBoundingClientRect = () => ({left: 20, top: 60, right: 1000, bottom: 760});
  w.HTMLCanvasElement.prototype.getContext = function () {
    const isDisplay = Boolean(this.closest('.bad-apple'));
    return {scale() {}, clearRect() {}, fillRect() {}, drawImage() { throw new Error('Characters must not mask a video image'); }, measureText() { return {width: 8}; },
      fillText(char, x, y) { if (isDisplay) draws.push({char, x, y, color: this.fillStyle}); },
      getImageData() { throw new Error('Offline character rendering must not read canvas pixels'); }};
  };
  w.HTMLMediaElement.prototype.load = function () {
    if (!this.hasAttribute('src')) return;
    video = this;
    loads++;
    attempts.push(this.src);
    if (typeof load === 'function') queueMicrotask(() => this.dispatchEvent(new w.Event(load(this.src) ? 'loadeddata' : 'error')));
    else if (load) queueMicrotask(() => this.dispatchEvent(new w.Event('loadeddata')));
  };
  w.HTMLMediaElement.prototype.play = function () { plays++; return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = () => {};
  w.eval(source);
  function type(text, target = w.document.body, extra = {}) {
    for (const key of text) target.dispatchEvent(new w.KeyboardEvent('keydown', {key, bubbles: true, ...extra}));
  }
  function frame(time) {
    clock = time;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(time));
  }
  return {dom, w, type, frame, draws, frames, attempts, warnings, get loads() { return loads; }, get plays() { return plays; }, get video() { return video; }};
}

test('stays idle and ignores search, editable text, shortcuts, and IME composition', () => {
  const p = page();
  try {
    assert.equal(p.loads, 0);
    p.type('badapple', p.w.document.querySelector('input'));
    p.type('badapple', p.w.document.querySelector('#editor'));
    p.type('badapple', p.w.document.body, {ctrlKey: true});
    p.type('badapple', p.w.document.body, {isComposing: true});
    assert.equal(p.loads, 0);
    assert.equal(p.w.document.querySelector('.bad-apple'), null);
  } finally { p.dom.window.close(); }
});

test('actual article characters assemble before playback and return without changing the article', async () => {
  const p = page();
  try {
    const content = p.w.document.querySelector('main');
    const original = content.innerHTML;
    const input = content.querySelector('input');
    input.focus();
    p.type('badapple');
    await settle();
    assert.equal(p.loads, 1);
    assert.equal(p.w.document.querySelector('.bad-apple').dataset.phase, 'assembling');
    assert.equal(p.plays, 0);
    p.frame(0);
    assert.equal(p.draws.map(draw => draw.char).join(''), 'ExistingarticleThesearetheactualwordsalreadyonthispage.');
    assert.ok(p.draws.every(draw => draw.x === 30));
    p.draws.length = 0;
    p.frame(1000);
    assert.ok(p.draws.some(draw => draw.x !== 30));
    assert.equal(p.plays, 0);
    p.frame(1900);
    assert.equal(p.plays, 0, 'the completed starting frame holds before playback');
    p.frame(2300);
    assert.equal(p.plays, 1);
    assert.equal(p.w.document.querySelector('.bad-apple').dataset.phase, 'playing');
    const sound = p.w.document.querySelector('.bad-apple button');
    sound.click();
    assert.equal(sound.getAttribute('aria-pressed'), 'true');
    p.type(['Escape']);
    assert.equal(p.w.document.querySelector('.bad-apple').dataset.phase, 'returning');
    p.frame(3400);
    assert.equal(p.w.document.querySelector('.bad-apple'), null);
    assert.equal(content.innerHTML, original);
    assert.equal(content.className, '');
    assert.equal(content.inert, undefined);
    assert.equal(p.w.document.activeElement, input);
    assert.equal(p.frames.size, 0);
  } finally { p.dom.window.close(); }
});

test('Escape during loading cancels media and restores interaction; a second trigger works', async () => {
  const p = page({load: false});
  try {
    p.type('badapple');
    assert.ok(p.w.document.querySelector('.bad-apple'));
    p.type(['Escape']);
    await settle();
    assert.equal(p.w.document.querySelector('.bad-apple'), null);
    assert.equal(p.w.document.querySelector('.bad-apple-notice'), null);
    p.type('badapple');
    assert.equal(p.loads, 2);
    p.type(['Escape']);
    await settle();
  } finally { p.dom.window.close(); }
});

test('viewport changes during assembly clean up immediately', async () => {
  const p = page();
  try {
    p.type('badapple');
    await settle();
    p.frame(800);
    p.w.dispatchEvent(new p.w.Event('resize'));
    assert.equal(p.w.document.querySelector('.bad-apple'), null);
    assert.equal(p.w.document.querySelector('.bad-apple-source'), null);
    assert.equal(p.frames.size, 0);
  } finally { p.dom.window.close(); }
});

test('Escape during assembly reverses from the current positions and restores the page', async () => {
  const p = page();
  try {
    p.type('badapple');
    await settle();
    p.frame(700);
    const positions = p.draws.slice();
    p.type(['Escape']);
    p.draws.length = 0;
    p.frame(700);
    assert.deepEqual(p.draws, positions);
    p.frame(1700);
    assert.equal(p.w.document.querySelector('.bad-apple'), null);
    assert.equal(p.plays, 0);
  } finally { p.dom.window.close(); }
});

test('failed media restores the article and reports the failure', async () => {
  const p = page({load: false});
  try {
    p.type('badapple');
    p.video.dispatchEvent(new p.w.Event('error'));
    await settle();
    assert.equal(p.loads, 2, 'a failed source tries the alternative format');
    p.video.dispatchEvent(new p.w.Event('error'));
    await settle();
    assert.equal(p.w.document.querySelector('.bad-apple'), null);
    assert.equal(p.w.document.querySelector('main').className, '');
    assert.match(p.w.document.querySelector('.bad-apple-notice').textContent, /could not load/);
    assert.equal(p.warnings[0][1].length, 2, 'diagnostics include both failed source paths');
    assert.equal(p.frames.size, 0);
  } finally { p.dom.window.close(); }
});

test('reduced motion uses a short assembly and still holds before playback', async () => {
  const p = page({reduced: true});
  try {
    p.type('badapple');
    await settle();
    p.frame(180);
    assert.equal(p.plays, 0);
    p.frame(540);
    assert.equal(p.plays, 1);
    p.type(['Escape']);
    p.frame(730);
    assert.equal(p.w.document.querySelector('.bad-apple'), null);
  } finally { p.dom.window.close(); }
});

test('all manual languages load the effect with a bundled video', () => {
  for (const name of ['index', 'ja', 'ko', 'yue', 'zh', 'zh-hant', 'cs', 'vi']) {
    const html = fs.readFileSync(path.join(root, `${name}.html`), 'utf8');
    assert.ok(/<script\b[^>]*src="bad-apple.js"[^>]*defer/.test(html), name);
    assert.ok(html.includes('href="bad-apple.css"'), name);
  }
  const video = fs.readFileSync(path.join(root, 'assets/media/bad-apple.mp4'));
  assert.equal(video.toString('ascii', 4, 8), 'ftyp');
  const webm = fs.readFileSync(path.join(root, 'assets/media/bad-apple.webm'));
  assert.equal(webm.subarray(0, 4).toString('hex'), '1a45dfa3');
});

test('a failed WebM source falls back to MP4 without interrupting assembly', async () => {
  const p = page({load: url => url.endsWith('.mp4')});
  try {
    p.type('badapple');
    await settle();
    assert.equal(p.loads, 2);
    assert.ok(p.attempts[0].endsWith('/assets/media/bad-apple.webm'));
    assert.ok(p.attempts[1].endsWith('/assets/media/bad-apple.mp4'));
    assert.equal(p.w.document.querySelector('.bad-apple').dataset.phase, 'assembling');
    assert.equal(p.warnings.length, 0);
    p.type(['Escape']);
    p.frame(1000);
  } finally { p.dom.window.close(); }
});

test('a browser advertising MP4 support alone tries that format first', async () => {
  const p = page({canPlayType: type => type.startsWith('video/mp4') ? 'probably' : ''});
  try {
    p.type('badapple');
    await settle();
    assert.equal(p.loads, 1);
    assert.ok(p.attempts[0].endsWith('/assets/media/bad-apple.mp4'));
    p.type(['Escape']);
    p.frame(1000);
  } finally { p.dom.window.close(); }
});

test('temporary theme fades restore light, dark, and unset themes without changing saved preferences', async () => {
  for (const original of ['light', 'dark', null]) {
    const p = page();
    try {
      const root = p.w.document.documentElement;
      if (original !== null) root.dataset.theme = original;
      p.w.localStorage.setItem('lrcplus-manual-theme', 'light');
      const toggle = p.w.document.createElement('button');
      toggle.id = 'theme-toggle';
      toggle.setAttribute('aria-pressed', String(original === 'dark'));
      p.w.document.body.append(toggle);
      p.type('badapple');
      await settle();
      assert.equal(root.dataset.theme, 'dark');
      assert.equal(toggle.getAttribute('aria-pressed'), 'true');
      assert.ok(root.classList.contains('bad-apple-theme-fade'));
      p.frame(800);
      p.type(['Escape']);
      assert.equal(root.getAttribute('data-theme'), original);
      assert.equal(toggle.getAttribute('aria-pressed'), String(original === 'dark'));
      assert.ok(root.classList.contains('bad-apple-theme-returning'));
      p.frame(1800);
      assert.equal(root.className, '');
      assert.equal(p.w.localStorage.getItem('lrcplus-manual-theme'), 'light');
    } finally { p.dom.window.close(); }
  }
});

test('video backgrounds drive the real theme switcher and keep silhouettes visible in both palettes', async () => {
  const p = page();
  try {
    const toggle = p.w.document.createElement('button');
    toggle.id = 'theme-toggle';
    p.w.document.body.append(toggle);
    p.w.localStorage.setItem('lrcplus-manual-theme', 'light');
    p.w.eval(themeSource);
    await settle();
    const timeline = Buffer.from(source.match(/const backgroundTimeline = '([^']+)'/)[1], 'base64');
    assert.ok(timeline.length >= 2190, 'the timeline covers the complete bundled video');
    const white = timeline.findIndex(value => value >= 160);
    const black = timeline.findIndex((value, index) => index > white && value <= 96);
    assert.ok(white > 0 && black > white);
    p.type('badapple');
    await settle();
    p.frame(2300);
    p.video.currentTime = white / 10 + .001;
    p.frame(2500);
    assert.equal(p.w.document.documentElement.dataset.theme, 'light');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    p.video.currentTime = black / 10 + .001;
    p.frame(2800);
    assert.equal(p.w.document.documentElement.dataset.theme, 'dark');
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(p.w.localStorage.getItem('lrcplus-manual-theme'), 'light');
    p.type(['Escape']);
    p.frame(3900);
    assert.equal(p.w.document.documentElement.dataset.theme, 'light');
    toggle.click();
    assert.equal(p.w.document.documentElement.dataset.theme, 'dark');
    assert.equal(p.w.localStorage.getItem('lrcplus-manual-theme'), 'dark', 'the regular switcher still saves manual choices');
  } finally { p.dom.window.close(); }
});

test('each complete character receives one sampled color and changes with the media clock', async () => {
  const p = page({cells: {width: 2, height: 2, fps: 1, count: 2, data: Uint8Array.from([0x05, 0xaf, 0xf0, 0xa5])}});
  try {
    p.type('badapple');
    await settle();
    p.frame(2300);
    const first = p.draws.slice();
    const expected = new Set([0, 5, 10, 15].map(value =>
      `rgb(${[32, 33, 34].map(channel => Math.round(255 + (channel - 255) * value / 15)).join(',')})`));
    assert.equal(first.map(draw => draw.char).join(''), 'ExistingarticleThesearetheactualwordsalreadyonthispage.');
    assert.equal(new Set(first.map(draw => draw.color)).size, 4);
    assert.ok(first.every(draw => expected.has(draw.color)));
    p.draws.length = 0;
    p.video.currentTime = 1;
    p.frame(2600);
    assert.equal(p.draws.map(draw => draw.char).join(''), first.map(draw => draw.char).join(''));
    assert.ok(p.draws.some((draw, index) => draw.color !== first[index].color));
    assert.ok(p.draws.every((draw, index) => draw.x === first[index].x && draw.y === first[index].y));
    p.type(['Escape']);
    p.frame(3700);
  } finally { p.dom.window.close(); }
});

test('packed cell data covers the full clip and invalid data restores the page', async () => {
  assert.equal(frameData.data.length, frameData.width * frameData.height * frameData.count / 2);
  assert.ok(frameData.count / frameData.fps >= 219);
  const p = page({cells: {...frameData, data: new Uint8Array(0)}});
  try {
    p.type('badapple');
    await settle();
    assert.equal(p.w.document.querySelector('.bad-apple'), null);
    assert.equal(p.w.document.querySelector('main').className, '');
    assert.match(p.w.document.querySelector('.bad-apple-notice').textContent, /could not start/);
  } finally { p.dom.window.close(); }
});

test('reduced motion spaces out video-driven theme changes', async () => {
  const p = page({reduced: true});
  try {
    const timeline = Buffer.from(source.match(/const backgroundTimeline = '([^']+)'/)[1], 'base64');
    const white = timeline.findIndex(value => value >= 160);
    const black = timeline.findIndex((value, index) => index > white && value <= 96);
    p.type('badapple');
    await settle();
    p.frame(540);
    p.video.currentTime = white / 10 + .001;
    p.frame(600);
    assert.equal(p.w.document.documentElement.dataset.theme, 'light');
    p.video.currentTime = black / 10 + .001;
    p.frame(900);
    assert.equal(p.w.document.documentElement.dataset.theme, 'light');
    p.frame(1700);
    assert.equal(p.w.document.documentElement.dataset.theme, 'dark');
    p.type(['Escape']);
    p.frame(1900);
  } finally { p.dom.window.close(); }
});

test('Japanese captions follow LRC timing, offsets, repeated timestamps, blank cues, and seeking', async () => {
  const p = page({lyrics: {defaultLanguage: 'ja', tracks: {ja: {label: '日本語', lrc:
    '[offset:+500]\n[00:02.000]最初の行\n[00:03.000]\n[00:04.00][00:06.00]次の行'}}}});
  try {
    p.type('badapple');
    await settle();
    assert.ok(p.w.document.querySelector('.bad-apple-lyrics').hidden);
    p.frame(2300);
    const captions = p.w.document.querySelector('.bad-apple-lyrics');
    const line = captions.querySelector('.bad-apple-lyric-line');
    assert.equal(captions.lang, 'ja');
    assert.equal(captions.hidden, false);
    assert.equal(line.textContent, '');
    p.video.currentTime = 1.5;
    p.frame(2500);
    assert.equal(line.textContent, '最初の行');
    p.video.currentTime = 2.5;
    p.frame(2700);
    assert.equal(line.textContent, '');
    p.video.currentTime = 3.5;
    p.frame(2900);
    assert.equal(line.textContent, '次の行');
    p.video.currentTime = 1.7;
    p.frame(3100);
    assert.equal(line.textContent, '最初の行');
    p.type(['Escape']);
    assert.equal(captions.hidden, true);
    p.frame(4200);
  } finally { p.dom.window.close(); }
});

test('page-language tracks override Japanese, with Japanese fallback for missing translations', async () => {
  for (const language of ['vi', 'cs']) {
    const p = page({lyrics: {defaultLanguage: 'ja', tracks: {
      ja: {label: '日本語', lrc: '[00:00.00]日本語のテスト'},
      vi: {label: 'Tiếng Việt', lrc: '[00:00.00]Dòng thử nghiệm'}
    }}});
    try {
      p.w.document.documentElement.lang = language;
      p.type('badapple');
      await settle();
      p.frame(2300);
      const captions = p.w.document.querySelector('.bad-apple-lyrics');
      assert.equal(captions.lang, language === 'vi' ? 'vi' : 'ja');
      assert.equal(captions.querySelector('.bad-apple-lyric-line').textContent, language === 'vi' ? 'Dòng thử nghiệm' : '日本語のテスト');
      p.type(['Escape']);
      p.frame(3400);
    } finally { p.dom.window.close(); }
  }
});

test('the Lyrics button toggles fixed captions and resumes at the current line without file input', async () => {
  const p = page({lyrics: {defaultLanguage: 'ja', tracks: {ja: {
    label: '日本語', lrc: '[00:00.00]<b>テスト</b>\n[00:01.00]次の行'
  }}}});
  try {
    p.type('badapple');
    await settle();
    p.frame(2300);
    assert.equal(p.w.document.querySelector('.bad-apple input[type="file"]'), null);
    const button = p.w.document.querySelector('.bad-apple-lyrics-toggle');
    const captions = p.w.document.querySelector('.bad-apple-lyrics');
    const line = p.w.document.querySelector('.bad-apple-lyric-line');
    assert.equal(button.textContent, 'Lyrics');
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.equal(button.getAttribute('aria-controls'), captions.id);
    assert.equal(captions.hidden, false);
    assert.equal(line.textContent, '<b>テスト</b>');
    assert.equal(line.querySelector('b'), null);
    button.click();
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.equal(captions.hidden, true);
    p.video.currentTime = 1;
    p.frame(2500);
    assert.equal(line.textContent, '次の行');
    assert.equal(captions.hidden, true);
    button.click();
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.equal(captions.hidden, false);
    assert.equal(line.textContent, '次の行');
    p.type(['Escape']);
    p.frame(3600);
  } finally { p.dom.window.close(); }
});

test('turning lyrics off before playback stays off after the bundled track loads', async () => {
  const p = page({lyrics: {defaultLanguage: 'ja', tracks: {ja: {lrc: '[00:00.00]テスト'}}}});
  try {
    p.type('badapple');
    const button = p.w.document.querySelector('.bad-apple-lyrics-toggle');
    button.click();
    await settle();
    p.frame(2300);
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.equal(p.w.document.querySelector('.bad-apple-lyrics').hidden, true);
    button.click();
    assert.equal(p.w.document.querySelector('.bad-apple-lyrics').hidden, false);
    p.type(['Escape']);
    p.frame(3400);
  } finally { p.dom.window.close(); }
});

test('the supplied Japanese LRC is bundled by default and preserves its cues', async () => {
  const sandbox = {window: {}};
  require('node:vm').runInNewContext(fs.readFileSync(path.join(root, 'assets/media/bad-apple-lyrics.js'), 'utf8'), sandbox);
  const manifest = sandbox.window.ManualBadAppleLyrics;
  const supplied = fs.readFileSync(path.join(root, 'assets/media/badappleja.lrc'), 'utf8').replace(/^\uFEFF/, '');
  assert.equal(manifest.defaultLanguage, 'ja');
  assert.equal(manifest.tracks.ja.lrc, supplied);
  const offset = Number(supplied.match(/^\[offset:([+-]?\d+)\]/mi)?.[1] || 0) / 1000;
  const cues = supplied.split(/\r?\n/).map(line => {
    const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    return match && {time: Math.max(0, Number(match[1]) * 60 + Number(match[2]) - offset), text: match[3]};
  }).filter(Boolean);
  assert.ok(cues.length > 40);
  assert.ok(cues.at(-1).time < 219.1, 'the supplied timings fit the short video');
  const p = page({lyrics: manifest});
  try {
    p.type('badapple');
    await settle();
    p.frame(2300);
    const line = p.w.document.querySelector('.bad-apple-lyric-line');
    assert.equal(line.textContent, '', 'the instrumental introduction stays blank');
    assert.equal(p.w.document.querySelector('.bad-apple-lyric-hint').hidden, true);
    p.video.currentTime = cues[0].time;
    p.frame(2500);
    assert.equal(line.textContent, cues[0].text);
    const blank = cues.find(cue => !cue.text);
    p.video.currentTime = blank.time;
    p.frame(2800);
    assert.equal(line.textContent, '');
    p.type(['Escape']);
    p.frame(3900);
  } finally { p.dom.window.close(); }
});

test('Korean pages select the supplied Korean LRC using the ko language key', async () => {
  const sandbox = {window: {}};
  require('node:vm').runInNewContext(fs.readFileSync(path.join(root, 'assets/media/bad-apple-lyrics.js'), 'utf8'), sandbox);
  const manifest = sandbox.window.ManualBadAppleLyrics;
  const supplied = fs.readFileSync(path.join(root, 'assets/media/badapplekr.lrc'), 'utf8').replace(/^\uFEFF/, '');
  assert.equal(manifest.tracks.ko.lrc, supplied);
  assert.equal(manifest.defaultLanguage, 'ja');
  const first = supplied.match(/\[(\d+):(\d+(?:\.\d+)?)\]\s*([^\r\n]+)/);
  const offset = Number(supplied.match(/^\[offset:([+-]?\d+)\]/mi)?.[1] || 0) / 1000;
  const p = page({lyrics: manifest});
  try {
    p.w.document.documentElement.lang = 'ko';
    p.type('badapple');
    await settle();
    p.frame(2300);
    p.video.currentTime = Math.max(0, Number(first[1]) * 60 + Number(first[2]) - offset);
    p.frame(2500);
    assert.equal(p.w.document.querySelector('.bad-apple-lyrics').lang, 'ko');
    assert.equal(p.w.document.querySelector('.bad-apple-lyric-line').textContent, first[3].trim());
    p.type(['Escape']);
    p.frame(3600);
  } finally { p.dom.window.close(); }
});

test('Vietnamese and both Chinese editions select their bundled tracks, with separate pinyin', async () => {
  const sandbox = {window: {}};
  require('node:vm').runInNewContext(fs.readFileSync(path.join(root, 'assets/media/bad-apple-lyrics.js'), 'utf8'), sandbox);
  const manifest = sandbox.window.ManualBadAppleLyrics;
  for (const language of ['vi', 'zh', 'zh-Hant', 'zh-Hans', 'zh-CN']) {
    const key = language === 'zh-Hant' ? 'zh-Hant' : language.split('-')[0];
    const chinese = key.startsWith('zh');
    const file = key === 'vi' ? 'badapplevi.lrc' : 'badapplezh.lrc';
    const supplied = fs.readFileSync(path.join(root, 'assets/media', file), 'utf8').replace(/^\uFEFF/, '');
    if (key !== 'zh') assert.equal(manifest.tracks[key].lrc, supplied);
    const first = supplied.match(/\[(\d+):(\d+(?:\.\d+)?)\]\s*([^\r\n]+)/);
    const offset = Number(supplied.match(/^\[offset:([+-]?\d+)\]/mi)?.[1] || 0) / 1000;
    const p = page({lyrics: manifest});
    try {
      p.w.document.documentElement.lang = language;
      p.type('badapple');
      await settle();
      p.frame(2300);
      p.video.currentTime = Math.max(0, Number(first[1]) * 60 + Number(first[2]) - offset);
      p.frame(2500);
      assert.equal(p.w.document.querySelector('.bad-apple-lyrics').lang, key);
      const line = p.w.document.querySelector('.bad-apple-lyric-line');
      const reading = p.w.document.querySelector('.bad-apple-lyric-reading');
      if (chinese) {
        const parts = first[3].match(/^(.*?)\s*\(([^()]+)\)\s*$/);
        assert.equal(line.textContent, key === 'zh' ? '一句不经意，平凡话语' : parts[1].trim());
        assert.equal(reading.textContent, parts[2].trim());
        assert.equal(reading.hidden, false);
        assert.equal(reading.lang, 'zh-Latn');
        p.video.currentTime = 218;
        p.frame(2800);
        assert.equal(line.textContent, '');
        assert.equal(reading.textContent, '');
        assert.equal(reading.hidden, true);
      } else {
        assert.equal(line.textContent, first[3].trim());
        assert.equal(reading.hidden, true);
      }
      p.type(['Escape']);
      p.frame(3900);
    } finally { p.dom.window.close(); }
  }
});

test('Simplified conversion preserves Traditional source text, timestamps, offsets, and pinyin', () => {
  const sandbox = {window: {}};
  require('node:vm').runInNewContext(fs.readFileSync(path.join(root, 'assets/media/bad-apple-lyrics.js'), 'utf8'), sandbox);
  const {tracks} = sandbox.window.ManualBadAppleLyrics;
  const original = fs.readFileSync(path.join(root, 'assets/media/badapplezh.lrc'), 'utf8').replace(/^\uFEFF/, '');
  assert.equal(tracks['zh-Hant'].lrc, original);
  assert.notEqual(tracks.zh.lrc, original);
  assert.ok(tracks.zh.lrc.includes('一句不经意，平凡话语'));
  assert.deepEqual(tracks.zh.lrc.match(/\[[^\]]+\]/g), original.match(/\[[^\]]+\]/g));
  assert.deepEqual(tracks.zh.lrc.match(/\([^()]+\)/g), original.match(/\([^()]+\)/g));
});

test('Chinese parenthetical annotations stay intact unless they are Latin pinyin', async () => {
  const p = page({lyrics: {defaultLanguage: 'ja', tracks: {zh: {
    reading: 'pinyin', label: '中文', lrc: '[00:00.00]中文（zhōng wén）\n[00:01.00]中文（注释）'
  }}}});
  try {
    p.w.document.documentElement.lang = 'zh';
    p.type('badapple');
    await settle();
    p.frame(2300);
    const line = p.w.document.querySelector('.bad-apple-lyric-line');
    const reading = p.w.document.querySelector('.bad-apple-lyric-reading');
    assert.equal(line.textContent, '中文');
    assert.equal(reading.textContent, 'zhōng wén');
    p.video.currentTime = 1;
    p.frame(2500);
    assert.equal(line.textContent, '中文（注释）');
    assert.equal(reading.hidden, true);
    p.type(['Escape']);
    p.frame(3600);
  } finally { p.dom.window.close(); }
});

test('mobile playback uses the viewport when navigation pushes the article below the fold', async () => {
  const p = page();
  try {
    p.w.innerWidth = 390;
    p.w.innerHeight = 844;
    p.w.document.documentElement.lang = 'zh-Hant';
    p.w.document.querySelector('main').getBoundingClientRect = () => ({left: 0, top: 550, right: 390, bottom: 1400});
    p.w.Range.prototype.getBoundingClientRect = () => ({left: 30, top: 560, width: 8, height: 16, right: 38, bottom: 576});
    p.type('badapple');
    await settle();
    p.frame(2300);
    assert.equal(p.w.document.querySelector('.bad-apple').dataset.phase, 'playing');
    assert.ok(p.draws.some(draw => draw.y < 300), 'the video expands above the original article position');
    assert.ok(parseFloat(p.w.document.querySelector('.bad-apple-lyrics').style.top) < 600);
    p.type(['Escape']);
    p.frame(3400);
  } finally { p.dom.window.close(); }
});

test('Czech pages select the completed Czech draft with the supplied offset and source credit', async () => {
  const sandbox = {window: {}};
  require('node:vm').runInNewContext(fs.readFileSync(path.join(root, 'assets/media/bad-apple-lyrics.js'), 'utf8'), sandbox);
  const manifest = sandbox.window.ManualBadAppleLyrics;
  const supplied = fs.readFileSync(path.join(root, 'assets/media/badapplecz.lrc'), 'utf8').replace(/^\uFEFF/, '');
  assert.equal(manifest.tracks.cs.lrc, supplied);
  assert.equal(manifest.tracks.cs.draft, true);
  assert.equal(manifest.tracks.cs.creditURL, 'https://www.hryprodivky.cz/blog/kagaminerincz/bad-apple-cz-preklad');
  assert.ok(!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(supplied), 'the Japanese ending has been translated');
  assert.match(supplied, /^\[offset:-1300\]/);
  const p = page({lyrics: manifest});
  try {
    p.w.document.documentElement.lang = 'cs';
    p.type('badapple');
    await settle();
    p.frame(2300);
    const captions = p.w.document.querySelector('.bad-apple-lyrics');
    assert.equal(captions.lang, 'cs');
    p.video.currentTime = 27.39 + 1.3 + .001;
    p.frame(2500);
    assert.equal(captions.querySelector('.bad-apple-lyric-line').textContent, supplied.match(/\[00:27\.39\]\s*([^\r\n]+)/)[1]);
    p.video.currentTime = 177.85 + 1.3 + .001;
    p.frame(2800);
    assert.equal(captions.querySelector('.bad-apple-lyric-line').textContent, 'Pokud se pohnu, pokud se pohnu');
    assert.equal(captions.querySelector('.bad-apple-lyric-reading').hidden, true);
    p.type(['Escape']);
    p.frame(3900);
  } finally { p.dom.window.close(); }
});

test('Cantonese pages select the supplied yue track and retain its Traditional text', async () => {
  const sandbox = {window: {}};
  require('node:vm').runInNewContext(fs.readFileSync(path.join(root, 'assets/media/bad-apple-lyrics.js'), 'utf8'), sandbox);
  const manifest = sandbox.window.ManualBadAppleLyrics;
  const supplied = fs.readFileSync(path.join(root, 'assets/media/badappleyue.lrc'), 'utf8').replace(/^\uFEFF/, '');
  assert.equal(manifest.tracks.yue.lrc, supplied);
  assert.equal(manifest.tracks.yue.reading, undefined);
  const first = supplied.match(/\[(\d+):(\d+(?:\.\d+)?)\]\s*([^\r\n]+)/);
  const offset = Number(supplied.match(/^\[offset:([+-]?\d+)\]/mi)?.[1] || 0) / 1000;
  for (const language of ['yue', 'yue-Hant']) {
    const p = page({lyrics: manifest});
    try {
      p.w.document.documentElement.lang = language;
      p.type('badapple');
      await settle();
      p.frame(2300);
      p.video.currentTime = Math.max(0, Number(first[1]) * 60 + Number(first[2]) - offset);
      p.frame(2500);
      const captions = p.w.document.querySelector('.bad-apple-lyrics');
      assert.equal(captions.lang, 'yue');
      assert.equal(captions.querySelector('.bad-apple-lyric-line').textContent, first[3].trim());
      assert.equal(captions.querySelector('.bad-apple-lyric-reading').hidden, true);
      p.type(['Escape']);
      p.frame(3600);
    } finally { p.dom.window.close(); }
  }
});
