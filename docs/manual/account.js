'use strict';
(() => {
  const t = window.ManualCommunityText;
  const api = window.ManualCommunity;
  const lang = document.documentElement.lang;
  const manual = lang.startsWith('yue') ? 'yue.html' : lang === 'ko' ? 'ko.html' : lang === 'ja' ? 'ja.html' : 'index.html';
  const query = new URLSearchParams(location.search);
  const requested = query.get('return');
  const returnHash = requested?.startsWith('#') ? requested : '#main';
  const modes = ['login', 'create-account', 'password-reset', 'new-password'];
  let busy = false;
  let currentMode = 'login';
  const panels = {};
  function field(form, id, label, type, autocomplete) {
    const wrapper = document.createElement('div');
    wrapper.className = 'account-field';
    const caption = document.createElement('label');
    caption.htmlFor = id;
    caption.textContent = label;
    const input = document.createElement('input');
    Object.assign(input, { id, type, autocomplete, required: true, disabled: true });
    if (type === 'password' && autocomplete === 'new-password') input.minLength = 12;
    if (id === 'create-account-username') {
      input.pattern = '[A-Za-z0-9_]{3,30}';
      input.maxLength = 30;
      input.title = t.usernameHelp;
    }
    wrapper.append(caption, input);
    form.append(wrapper);
    return input;
  }
  function link(parent, mode, label) {
    const p = document.createElement('p');
    p.className = 'account-alternative';
    const a = document.createElement('a');
    a.href = `#${mode}`;
    a.textContent = label;
    p.append(a);
    parent.append(p);
  }
  const titles = { login: t.login, 'create-account': t.signup, 'password-reset': t.reset, 'new-password': t.savePassword };
  for (const mode of modes) {
    let panel = document.getElementById(`${mode}-panel`);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = `${mode}-panel`;
      document.getElementById('content').append(panel);
    }
    panel.replaceChildren();
    panel.setAttribute('aria-labelledby', `${mode}-heading`);
    const heading = document.createElement('h1');
    heading.id = `${mode}-heading`;
    heading.textContent = titles[mode];
    const intro = document.createElement('p');
    intro.className = 'account-notice';
    intro.textContent = t.accountIntro;
    const status = document.createElement('p');
    status.className = 'account-feedback';
    status.setAttribute('role', 'status');
    status.tabIndex = -1;
    const form = document.createElement('form');
    form.className = 'account-form';
    form.id = `${mode}-form`;
    form.setAttribute('method', 'dialog');
    panel.append(heading, intro, status, form);
    if (mode === 'create-account') field(form, `${mode}-username`, t.username, 'text', 'username');
    if (mode !== 'new-password') field(form, `${mode}-email`, t.email, 'email', 'email');
    if (mode !== 'password-reset') field(form, `${mode}-password`, t.password, 'password', mode === 'login' ? 'current-password' : 'new-password');
    if (mode === 'create-account' || mode === 'new-password') field(form, `${mode}-confirm`, t.confirm, 'password', 'new-password');
    if (mode === 'create-account' || mode === 'new-password') {
      const help = document.createElement('p');
      help.className = 'account-notice';
      help.textContent = mode === 'create-account' ? `${t.usernameHelp} ${t.passwordHelp}` : t.passwordHelp;
      form.append(help);
    }
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'account-submit';
    submit.textContent = titles[mode];
    submit.disabled = true;
    form.append(submit);
    if (mode !== 'login') link(panel, 'login', t.login);
    else { link(panel, 'create-account', t.signup); link(panel, 'password-reset', t.reset); }
    panels[mode] = { panel, status, form, submit };
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !api.client || !form.reportValidity()) return;
      const value = suffix => document.getElementById(`${mode}-${suffix}`)?.value || '';
      if (mode === 'create-account' || mode === 'new-password') {
        if (value('password') !== value('confirm')) { status.textContent = t.mismatch; return; }
      }
      busy = true;
      form.setAttribute('aria-busy', 'true');
      controls();
      status.textContent = t.busy;
      try {
        const callback = new URL(location.pathname, location.origin);
        callback.searchParams.set('return', returnHash);
        let result;
        if (mode === 'login') result = await api.client.auth.signInWithPassword({ email: value('email').trim(), password: value('password') });
        else if (mode === 'create-account') result = await api.client.auth.signUp({
          email: value('email').trim(), password: value('password'),
          options: { data: { username: value('username').trim() }, emailRedirectTo: callback.href }
        });
        else if (mode === 'password-reset') {
          callback.searchParams.set('recovery', '1');
          result = await api.client.auth.resetPasswordForEmail(value('email').trim(), { redirectTo: callback.href });
        } else {
          if (!api.recovery) throw new Error('Recovery link required');
          result = await api.client.auth.updateUser({ password: value('password') });
        }
        if (result.error) throw result.error;
        form.reset();
        status.textContent = mode === 'create-account' ? t.verify : mode === 'password-reset' ? t.resetSent : t.passwordSaved;
        if (mode === 'new-password') {
          const signedOut = await api.client.auth.signOut();
          if (signedOut.error) throw signedOut.error;
          api.recovery = false;
        }
        if (mode === 'login' || (mode === 'create-account' && result.data?.session)) location.assign(manual + returnHash);
      } catch (error) {
        status.textContent = api.errorText(error);
      } finally {
        busy = false;
        form.setAttribute('aria-busy', 'false');
        controls();
        status.focus();
      }
    });
  }
  function controls() {
    for (const [mode, {form, submit}] of Object.entries(panels)) {
      const disabled = busy || !api.client || (mode === 'new-password' && !api.recovery);
      form.querySelectorAll('input, button').forEach(input => { input.disabled = disabled; });
      submit.textContent = busy && mode === currentMode ? t.busy : titles[mode];
    }
  }
  function render() {
    const hash = location.hash.slice(1);
    currentMode = api.recovery ? 'new-password' : modes.includes(hash) ? hash : query.has('recovery') ? 'new-password' : 'login';
    for (const [mode, {panel, form}] of Object.entries(panels)) {
      panel.hidden = mode !== currentMode;
      if (panel.hidden && !busy) form.reset();
    }
    document.title = `${titles[currentMode]} — LRCPlus wiki`;
    document.getElementById('special-tab').href = `#${currentMode}`;
    document.getElementById('manual-return').href = manual + returnHash;
    document.querySelectorAll('.language-switch a, .account-links a').forEach(a => {
      const url = new URL(a.href);
      url.searchParams.set('return', returnHash);
      if (a.closest('.language-switch')) url.hash = currentMode;
      a.href = url.href;
    });
    controls();
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('communitychange', () => { if (api.recovery) render(); else controls(); });
  window.addEventListener('pagehide', () => Object.values(panels).forEach(({form}) => form.reset()));
  render();
  api.ready.then(() => {
    render();
    if (!api.client) panels[currentMode].status.textContent = api.notice;
    else if (currentMode === 'new-password' && !api.recovery) panels[currentMode].status.textContent = t.recoveryRequired;
  });
})();
