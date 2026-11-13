-- Imported legacy migration; the Supabase CLI manages its transaction.
-- Apply after content-controls.sql. Public timestamps and attribution only;
-- reply bodies remain lazily loaded when a discussion is expanded.
create or replace function public.community_talk_activity(p_article text)
returns table(topic_id uuid, title text, comment_id uuid, latest_at timestamptz, author_id uuid, username text)
language sql stable security invoker set search_path = '' as $$
 select t.id, t.title, last_post.comment_id, last_post.created_at,
        last_post.author_id, p.username
 from public.community_topics t
 cross join lateral (
   select entries.comment_id, entries.created_at, entries.author_id
   from (
     select null::uuid as comment_id, t.created_at, t.author_id
     union all
     select c.id, c.created_at, c.author_id
     from public.community_comments c
     where c.topic_id = t.id and c.deleted_at is null
   ) entries
   order by entries.created_at desc, entries.comment_id desc nulls last
   limit 1
 ) last_post
 left join public.profiles p on p.id = last_post.author_id
 where t.article_id = p_article;
$$;
revoke all on function public.community_talk_activity(text) from public, anon, authenticated;
grant execute on function public.community_talk_activity(text) to anon, authenticated;
