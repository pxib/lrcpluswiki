/* An idle easter egg: no media request or animation until “badapple” is typed. */
'use strict';
(() => {
  const scriptURL = document.currentScript.src;
  const scriptNonce = document.currentScript.nonce;
  const keyword = 'badapple';
  let typed = '', lastKey = 0, active = null;
  const ease = value => value * value * (3 - 2 * value);
  const clamp = value => Math.max(0, Math.min(1, value));
  let frameDataPromise = null;
  let lyricsPromise = null;

  function parseLyrics(lrc, readingFormat) {
    const cues = [];
    const offset = Number(lrc.match(/^\[offset:([+-]?\d+)\]/mi)?.[1] || 0) / 1000;
    for (const line of lrc.split(/\r?\n/)) {
      const stamps = [...line.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)];
      let text = line.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '')
        .replace(/<\d{1,3}:\d{2}(?:\.\d{1,3})?>/g, '').trim();
      let reading = '';
      if (readingFormat === 'pinyin') {
        const pair = text.match(/^(.*?)\s*[(（]([^()（）]+)[)）]\s*$/u);
        if (pair && /\p{Script=Han}/u.test(pair[1]) && /\p{Script=Latin}/u.test(pair[2]) && !/\p{Script=Han}/u.test(pair[2])) {
          text = pair[1].trim();
          reading = pair[2].trim();
        }
      }
      for (const stamp of stamps) {
        if (Number(stamp[2]) >= 60) continue;
        cues.push({time: Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) - offset), text, reading});
      }
    }
    return cues.sort((a, b) => a.time - b.time);
  }

  function loadLyrics() {
    if (!lyricsPromise) lyricsPromise = new Promise(resolve => {
      if (window.ManualBadAppleLyrics) { resolve(window.ManualBadAppleLyrics); return; }
      const script = document.createElement('script');
      const finish = () => {
        clearTimeout(timeout);
        script.remove();
        resolve(window.ManualBadAppleLyrics || {defaultLanguage: 'ja', tracks: {}});
      };
      const timeout = setTimeout(finish, 8000);
      script.src = new URL('assets/media/bad-apple-lyrics.js', scriptURL).href;
      if (scriptNonce) script.nonce = scriptNonce;
      script.onload = script.onerror = finish;
      document.head.append(script);
    });
    return lyricsPromise;
  }

  function loadFrames() {
    if (!frameDataPromise) {
      frameDataPromise = (async () => {
        let payload = window.ManualBadAppleFrames;
        if (!payload) payload = await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          const finish = error => {
            clearTimeout(timeout);
            script.remove();
            if (error) reject(error); else resolve(window.ManualBadAppleFrames);
          };
          const timeout = setTimeout(() => finish(new Error('Character frames could not load')), 12000);
          script.src = new URL('assets/media/bad-apple-frames.js', scriptURL).href;
          if (scriptNonce) script.nonce = scriptNonce;
          script.onload = () => finish();
          script.onerror = () => finish(new Error(`Character frames unavailable: ${script.src}`));
          document.head.append(script);
        });
        try {
          if (!payload || ![payload.width, payload.height, payload.fps, payload.count].every(value => Number.isInteger(value) && value > 0)) {
            throw new Error('Invalid character frame metadata');
          }
          let data = payload.data;
          if (!data) {
            const compressed = Uint8Array.from(atob(payload.deflate), char => char.charCodeAt(0));
            const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'));
            data = new Uint8Array(await new Response(stream).arrayBuffer());
          }
          if (data.length !== payload.width * payload.height * payload.count / 2) throw new Error('Incomplete character frames');
          return {width: payload.width, height: payload.height, fps: payload.fps, count: payload.count, data};
        } finally { delete window.ManualBadAppleFrames; }
      })().catch(error => { frameDataPromise = null; throw error; });
    }
    return frameDataPromise;
  }
  // BEGIN GENERATED BACKGROUND TIMELINE
  const backgroundFPS = 10;
  const backgroundTimeline = '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';
  // END GENERATED BACKGROUND TIMELINE

  async function loadVideo(video, signal) {
    // VS Code previews may lack AAC support. VP8/Vorbis also works in those
    // webviews; keep MP4 for browsers that prefer H.264 instead.
    const sources = [
      {file: 'bad-apple.webm', type: 'video/webm; codecs="vp8, vorbis"'},
      {file: 'bad-apple.mp4', type: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'}
    ].sort((a, b) => Number(Boolean(video.canPlayType(b.type))) - Number(Boolean(video.canPlayType(a.type))));
    const failures = [];
    for (const source of sources) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const url = new URL(`assets/media/${source.file}`, scriptURL).href;
      try {
        await new Promise((resolve, reject) => {
          const finish = error => {
            clearTimeout(timeout);
            video.removeEventListener('loadeddata', ready);
            video.removeEventListener('canplay', ready);
            video.removeEventListener('error', failed);
            signal.removeEventListener('abort', aborted);
            if (error) reject(error); else resolve();
          };
          const ready = () => finish();
          const failed = () => finish(new Error(`Media error ${video.error?.code || 'unknown'}: ${video.error?.message || url}`));
          const aborted = () => finish(new DOMException('Cancelled', 'AbortError'));
          const timeout = setTimeout(() => finish(new Error(`Timed out loading ${url}`)), 12000);
          video.addEventListener('loadeddata', ready);
          video.addEventListener('canplay', ready);
          video.addEventListener('error', failed);
          signal.addEventListener('abort', aborted, {once: true});
          video.src = url;
          video.load();
        });
        return;
      } catch (error) {
        if (signal.aborted) throw error;
        failures.push({url, message: error.message});
      }
    }
    const error = new Error('No Bad Apple video source could be loaded');
    error.mediaFailures = failures;
    throw error;
  }

  function collectText(root) {
    const particles = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const segmenter = typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter(document.documentElement.lang || undefined, {granularity: 'grapheme'}) : null;
    while (walker.nextNode() && particles.length < 5000) {
      const node = walker.currentNode;
      if (!node.textContent.trim() || node.parentElement.closest('script, style, textarea, input, select, [hidden], [aria-hidden="true"]')) continue;
      const style = getComputedStyle(node.parentElement);
      if (style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) === 0) continue;
      const segments = segmenter ? segmenter.segment(node.textContent) : (function* () {
        let index = 0;
        for (const segment of node.textContent) { yield {segment, index}; index += segment.length; }
      })();
      for (const {segment, index} of segments) {
        if (/\s/u.test(segment)) continue;
        range.setStart(node, index);
        range.setEnd(node, index + segment.length);
        const rect = range.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;
        const size = parseFloat(style.fontSize);
        particles.push({char: segment, x: rect.left, y: rect.top + (rect.height - size) / 2,
          size, font: `${style.fontWeight} ${size}px ${style.fontFamily}`, color: style.color,
          rgb: (style.color.match(/[\d.]+/g) || ['32', '33', '34']).slice(0, 3).map(Number)});
        if (particles.length === 5000) break;
      }
    }
    return particles;
  }

  async function start() {
    const content = document.querySelector('#content');
    if (active || !content || !HTMLCanvasElement.prototype.getContext) return;
    const session = {abort: new AbortController(), frame: 0, returning: false};
    active = session;
    const previousFocus = document.activeElement;
    const root = document.documentElement;
    const originalTheme = root.getAttribute('data-theme');
    const themeToggle = document.getElementById('theme-toggle');
    const originalPressed = themeToggle?.getAttribute('aria-pressed');
    let themeApplied = false;
    const scroll = {x: scrollX, y: scrollY};
    const layer = document.createElement('div');
    layer.className = 'bad-apple';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'Bad Apple text animation');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const controls = document.createElement('div');
    controls.className = 'bad-apple-controls';
    const captions = document.createElement('div');
    captions.id = 'bad-apple-captions';
    captions.className = 'bad-apple-lyrics';
    captions.hidden = true;
    const lyricLine = document.createElement('div');
    lyricLine.className = 'bad-apple-lyric-line';
    const lyricReading = document.createElement('div');
    lyricReading.className = 'bad-apple-lyric-reading';
    lyricReading.lang = 'zh-Latn';
    lyricReading.setAttribute('aria-label', 'Pinyin');
    lyricReading.hidden = true;
    const lyricHint = document.createElement('span');
    lyricHint.className = 'bad-apple-lyric-hint';
    lyricHint.textContent = 'Lyrics unavailable';
    captions.append(lyricLine, lyricReading, lyricHint);
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    status.textContent = 'Loading Bad Apple…';
    const sound = document.createElement('button');
    sound.type = 'button';
    sound.textContent = 'Enable sound';
    sound.setAttribute('aria-pressed', 'false');
    sound.disabled = true;
    const lyricsButton = document.createElement('button');
    lyricsButton.type = 'button';
    lyricsButton.textContent = 'Lyrics';
    lyricsButton.className = 'bad-apple-lyrics-toggle';
    lyricsButton.setAttribute('aria-pressed', 'true');
    lyricsButton.setAttribute('aria-controls', captions.id);
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Esc · Return to article';
    controls.append(status, sound, lyricsButton, close);
    layer.append(canvas, captions, controls);
    document.body.append(layer);
    const inert = [...document.body.children].filter(element => element !== layer)
      .map(element => [element, element.inert]);
    for (const [element] of inert) element.inert = true;
    close.focus({preventScroll: true});
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.className = 'bad-apple-media';
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    layer.append(video);
    let drawReturn = null, particles = [], startTime = 0, playing = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 180 : 1900;
    const {signal} = session.abort;
    const backgroundSamples = atob(backgroundTimeline);
    let lastThemeChange = -Infinity;
    let lyricsManifest = {defaultLanguage: 'ja', tracks: {}};
    let selectedLyricsLanguage = 'ja', lyricCues = [], currentCue = -2;
    let lyricsEnabled = true;

    function selectLyrics() {
      const language = document.documentElement.lang || 'ja';
      const options = [...new Set([language, language.split('-')[0], lyricsManifest.defaultLanguage || 'ja', 'ja'])];
      const chosen = options.find(code => lyricsManifest.tracks?.[code]?.lrc);
      selectedLyricsLanguage = chosen || 'ja';
      const track = lyricsManifest.tracks?.[selectedLyricsLanguage];
      lyricCues = track?.lrc ? parseLyrics(track.lrc, track.reading) : [];
      currentCue = -2;
      captions.lang = selectedLyricsLanguage;
      updateLyrics();
    }

    function updateLyrics() {
      captions.hidden = !playing || session.returning || !lyricsEnabled;
      let low = 0, high = lyricCues.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (lyricCues[middle].time <= video.currentTime) low = middle + 1;
        else high = middle;
      }
      const index = low - 1;
      lyricHint.hidden = lyricCues.length > 0;
      if (index === currentCue) return;
      currentCue = index;
      lyricLine.textContent = lyricCues[index]?.text || '';
      lyricReading.textContent = lyricCues[index]?.reading || '';
      lyricReading.hidden = !lyricReading.textContent;
      if (!reduced && !captions.hidden && lyricLine.textContent) lyricLine.animate?.([{opacity: .15}, {opacity: 1}], {duration: 180, easing: 'ease-out'});
      if (!reduced && !captions.hidden && !lyricReading.hidden) lyricReading.animate?.([{opacity: .15}, {opacity: 1}], {duration: 180, easing: 'ease-out'});
    }
    void loadLyrics().then(manifest => {
      if (active !== session || session.returning) return;
      lyricsManifest = manifest;
      selectLyrics();
    });
    lyricsButton.addEventListener('click', () => {
      lyricsEnabled = !lyricsEnabled;
      lyricsButton.setAttribute('aria-pressed', String(lyricsEnabled));
      updateLyrics();
    }, {signal});

    function setTemporaryTheme(theme) {
      if (window.ManualTheme) window.ManualTheme.setTemporary(theme);
      else {
        root.dataset.theme = theme;
        themeToggle?.setAttribute('aria-pressed', String(theme === 'dark'));
      }
    }

    function syncVideoTheme(now) {
      const index = Math.min(backgroundSamples.length - 1, Math.max(0, Math.floor(video.currentTime * backgroundFPS)));
      const luminance = backgroundSamples.charCodeAt(index);
      const theme = luminance >= 160 ? 'light' : luminance <= 96 ? 'dark' : root.dataset.theme;
      // A dead band and a short dwell prevent mixed transition frames from
      // repeatedly flipping the switcher. Reduced motion uses a slower fade.
      if (theme !== root.dataset.theme && now - lastThemeChange >= (reduced ? 1000 : 180)) {
        setTemporaryTheme(theme);
        lastThemeChange = now;
      }
    }

    function restoreTheme() {
      if (!themeApplied) return;
      themeApplied = false;
      root.classList.add('bad-apple-theme-returning');
      if (originalTheme === null) root.removeAttribute('data-theme');
      else setTemporaryTheme(originalTheme);
      if (themeToggle) {
        if (originalPressed === null) themeToggle.removeAttribute('aria-pressed');
        else themeToggle.setAttribute('aria-pressed', originalPressed);
      }
    }

    function cleanup() {
      if (active !== session) return;
      active = null;
      cancelAnimationFrame(session.frame);
      session.abort.abort();
      video.pause();
      video.removeAttribute('src');
      video.load();
      restoreTheme();
      content.classList.remove('bad-apple-source');
      root.classList.remove('bad-apple-active', 'bad-apple-theme-fade', 'bad-apple-theme-playing', 'bad-apple-theme-returning');
      layer.remove();
      for (const [element, value] of inert) element.inert = value;
      if (!session.navigating) window.scrollTo(scroll.x, scroll.y);
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
    }
    function leave(immediate = false) {
      if (session.returning) { if (immediate) cleanup(); return; }
      session.returning = true;
      video.pause();
      cancelAnimationFrame(session.frame);
      if (immediate || !drawReturn) { cleanup(); return; }
      sound.disabled = true;
      lyricsButton.disabled = true;
      captions.hidden = true;
      root.classList.remove('bad-apple-theme-playing');
      status.textContent = 'Returning the words…';
      restoreTheme();
      drawReturn(cleanup);
    }
    close.addEventListener('click', () => leave(), {signal});
    sound.addEventListener('click', () => {
      video.muted = !video.muted;
      sound.textContent = video.muted ? 'Enable sound' : 'Mute';
      sound.setAttribute('aria-pressed', String(!video.muted));
    }, {signal});
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); leave(); }
      if (event.key === 'Tab') {
        event.preventDefault();
        const buttons = [...controls.querySelectorAll('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement);
        buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
      }
    }, {signal});
    window.addEventListener('resize', () => leave(true), {signal});
    window.addEventListener('hashchange', () => { session.navigating = true; leave(true); }, {signal});
    window.addEventListener('pagehide', cleanup, {signal});
    window.addEventListener('beforeprint', () => leave(true), {signal});
    document.addEventListener('visibilitychange', () => {
      if (!playing || session.returning) return;
      if (document.hidden) video.pause();
      else video.play().catch(() => leave(true));
    }, {signal});
    video.addEventListener('ended', () => leave(), {signal});
    video.addEventListener('error', () => { if (playing) leave(true); }, {signal});

    try {
      const [, frames] = await Promise.all([loadVideo(video, signal), loadFrames()]);
      if (active !== session) return;
      particles = collectText(content);
      if (!particles.length) { cleanup(); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { cleanup(); return; }
      const mainRect = content.getBoundingClientRect();
      const mobile = innerWidth <= 600;
      const area = mobile ? {x: 0, y: 0, width: innerWidth} :
        {x: Math.max(0, mainRect.left), y: Math.max(0, mainRect.top),
          width: Math.min(innerWidth, mainRect.right) - Math.max(0, mainRect.left)};
      const controlsSpace = Math.max(64, controls.getBoundingClientRect().height + 24);
      area.height = (mobile ? innerHeight - controlsSpace : Math.min(innerHeight - controlsSpace, mainRect.bottom)) - area.y;
      if (area.width < 40 || area.height < 152) { cleanup(); return; }
      // A character cell is about half as wide as it is tall; the picture stays 4:3.
      const columns = Math.max(1, Math.ceil(Math.sqrt(particles.length * 8 / 3)));
      const rows = Math.ceil(particles.length / columns);
      const captionSpace = root.lang.split('-')[0] === 'zh' ? (innerWidth <= 600 ? 144 : 104) : 88;
      const width = Math.min(area.width - 24, (area.height - 24 - captionSpace) * 4 / 3);
      const height = width * 3 / 4;
      const left = area.x + (area.width - width) / 2;
      const top = area.y + (area.height - captionSpace - height) / 2;
      captions.style.left = `${area.x}px`;
      captions.style.top = `${top + height + 12}px`;
      captions.style.width = `${area.width}px`;
      const cellWidth = width / columns, cellHeight = height / rows;
      const fontSize = Math.min(cellWidth / .62, cellHeight);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.scale(dpr, dpr);
      ctx.textBaseline = 'top';
      ctx.font = `${fontSize}px monospace`;
      particles.forEach((particle, index) => {
        particle.tx = left + (index % columns) * cellWidth;
        particle.ty = top + Math.floor(index / columns) * cellHeight;
        const sampleX = Math.min(frames.width - 1, Math.floor((index % columns + .5) / columns * frames.width));
        const sampleY = Math.min(frames.height - 1, Math.floor((Math.floor(index / columns) + .5) / rows * frames.height));
        particle.pixel = sampleY * frames.width + sampleX;
        // CJK glyphs and emoji can occupy a full em even in a monospace font.
        particle.targetSize = Math.min(fontSize, fontSize * cellWidth / Math.max(1, ctx.measureText(particle.char).width));
        // A wave from the article heading to its final lines.
        particle.delay = reduced ? 0 : index / particles.length * .24;
      });
      content.classList.add('bad-apple-source');
      root.classList.add('bad-apple-active', 'bad-apple-theme-fade');
      // Establish the current palette before fading the real site into dark mode.
      // This temporary change never writes the reader's saved theme preference.
      getComputedStyle(content).backgroundColor;
      themeApplied = true;
      setTemporaryTheme('dark');
      status.textContent = 'The words are finding their places…';
      layer.dataset.phase = 'assembling';
      startTime = performance.now();
      let lastProgress = 0, returnProgress = 1;
      function paint(progress, returning = false) {
        lastProgress = progress;
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        const palette = getComputedStyle(content);
        const textRGB = (palette.color.match(/[\d.]+/g) || ['225', '227', '230']).slice(0, 3).map(Number);
        const surfaceRGB = (palette.backgroundColor.match(/[\d.]+/g) || ['32', '35', '39']).slice(0, 3).map(Number);
        ctx.fillStyle = palette.backgroundColor;
        ctx.fillRect(area.x, area.y, area.width, innerHeight - area.y);
        const videoBlend = ease(clamp(((returning ? progress * returnProgress : progress) - .65) / .35));
        const frameIndex = Math.min(frames.count - 1, Math.max(0, Math.floor(video.currentTime * frames.fps)));
        const frameOffset = frameIndex * frames.width * frames.height / 2;
        const light = root.dataset.theme === 'light';
        particles.forEach((particle, index) => {
          const t = returning ? progress : ease(clamp((progress - particle.delay) / (1 - particle.delay)));
          const from = returning ? particle.returnFrom : particle;
          const x = returning ? particle.x + (from.x - particle.x) * t : particle.x + (particle.tx - particle.x) * t;
          const y = returning ? particle.y + (from.y - particle.y) * t : particle.y + (particle.ty - particle.y) * t;
          const size = returning ? particle.size + (from.size - particle.size) * t : particle.size + (particle.targetSize - particle.size) * t;
          const visualT = returning ? t * (from.t || 0) : t;
          const textBlend = ease(clamp((visualT - .2) / .7));
          ctx.font = visualT < .05 ? particle.font : `${size}px monospace`;
          // Each intact glyph gets one luminance sample. No video image is drawn
          // over or through the letters, and file:// needs no canvas pixel access.
          const packed = frames.data[frameOffset + (particle.pixel >> 1)];
          const luminance = (particle.pixel % 2 ? packed & 15 : packed >> 4) / 15;
          const contrast = light ? 1 - luminance : luminance;
          ctx.fillStyle = `rgb(${particle.rgb.map((channel, component) => {
            const assembled = channel + (textRGB[component] - channel) * textBlend;
            const cell = surfaceRGB[component] + (textRGB[component] - surfaceRGB[component]) * contrast;
            return Math.round(assembled + (cell - assembled) * videoBlend);
          }).join(',')})`;
          ctx.fillText(particle.char, x, y);
          particle.current = {x, y, size, t: visualT};
        });
      }
      drawReturn = done => {
        layer.dataset.phase = 'returning';
        returnProgress = lastProgress;
        particles.forEach(particle => { particle.returnFrom = particle.current || particle; });
        const began = performance.now();
        function step(now) {
          const t = clamp((now - began) / (reduced ? 180 : 1000));
          paint(1 - ease(t), true);
          if (t === 1) done();
          else session.frame = requestAnimationFrame(step);
        }
        session.frame = requestAnimationFrame(step);
      };
      function tick(now) {
        if (active !== session || session.returning) return;
        const t = clamp((now - startTime) / duration);
        if (playing) { syncVideoTheme(now); updateLyrics(); }
        paint(t);
        if (t === 1 && !playing && now - startTime >= duration + 350) {
          playing = true;
          updateLyrics();
          layer.dataset.phase = 'playing';
          root.classList.add('bad-apple-theme-playing');
          status.textContent = 'Bad Apple!! · Made of this page’s words';
          sound.disabled = false;
          video.play().catch(() => leave(true));
        }
        session.frame = requestAnimationFrame(tick);
      }
      session.frame = requestAnimationFrame(tick);
    } catch (error) {
      if (active !== session) return;
      // Restore the article after failures; never leave an invisible or inert page.
      cleanup();
      const notice = document.createElement('p');
      notice.className = 'bad-apple-notice';
      notice.setAttribute('role', 'status');
      console.warn('Bad Apple could not start:', error.mediaFailures || error);
      notice.textContent = error.mediaFailures
        ? 'Bad Apple could not load its video. Reload the preview or open this HTML in a browser.'
        : 'Bad Apple could not start. Reload this page and try again.';
      document.body.append(notice);
      setTimeout(() => notice.remove(), 12000);
    }
  }

  document.addEventListener('keydown', event => {
    if (active || event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) { typed = ''; return; }
    if (event.key.length !== 1) { typed = ''; return; }
    const now = performance.now();
    if (now - lastKey > 1800) typed = '';
    lastKey = now;
    typed = (typed + event.key.toLowerCase()).slice(-keyword.length);
    if (typed === keyword) { typed = ''; void start(); }
  });
})();
