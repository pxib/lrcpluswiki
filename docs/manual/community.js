/* Shared Supabase client; unconfigured and offline manuals make no requests. */
'use strict';
(() => {
  const t = window.ManualCommunityText;
  const config = window.ManualCommunityConfig || {};
  const api = window.ManualCommunity = { client: null, session: null, recovery: false, error: null, ready: null };
  api.notice = location.protocol === 'file:' ? t.offline : t.unconfigured;
  api.errorText = error => error?.message?.includes('posting_too_fast') || error?.status === 429 ? t.rateLimit
    : error?.code === 'invalid_credentials' ? t.invalid : t.failed;
  const notify = () => window.dispatchEvent(new Event('communitychange'));
  function header() {
    document.querySelectorAll('.account-state').forEach(node => {
      node.textContent = api.session ? api.session.user.user_metadata?.username || t.username : t.loggedOut;
    });
    document.querySelectorAll('.account-links').forEach(nav => {
      nav.querySelectorAll('a').forEach(link => { link.hidden = link.dataset.accountSettings ? !api.session : Boolean(api.session); });
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
