/* Shared Supabase client; unconfigured and offline manuals make no requests. */
'use strict';
(() => {
  const t = window.ManualCommunityText;
  const config = window.ManualCommunityConfig || {};
  const api = window.ManualCommunity = { client: null, session: null, recovery: false, error: null, ready: null };
  api.notice = location.protocol === 'file:' ? t.offline : t.unconfigured;
  api.errorText = error => {
    if (error?.message?.includes('report_outdated')) return t.reportOutdated;
    for (const [code,key] of Object.entries({posting_too_fast:'rateLimit',already_reported:'alreadyReported',account_restricted:'restricted',staff_required:'staffRequired',target_not_found:'notFound',topic_locked:'locked',cannot_change_self:'cannotSelf',staff_member_protected:'protectedStaff',word_filtered:'wordFiltered',comment_delete_forbidden:'deleteForbidden',filter_limit:'filterLimit'})) {
      if (error?.message?.includes(code)) return t[key];
    }
    return error?.status === 429 ? t.rateLimit : error?.code === 'PGRST202' ? t.featureUnavailable : error?.code === 'invalid_credentials' ? t.invalid : t.failed;
  };
  const notify = () => window.dispatchEvent(new Event('communitychange'));
  api.userLink = (username, id) => {
    const label = username || t.deleted;
    const hasUsername = /^[A-Za-z0-9_]{3,30}$/.test(username || '');
    if (!id && !hasUsername) return document.createTextNode(label);
    const lang = document.documentElement.lang;
    const file = lang.startsWith('yue') ? 'yue-user.html' : lang === 'ko' ? 'ko-user.html' : lang === 'ja' ? 'ja-user.html' : 'user.html';
    const url = new URL(file, location.href);
    url.searchParams.set(hasUsername ? 'name' : 'id', hasUsername ? username : id);
    const link = document.createElement('a');
    link.className = 'community-user-link';
    link.href = url.href;
    link.textContent = label;
    return link;
  };
  api.staffIndicator = role => {
    if (!['admin', 'moderator'].includes(role)) return null;
    const label = document.createElement('span');
    label.className = `community-staff community-staff-${role}`;
    label.textContent = `(${t[role].toLocaleLowerCase(document.documentElement.lang)})`;
    return label;
  };
  function header() {
    document.querySelectorAll('.account-state').forEach(node => {
      node.textContent = api.session ? api.session.user.user_metadata?.username || t.username : t.loggedOut;
      if (api.session) {
        // Auth metadata is editable; resolve the account ID before using its public username.
        const link = api.userLink(null, api.session.user.id);
        link.textContent = node.textContent;
        node.replaceChildren(link);
      }
      const indicator = api.session && api.staffIndicator(api.staffRole);
      if (indicator) node.append(' ', indicator);
    });
    document.querySelectorAll('.account-links').forEach(nav => {
      nav.querySelectorAll('a').forEach(link => { link.hidden = link.dataset.moderation ? !api.staffRole : link.dataset.accountSettings ? !api.session : Boolean(api.session); });
      let settings = nav.querySelector('[data-account-settings]');
      if (!settings) {
        settings = document.createElement('a');
        settings.dataset.accountSettings = 'true';
        settings.textContent = t.settings;
        const lang = document.documentElement.lang;
        const file = lang.startsWith('yue') ? 'yue-account.html' : lang === 'ko' ? 'ko-account.html' : lang === 'ja' ? 'ja-account.html' : 'account.html';
        const url = new URL(file, location.href);
        url.searchParams.set('return', new URLSearchParams(location.search).get('return') || location.hash || '#main');
        url.hash = 'settings';
        settings.href = url.href;
        nav.append(settings);
      }
      settings.hidden = !api.session;
      let moderation = nav.querySelector('[data-moderation]');
      if (!moderation && api.staffRole) {
        moderation = document.createElement('a');
        moderation.dataset.moderation = 'true';
        moderation.textContent = t.moderation;
        const url = new URL(settings.href);
        url.hash = 'moderation';
        moderation.href = url.href;
        nav.append(moderation);
      }
      if (moderation) moderation.hidden = !api.staffRole;
      let button = nav.querySelector('button');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.textContent = t.logout;
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            const { error } = await api.client.auth.signOut();
            if (error) throw error;
          } catch { window.alert(t.unavailable); }
          finally { button.disabled = false; }
        });
        nav.append(button);
      }
      button.hidden = !api.session;
    });
  }
  window.addEventListener('communitychange', header);
  window.addEventListener('moderationchange', header);
  api.ready = (async () => {
    if (location.protocol === 'file:' || !config.supabaseUrl || !config.publishableKey) return;
    try {
      const url = new URL(config.supabaseUrl);
      if (url.protocol !== 'https:') throw new Error('HTTPS required');
      // Never accept a service-role JWT or secret key in this public file.
      if (config.publishableKey.startsWith('eyJ')) {
        const payload = JSON.parse(atob(config.publishableKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.role !== 'anon') throw new Error('Use a public key');
      } else if (!config.publishableKey.startsWith('sb_publishable_')) throw new Error('Use a public key');
      if (!window.supabase) await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => { script.remove(); reject(new Error('SDK timeout')); }, 15000);
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js';
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = () => { clearTimeout(timer); reject(new Error('SDK unavailable')); };
        document.head.append(script);
      });
      api.client = window.supabase.createClient(url.href.replace(/\/$/, ''), config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(20000) }) }
      });
      api.client.auth.onAuthStateChange((event, session) => {
        if (api.session?.user.id !== session?.user.id) api.staffRole = null;
        api.session = session;
        if (event === 'PASSWORD_RECOVERY') api.recovery = true;
        if (event === 'SIGNED_OUT') api.recovery = false;
        notify();
      });
      const { data, error } = await api.client.auth.getSession();
      if (error) throw error;
      api.session = data.session;
    } catch (error) {
      api.error = error;
      api.client = null;
      api.notice = t.unavailable;
    }
  })().then(() => { header(); notify(); });
})();
