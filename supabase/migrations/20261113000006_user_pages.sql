-- Imported legacy migration; the Supabase CLI manages its transaction.
-- Run once AFTER community.sql, moderation.sql, and content-controls.sql.

-- Publish only the UTC account creation date, never auth records or emails.
alter table public.profiles add column joined_on date;
update public.profiles p set joined_on=(u.created_at at time zone 'UTC')::date
from auth.users u where u.id=p.id;
create or replace function public.community_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,username,joined_on)
 values(new.id,btrim(new.raw_user_meta_data->>'username'),(new.created_at at time zone 'UTC')::date);
 return new;
end; $$;

create table public.user_pages (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 body text not null default '' check(char_length(body)<=10000),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.user_pages enable row level security;
revoke all on public.user_pages from public,anon,authenticated;
grant select on public.user_pages to anon,authenticated;
create policy user_pages_read on public.user_pages for select to anon,authenticated using(true);

create function public.community_save_user_page(p_body text,p_revision bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare uid uuid; current_revision bigint; next_revision bigint;
begin
 uid:=public.community_verified_user();
 if p_body is null or char_length(p_body)>10000 then raise exception 'invalid_body'; end if;
 perform pg_advisory_xact_lock(hashtextextended('user-page:'||uid::text,0));
 select revision into current_revision from public.user_pages where user_id=uid for update;
 if p_revision is distinct from coalesce(current_revision,0) then raise exception 'edit_conflict'; end if;
 perform public.community_check_words(p_body);
 perform public.community_check_post();
 next_revision:=coalesce(current_revision,0)+1;
 insert into public.user_pages(user_id,body,revision,updated_at) values(uid,btrim(p_body),next_revision,clock_timestamp())
 on conflict(user_id) do update set body=excluded.body,revision=excluded.revision,updated_at=excluded.updated_at;
 return next_revision;
end; $$;
revoke all on function public.community_save_user_page(text,bigint) from public,anon,authenticated;
grant execute on function public.community_save_user_page(text,bigint) to authenticated;

alter table public.community_reports drop constraint community_reports_target_type_check;
alter table public.community_reports add constraint community_reports_target_type_check check(target_type in ('topic','comment','user_page'));
alter table public.community_reports alter column article_id drop not null;
alter table public.community_reports alter column topic_id drop not null;
alter table public.community_reports add column target_revision bigint;

create or replace function public.community_report(p_type text,p_target uuid,p_reason text,p_details text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid; report uuid; article text; topic uuid; author uuid; snapshot text; page_revision bigint;
begin
 uid:=public.community_verified_user();
 perform pg_advisory_xact_lock(hashtextextended('report:'||uid::text,0));
 if exists(select 1 from public.community_reports where reporter_id=uid and target_type=p_type and target_id=p_target and status='open') then raise exception 'already_reported'; end if;
 if exists(select 1 from public.community_reports where reporter_id=uid and created_at>clock_timestamp()-interval '1 minute') then raise exception 'posting_too_fast'; end if;
 if p_type='topic' then
   select article_id,id,author_id,title||E'\n\n'||body into article,topic,author,snapshot from public.community_topics where id=p_target for share;
 elsif p_type='comment' then
   select t.article_id,t.id,c.author_id,c.body into article,topic,author,snapshot
   from public.community_comments c join public.community_topics t on t.id=c.topic_id where c.id=p_target and c.deleted_at is null for share of c,t;
 elsif p_type='user_page' then
   select user_id,body,revision into author,snapshot,page_revision from public.user_pages where user_id=p_target and body<>'' for share;
 else raise exception 'invalid_target'; end if;
 if snapshot is null then raise exception 'target_not_found'; end if;
 insert into public.community_reports(reporter_id,target_type,target_id,article_id,topic_id,author_id,content,reason,details,target_revision)
 values(uid,p_type,p_target,article,topic,author,snapshot,p_reason,btrim(coalesce(p_details,'')),page_revision) returning id into report;
 return report;
end; $$;

create or replace function public.community_review_report(p_report uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid; r public.community_reports; page_revision bigint;
begin
 uid:=public.community_require_staff();
 -- Match the editor's lock order before locking a user page.
 select * into r from public.community_reports where id=p_report;
 if r.target_type='user_page' then perform pg_advisory_xact_lock(hashtextextended('user-page:'||r.target_id::text,0)); end if;
 select * into r from public.community_reports where id=p_report for update;
 if r.id is null or r.status<>'open' then raise exception 'report_closed'; end if;
 if p_action='remove' then
   if r.target_type='topic' then delete from public.community_topics where id=r.target_id;
   elsif r.target_type='user_page' then
     select revision into page_revision from public.user_pages where user_id=r.target_id for update;
     if page_revision is distinct from r.target_revision then raise exception 'report_outdated'; end if;
     update public.user_pages set body='',revision=revision+1,updated_at=clock_timestamp() where user_id=r.target_id;
   elsif exists(select 1 from public.community_comments where id=r.target_id) then perform public.community_delete_comment(r.target_id);
   end if;
   update public.community_reports set status='removed',reviewed_by=uid,reviewed_at=now()
   where status='open' and ((target_type=r.target_type and target_id=r.target_id and (r.target_type<>'user_page' or target_revision=r.target_revision)) or (r.target_type='topic' and topic_id=r.topic_id));
 elsif p_action='dismiss' then
   update public.community_reports set status='dismissed',reviewed_by=uid,reviewed_at=now() where id=r.id;
 else raise exception 'invalid_action'; end if;
 insert into public.community_moderation_log(actor_id,action,target) values(uid,p_action,r.id::text);
end; $$;
