'use strict';
(() => {
  const api = window.ManualCommunity;
  const t = window.ManualCommunityText;
  const panel = document.getElementById('settings-panel');
  let generation = 0;
  let loadedId = null;
  let user = null;
  let busy = false;
  const forms = [];
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const heading = node('h1', t.settings);
  heading.id = 'settings-heading';
  const gate = node('p');
  gate.setAttribute('role', 'status');
  const login = node('a', t.login);
  const loginUrl = new URL(location.href);
  loginUrl.searchParams.set('next', 'settings');
  loginUrl.hash = 'login';
  login.href = loginUrl.href;
  login.hidden = true;
  const details = node('div', '', 'account-settings');
  details.hidden = true;
  const list = node('dl', '', 'account-details');
  const username = node('dd');
  const email = node('dd');
  const verified = node('p');
  list.append(node('dt', t.username), username, node('dt', t.email), email);
  details.append(node('h2', t.accountDetails), list, verified, node('p', t.usernameFixed, 'account-notice'));
  panel.append(heading, gate, login, details);
  const retry = node('button', t.refresh);
  retry.type = 'button';
  retry.hidden = true;
  retry.addEventListener('click', () => { loadedId = null; render(); });
  gate.after(retry);
  function field(form, id, title, type, autocomplete) {
    const wrapper = node('div', '', 'account-field');
    const label = node('label', title);
    label.htmlFor = id;
    const input = node('input');
    Object.assign(input, { id, type, autocomplete, required: true, disabled: true });
    if (autocomplete === 'new-password') input.minLength = 12;
    wrapper.append(label, input);
    form.append(wrapper);
    return input;
  }
  function section(id, title) {
    const section = node('section');
    const heading = node('h2', title);
    const form = node('form', '', 'account-form');
    form.id = `settings-${id}-form`;
    form.setAttribute('method', 'dialog');
    const status = node('p', '', 'account-feedback');
    status.setAttribute('role', 'status');
    status.tabIndex = -1;
    const submit = node('button', title, 'account-submit');
    submit.type = 'submit';
    section.append(heading, status, form);
    details.append(section);
    forms.push(form);
    return {form, status, submit};
  }
  const emailSection = section('email', t.changeEmail);
  const newEmail = field(emailSection.form, 'settings-email', t.newEmail, 'email', 'email');
  const emailPassword = field(emailSection.form, 'settings-email-password', t.currentPassword, 'password', 'current-password');
  emailSection.form.append(emailSection.submit);
  const passwordSection = section('password', t.changePassword);
  const currentPassword = field(passwordSection.form, 'settings-current-password', t.currentPassword, 'password', 'current-password');
  const newPassword = field(passwordSection.form, 'settings-new-password', t.newPassword, 'password', 'new-password');
  const confirm = field(passwordSection.form, 'settings-confirm-password', t.confirm, 'password', 'new-password');
  passwordSection.form.append(node('p', t.passwordHelp, 'account-notice'), passwordSection.submit);
  const sessions = section('sessions', t.otherSessions);
  sessions.form.append(sessions.submit);
  // Preferences uses a horizontal section selector, as in MediaWiki's Help:Preferences.
  const labels = {
    en: ['User profile', 'Password and security'],
    ja: ['利用者情報', 'パスワードとセキュリティ'],
    ko: ['사용자 정보', '비밀번호 및 보안'],
    yue: ['用戶資料', '密碼同保安']
  };
  const lang = document.documentElement.lang;
  const captions = labels[lang.startsWith('yue') ? 'yue' : lang] || labels.en;
  const tabs = node('div', '', 'preferences-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', t.settings);
  const profile = node('div', '', 'preferences-panel');
  const security = node('div', '', 'preferences-panel');
  profile.append(...details.childNodes);
  security.append(passwordSection.form.parentElement, sessions.form.parentElement);
  details.append(tabs, profile, security);
  const sections = [profile, security];
  const tabButtons = sections.map((section, index) => {
    section.id = `preferences-panel-${index}`;
    section.setAttribute('role', 'tabpanel');
    section.setAttribute('aria-labelledby', `preferences-tab-${index}`);
    const tab = node('button', captions[index]);
    tab.type = 'button';
    tab.id = `preferences-tab-${index}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', section.id);
    tab.addEventListener('click', () => selectTab(index));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = 1;
      if (next === undefined) return;
      event.preventDefault();
      selectTab(next);
      tabButtons[next].focus();
    });
    tabs.append(tab);
    return tab;
  });
  function selectTab(index) {
    sections.forEach((section, i) => { section.hidden = i !== index; });
    tabButtons.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
  }
  selectTab(0);
  function controls() {
    const disabled = busy || !user || !api.client || api.session?.user.id !== user.id || panel.hidden;
    forms.forEach(form => form.querySelectorAll('input,button').forEach(control => { control.disabled = disabled; }));
  }
  function clear() {
    generation++;
    loadedId = null;
    user = null;
    username.textContent = email.textContent = verified.textContent = '';
    details.hidden = true;
    forms.forEach(form => form.reset());
    [emailSection, passwordSection, sessions].forEach(({status}) => { status.textContent = ''; });
    controls();
  }
  async function render() {
    if (panel.hidden) { clear(); return; }
    await api.ready;
    if (panel.hidden) return;
    const id = api.session?.user.id;
    login.hidden = !api.client || Boolean(id);
    retry.hidden = true;
    if (!api.client || !id) {
      clear();
      gate.textContent = api.client ? t.signInRequired : api.notice;
      return;
    }
    if (loadedId === id) { controls(); return; }
    clear();
    loadedId = id;
    const version = generation;
    gate.textContent = t.busy;
    try {
      const result = await api.client.auth.getUser();
      if (result.error) throw result.error;
      if (version !== generation || panel.hidden || api.session?.user.id !== id) return;
      if (result.data.user?.id !== id) throw new Error('Account changed');
      const profile = await api.client.from('profiles').select('username').eq('id', id).single();
      if (profile.error) throw profile.error;
      if (version !== generation || panel.hidden || api.session?.user.id !== id) return;
      user = result.data.user;
      username.textContent = profile.data.username;
      email.textContent = user.email;
      verified.textContent = user.email_confirmed_at ? t.verified : t.unverified;
      details.hidden = false;
      gate.textContent = '';
      controls();
    } catch {
      if (version !== generation) return;
      loadedId = null;
      gate.textContent = t.unavailable;
      retry.hidden = false;
    }
  }
  function bind(section, run) {
    section.form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !user || panel.hidden || !section.form.reportValidity()) return;
      if (section === passwordSection && newPassword.value !== confirm.value) {
        section.status.textContent = t.mismatch;
        return;
      }
      const version = generation;
      const id = user.id;
      busy = true;
      controls();
      section.form.setAttribute('aria-busy', 'true');
      section.status.textContent = t.busy;
      try {
        const result = await run(id);
        if (result.error) throw result.error;
        if (version !== generation) return;
        section.form.reset();
        section.status.textContent = section === emailSection ? t.emailPending : section === passwordSection ? t.passwordChanged : t.otherSessionsEnded;
      } catch (error) {
        if (version === generation) section.status.textContent = api.errorText(error);
      } finally {
        busy = false;
        section.form.setAttribute('aria-busy', 'false');
        controls();
        if (version === generation) section.status.focus();
      }
    });
  }
  async function reauthenticate(password, id) {
    const result = await api.client.auth.signInWithPassword({ email: user.email, password });
    if (result.error) throw result.error;
    if (result.data.user?.id !== id || api.session?.user.id !== id || user?.id !== id || panel.hidden) throw new Error('Account changed');
  }
  bind(emailSection, async id => {
    const address = newEmail.value.trim();
    await reauthenticate(emailPassword.value, id);
    const callback = new URL(location.pathname, location.origin);
    callback.hash = 'settings';
    return api.client.auth.updateUser({email: address}, {emailRedirectTo: callback.href});
  });
  bind(passwordSection, async id => {
    const password = newPassword.value;
    await reauthenticate(currentPassword.value, id);
    return api.client.auth.updateUser({password});
  });
  bind(sessions, () => api.client.auth.signOut({scope: 'others'}));
  window.addEventListener('accountmodechange', render);
  window.addEventListener('communitychange', render);
  window.addEventListener('pagehide', clear);
  window.addEventListener('pageshow', render);
  render();
})();
