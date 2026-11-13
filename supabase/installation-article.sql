-- Existing projects: register the installation guide before publishing the page.
-- Safe to reapply; new projects already include this ID in community.sql.
begin;

insert into public.community_articles(id) values ('installation')
on conflict (id) do nothing;

commit;
