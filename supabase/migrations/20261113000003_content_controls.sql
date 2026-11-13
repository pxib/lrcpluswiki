-- Imported legacy migration; the Supabase CLI manages its transaction.
-- Run once AFTER community.sql and moderation.sql in Supabase's SQL Editor.
alter table public.community_comments add column deleted_at timestamptz;
alter table public.community_comments add constraint community_comment_deleted_contents
 check(deleted_at is null or (body='[deleted]' and author_id is null));

create function public.community_filter_normalize(p_text text) returns text
language sql immutable set search_path='' as $$
 select btrim(regexp_replace(lower(normalize(coalesce(p_text,''), NFKC)), '[[:space:]]+', ' ', 'g'))
$$;
revoke all on function public.community_filter_normalize(text) from public, anon, authenticated;

create table public.community_word_filters (
 id uuid primary key default gen_random_uuid(),
 term text not null check(char_length(btrim(term)) between 1 and 100),
 match_mode text not null check(match_mode in ('whole_word','contains')),
 enabled boolean not null default true,
 normalized_term text generated always as (public.community_filter_normalize(term)) stored,
 check(char_length(normalized_term)>0),
 unique(normalized_term,match_mode)
);
alter table public.community_word_filters enable row level security;
revoke all on public.community_word_filters from public, anon, authenticated;

create function public.community_check_words(p_text text) returns void
language plpgsql security definer set search_path='' as $$
declare r record; haystack text := public.community_filter_normalize(p_text); start_at integer; relative_at integer; found_at integer;
begin
 for r in select normalized_term,match_mode from public.community_word_filters where enabled loop
   start_at := 1;
   loop
     relative_at := strpos(substr(haystack,start_at),r.normalized_term);
     exit when relative_at=0;
     found_at := start_at+relative_at-1;
     if r.match_mode='contains' or (
       (found_at=1 or substr(haystack,found_at-1,1) !~ '[[:alnum:]_]') and
       (found_at+char_length(r.normalized_term)>char_length(haystack) or
        substr(haystack,found_at+char_length(r.normalized_term),1) !~ '[[:alnum:]_]')
     ) then raise exception 'word_filtered'; end if;
     start_at := found_at+1;
   end loop;
 end loop;
end; $$;
revoke all on function public.community_check_words(text) from public, anon, authenticated;

-- The trigger covers every write path, including existing posting RPCs.
create function public.community_filter_post() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Let the existing length constraints reject oversized input before scanning rules.
 if char_length(new.body)>10000 then return new; end if;
 if tg_table_name='community_topics' then
   if char_length(new.title)>160 then return new; end if;
   perform public.community_check_words(new.title);
   perform public.community_check_words(new.body);
 elsif new.deleted_at is null then perform public.community_check_words(new.body);
 end if;
 return new;
end; $$;
revoke all on function public.community_filter_post() from public, anon, authenticated;
create trigger community_filter_topic before insert or update of title,body on public.community_topics
 for each row execute function public.community_filter_post();
create trigger community_filter_comment before insert or update of body,deleted_at on public.community_comments
 for each row execute function public.community_filter_post();

create function public.community_list_word_filters()
returns table(id uuid,term text,match_mode text,enabled boolean)
language plpgsql security definer set search_path='' as $$
begin
 perform public.community_require_staff(true);
 return query select f.id,f.term,f.match_mode,f.enabled from public.community_word_filters f order by f.term,f.id limit 500;
end; $$;
revoke all on function public.community_list_word_filters() from public, anon, authenticated;
grant execute on function public.community_list_word_filters() to authenticated;

create function public.community_set_word_filter(p_term text,p_mode text default 'whole_word',p_enabled boolean default true) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid; filter uuid;
begin
 uid := public.community_require_staff(true);
 perform pg_advisory_xact_lock(hashtextextended('community_filter_management',0));
 uid := public.community_require_staff(true);
 select id into filter from public.community_word_filters where normalized_term=public.community_filter_normalize(p_term) and match_mode=p_mode;
 if filter is null and (select count(*) from public.community_word_filters)>=500 then raise exception 'filter_limit'; end if;
 insert into public.community_word_filters(term,match_mode,enabled) values(btrim(p_term),p_mode,p_enabled)
 on conflict(normalized_term,match_mode) do update set term=excluded.term,enabled=excluded.enabled returning id into filter;
 insert into public.community_moderation_log(actor_id,action,target) values(uid,case when p_enabled then 'enable_filter' else 'disable_filter' end,filter::text);
 return filter;
end; $$;
revoke all on function public.community_set_word_filter(text,text,boolean) from public, anon, authenticated;
grant execute on function public.community_set_word_filter(text,text,boolean) to authenticated;

create function public.community_delete_comment(p_comment uuid) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid; c public.community_comments; staff text;
begin
 uid := public.community_verified_user();
 select * into c from public.community_comments where id=p_comment for update;
 if c.id is null then raise exception 'target_not_found'; end if;
 select role into staff from public.community_staff where user_id=uid;
 if c.author_id is distinct from uid and staff is null then raise exception 'comment_delete_forbidden'; end if;
 if c.deleted_at is not null then return; end if;
 update public.community_comments set body='[deleted]',author_id=null,deleted_at=clock_timestamp() where id=p_comment;
 update public.community_reports set status='removed',reviewed_by=case when staff is not null then uid else null end,reviewed_at=now()
 where target_type='comment' and target_id=p_comment and status='open';
 insert into public.community_moderation_log(actor_id,action,target) values(uid,'delete_comment',p_comment::text);
end; $$;
revoke all on function public.community_delete_comment(uuid) from public, anon, authenticated;
grant execute on function public.community_delete_comment(uuid) to authenticated;

create function public.community_report_live_target() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.target_type='comment' and not exists(select 1 from public.community_comments where id=new.target_id and deleted_at is null) then
   raise exception 'target_not_found';
 end if;
 return new;
end; $$;
revoke all on function public.community_report_live_target() from public, anon, authenticated;
create trigger community_report_live_target before insert on public.community_reports
 for each row execute function public.community_report_live_target();

-- Report removals use the same tombstones as direct comment deletion.
create or replace function public.community_review_report(p_report uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid; r public.community_reports;
begin
 uid := public.community_require_staff();
 select * into r from public.community_reports where id=p_report for update;
 if r.id is null or r.status<>'open' then raise exception 'report_closed'; end if;
 if p_action='remove' then
   if r.target_type='topic' then delete from public.community_topics where id=r.target_id;
   elsif exists(select 1 from public.community_comments where id=r.target_id) then perform public.community_delete_comment(r.target_id);
   end if;
   update public.community_reports set status='removed',reviewed_by=uid,reviewed_at=now()
   where status='open' and ((target_type=r.target_type and target_id=r.target_id) or (r.target_type='topic' and topic_id=r.topic_id));
 elsif p_action='dismiss' then
   update public.community_reports set status='dismissed',reviewed_by=uid,reviewed_at=now() where id=r.id;
 else raise exception 'invalid_action'; end if;
 insert into public.community_moderation_log(actor_id,action,target) values(uid,p_action,r.id::text);
end; $$;
