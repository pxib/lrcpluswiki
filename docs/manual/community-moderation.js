'use strict';
(() => {
  const api = window.ManualCommunity;
  const t = window.ManualCommunityText;
  const panel = document.getElementById('moderation-panel');
  let roleGeneration = 0;
  let viewGeneration = 0;
  let lastSessionId = api.session?.user.id;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, handler) => {
    const node = el('button', text);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  };
  function select(values) {
    const node = el('select');
    for (const value of values) {
      const option = el('option', t[value]);
      option.value = value;
      node.append(option);
    }
    return node;
  }
  function field(form, title, input) {
    const label = el('label', title);
    label.append(input);
    form.append(label);
  }
  function addReport(parent, type, id) {
    const popup = parent.querySelector('.talk-comment-popup');
    if (!popup) return;
    popup.append(button(t.report, () => {
      parent.querySelector('.community-report')?.remove();
      const form = el('form', '', 'community-composer community-report');
      form.setAttribute('method','dialog');
      const heading = el('h3', t.report);
      const status = el('p');
      status.setAttribute('role','status');
      status.tabIndex = -1;
      form.append(heading, el('p', t.reportPrivacy, 'account-notice'));
      const reason = select(['spam','harassment','inaccurate','other']);
      const details = el('textarea');
      details.maxLength = 2000;
      details.rows = 3;
      field(form,t.reason,reason);
      field(form,t.reportDetails,details);
      const submit = el('button',t.sendReport);
      submit.type = 'submit';
      const cancel = button(t.cancel,()=>form.remove());
      form.append(submit,cancel,status);
      parent.append(form);
      parent.querySelector('details').open = false;
      reason.focus();
      form.addEventListener('submit',async event => {
        event.preventDefault();
        if (submit.disabled || !form.reportValidity()) return;
        if (!api.session) { status.textContent = t.signInRequired; return; }
        submit.disabled = reason.disabled = details.disabled = true;
        status.textContent = t.busy;
        try {
          const {error} = await api.client.rpc('community_report',{p_type:type,p_target:id,p_reason:reason.value,p_details:details.value.trim()});
          if (error) throw error;
          details.value = '';
          status.textContent = t.reportSent;
          // Retain the acknowledgement and prevent accidental duplicate sends.
          submit.hidden = true;
        } catch(error) { status.textContent = api.errorText(error); }
        finally { submit.disabled = reason.disabled = details.disabled = false; status.focus(); }
      });
    }));
  }
  function addTopicControls(parent, row, onChanged) {
    if (!api.staffRole) return;
    const controls = el('div','','community-toolbar');
    const status = el('span');
    status.setAttribute('role','status');
    const lock = button(row.locked ? t.unlock : t.lock,async () => {
      lock.disabled = true;
      try {
        const {error} = await api.client.rpc('community_lock_topic',{p_topic:row.id,p_locked:!row.locked});
        if (error) throw error;
        onChanged();
      } catch(error) { status.textContent = api.errorText(error); }
      finally { lock.disabled = false; }
    });
    controls.append(lock,status);
    parent.append(controls);
  }
  function addDeleteComment(parent,row,onDeleted) {
    if (!api.session || row.deleted_at || (!api.staffRole && row.author_id !== api.session.user.id)) return;
    const popup = parent.querySelector('.talk-comment-popup');
    if (!popup) return;
    const status = el('span','','talk-copy-status');
    status.setAttribute('role','status');
    const control = button(t.deleteComment,async () => {
      if (!window.confirm(t.confirmDeleteComment)) return;
      control.disabled = true;
      try {
        const {error} = await api.client.rpc('community_delete_comment',{p_comment:row.id});
        if (error) throw error;
        await onDeleted();
      } catch(error) {status.textContent = api.errorText(error);}
      finally {control.disabled=false;}
    });
    popup.append(control,status);
  }
  window.ManualCommunityModeration = {addReport,addTopicControls,addDeleteComment};
  function wordFilters(version) {
    const section=el('section','','community-word-filters');
    const form=el('form','','community-composer');
    form.setAttribute('method','dialog');
    const term=el('input');
    term.required=true;
    term.maxLength=100;
    const mode=select(['whole_word','contains']);
    field(form,t.filterTerm,term);
    field(form,t.memberAction,mode);
    const submit=el('button',t.addFilter);
    submit.type='submit';
    const status=el('p');
    status.setAttribute('role','status');
    const list=el('ul');
    section.append(el('h2',t.wordFilters),el('p',t.filterHelp,'account-notice'),form,status,list);
    form.append(submit);
    let pending=false;
    let request=0;
    function controls() {
      section.querySelectorAll('input,select,button').forEach(node=>{node.disabled=pending;});
    }
    async function load() {
      const current=++request;
      status.textContent=t.busy;
      try {
        const {data,error}=await api.client.rpc('community_list_word_filters');
        if(error) throw error;
        if(version!==viewGeneration || current!==request)return;
        list.replaceChildren();
        status.textContent=data.length?'':t.noFilters;
        for(const row of data) {
          const item=el('li');
          item.append(el('span',`${row.term} · ${t[row.match_mode]} `));
          item.append(button(row.enabled?t.disable:t.enable,()=>save(row.term,row.match_mode,!row.enabled)));
          list.append(item);
        }
      }catch(error){if(version===viewGeneration && current===request)status.textContent=api.errorText(error);}
    }
    async function save(value,matchMode,enabled) {
      if(pending)return;
      pending=true;controls();status.textContent=t.busy;
      try {
        const {error}=await api.client.rpc('community_set_word_filter',{p_term:value,p_mode:matchMode,p_enabled:enabled});
        if(error)throw error;
        if(version!==viewGeneration)return;
        form.reset();
        await load();
      }catch(error){if(version===viewGeneration)status.textContent=api.errorText(error);}
      finally{pending=false;controls();}
    }
    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(form.reportValidity())save(term.value.trim(),mode.value,true);
    });
    section.append(button(t.refresh,load));
    load();
    return section;
  }
  async function loadRole() {
    const version = ++roleGeneration;
    await api.ready;
    const id = api.session?.user.id;
    let role = null;
    if (api.client && id) {
      try {
        const {data,error} = await api.client.rpc('community_staff_role');
        if (!error && ['admin','moderator'].includes(data)) role = data;
      } catch { /* A missing migration never grants access. */ }
    }
    if (version !== roleGeneration || id !== api.session?.user.id) return;
    const changed = api.staffRole !== role;
    api.staffRole = role;
    window.dispatchEvent(new Event('moderationchange'));
    if (changed || (panel && !panel.childElementCount)) renderQueue();
  }
  async function renderQueue() {
    if (!panel) return;
    const version = ++viewGeneration;
    panel.replaceChildren();
    if (panel.hidden) return;
    const heading = el('h1',t.moderation);
    heading.id = 'moderation-heading';
    const status = el('p');
    status.setAttribute('role','status');
    panel.append(heading,status);
    if (!api.client || !api.session) { status.textContent = api.client ? t.signInRequired : api.notice; return; }
    if (!api.staffRole) { status.textContent = t.staffRequired; return; }
    const toolbar = el('fieldset','','community-toolbar moderation-filters');
    const filter = select(['open','dismissed','removed']);
    filter.setAttribute('aria-label',t.moderation);
    toolbar.append(el('legend',t.moderation),filter,button(t.refresh,()=>load(true)));
    const queue = el('div');
    const more = button(t.more,()=>load(false));
    panel.append(toolbar,queue,more);
    let offset = 0;
    let request = 0;
    filter.addEventListener('change',()=>load(true));
    async function load(reset) {
      const current = ++request;
      if (reset) { offset=0; queue.replaceChildren(); }
      more.disabled = true;
      status.textContent = t.busy;
      try {
        const {data,error} = await api.client.rpc('community_report_queue',{p_status:filter.value,p_offset:offset});
        if (error) throw error;
        if (version !== viewGeneration || current !== request) return;
        offset += data.length;
        more.hidden = data.length < 20;
        status.textContent = '';
        if (!offset) status.textContent = t.noReports;
        for (const row of data) {
          const item = el('section','','moderation-report');
          item.append(el('h2',t[row.reason] || t.other));
          const metadata = el('p','','moderation-metadata');
          const timestamp = el('time',new Date(row.created_at).toLocaleString(document.documentElement.lang));
          timestamp.dateTime = row.created_at;
          metadata.append(timestamp,document.createTextNode(` · ${t.reporter}: `),api.userLink(row.reporter),document.createTextNode(` · ${t.author}: `),api.userLink(row.author, row.author_id));
          item.append(metadata);
          item.append(el('blockquote',row.content,'community-message'),el('p',row.details,'community-message'));
          const url = new URL(document.getElementById('manual-return').href);
          url.hash = `#${row.article_id}/talk/community-${row.target_type}-${row.target_id}`;
          const link = el('a',t.back);
          link.href = url.href;
          item.append(link);
          if (row.status==='open') {
            for (const action of ['dismiss','remove']) {
              const control = button(t[action],async () => {
                if (action==='remove' && !window.confirm(t.confirmRemove)) return;
                const group = [...item.querySelectorAll('button')];
                group.forEach(node=>{node.disabled=true;});
                try {
                  const {error} = await api.client.rpc('community_review_report',{p_report:row.id,p_action:action});
                  if (error) throw error;
                  if (version===viewGeneration) await load(true);
                } catch(error) { if (version===viewGeneration) status.textContent=api.errorText(error); }
                finally {group.forEach(node=>{node.disabled=false;});}
              });
              item.append(control);
            }
          }
          queue.append(item);
        }
      } catch(error) { if (version===viewGeneration && current===request) { status.textContent=api.errorText(error); more.hidden=true; } }
      finally {if (current===request) more.disabled=false;}
    }
    if (api.staffRole==='admin') {
      const section = el('section');
      const form = el('form','','community-composer');
      form.setAttribute('method','dialog');
      const username = el('input');
      username.required=true;
      username.pattern='[A-Za-z0-9_]{3,30}';
      const action = select(['moderator','admin','member','block','unblock']);
      const reason = el('textarea');
      reason.maxLength=2000;
      reason.rows=2;
      field(form,t.username,username);
      field(form,t.memberAction,action);
      field(form,t.reason,reason);
      const result = el('p');
      result.setAttribute('role','status');
      const submit = el('button',t.apply);
      submit.type='submit';
      form.append(submit,result);
      action.addEventListener('change',()=>{reason.required=action.value==='block';});
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        if (submit.disabled || !form.reportValidity()) return;
        const payload={p_username:username.value.trim(),p_action:action.value,p_reason:reason.value.trim()};
        if (!window.confirm(`${t[payload.p_action]}: ${payload.p_username}?`)) return;
        submit.disabled=true;
        result.textContent=t.busy;
        try {
          const {error}=await api.client.rpc('community_manage_member',payload);
          if (error) throw error;
          if (version===viewGeneration) {result.textContent=t.saved;form.reset();reason.required=false;}
        } catch(error) {if (version===viewGeneration) result.textContent=api.errorText(error);}
        finally {submit.disabled=false;}
      });
      section.append(el('h2',t.manageMembers),form);
      panel.append(section);
      panel.append(wordFilters(version));
    }
    await load(true);
  }
  window.addEventListener('communitychange',()=>{
    // Remove any old staff queue synchronously, before a different account loads.
    const id = api.session?.user.id;
    if (panel && id !== lastSessionId) {viewGeneration++;panel.replaceChildren();}
    lastSessionId = id;
    loadRole();
  });
  window.addEventListener('accountmodechange',renderQueue);
  window.addEventListener('pagehide',()=>{viewGeneration++;panel?.replaceChildren();});
  window.addEventListener('pageshow',loadRole);
  loadRole();
})();
