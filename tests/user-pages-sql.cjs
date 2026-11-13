const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('../.tmp/community-check/node_modules/@electric-sql/pglite');
test('user-page SQL enforces dates, ownership, conflicts, filters, private reports and safe removal', async () => {
  const db = new PGlite();
  const owner = '10000000-0000-0000-0000-000000000001';
  const reporter = '10000000-0000-0000-0000-000000000002';
  const admin = '10000000-0000-0000-0000-000000000003';
  const unverified = '10000000-0000-0000-0000-000000000004';
  const as = async uid => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${uid}'`);
  const migrate = file => db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz,created_at timestamptz default now());
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;`);
    for (const file of ['community.sql','moderation.sql','content-controls.sql']) await migrate(file);
    await db.exec(`insert into auth.users values
      ('${owner}','{"username":"OwnerUser"}',now(),null,'2020-05-06T23:30:00-07:00'),
      ('${reporter}','{"username":"ReporterUser"}',now(),null,now()),
      ('${admin}','{"username":"AdminUser"}',now(),null,now()),
      ('${unverified}','{"username":"UnverifiedUser"}',null,null,now());
      insert into public.community_staff values('${admin}','admin');`);
    await migrate('user-pages.sql');
    await db.exec(`insert into auth.users(id,raw_user_meta_data,email_confirmed_at,created_at)
      values('10000000-0000-0000-0000-000000000005','{"username":"NewUser","joined_on":"1900-01-01"}',now(),'2026-10-31T23:00:00Z');`);
    await db.exec('set role anon');
    const dates = (await db.query('select username,joined_on::text from public.profiles order by username')).rows;
    assert.equal(dates.find(row => row.username === 'OwnerUser').joined_on, '2020-05-07');
    assert.equal(dates.find(row => row.username === 'NewUser').joined_on, '2026-10-31');
    await assert.rejects(db.exec(`select public.community_save_user_page('anon',0)`), /permission denied/);
    await as(unverified);
    await assert.rejects(db.exec(`select public.community_save_user_page('unverified',0)`), /verified_account_required/);
    await as(owner);
    await assert.rejects(db.exec(`update public.profiles set joined_on='1900-01-01' where id='${owner}'`), /permission denied/);
    await assert.rejects(db.exec(`insert into public.user_pages(user_id,body) values('${reporter}','forged')`), /permission denied/);
    assert.equal((await db.query(`select public.community_save_user_page('**Hello**',0) as revision`)).rows[0].revision, 1);
    await assert.rejects(db.exec(`select public.community_save_user_page('lost update',0)`), /edit_conflict/);
    await assert.rejects(db.exec(`select public.community_save_user_page('too soon',1)`), /posting_too_fast/);
    await db.exec(`reset role; delete from public.community_post_limits;
      insert into public.community_word_filters(term,match_mode) values('blocked','contains');`);
    await as(owner);
    await assert.rejects(db.exec(`select public.community_save_user_page('blocked',1)`), /word_filtered/);
    await assert.rejects(db.exec(`select public.community_save_user_page(repeat('x',10001),1)`), /invalid_body/);
    await as(reporter);
    // The save RPC has no target parameter: a member can only create their own page.
    await db.exec(`select public.community_save_user_page('Reporter page',0)`);
    assert.equal((await db.query(`select body from public.user_pages where user_id='${owner}'`)).rows[0].body, '**Hello**');
    const report = (await db.query(`select public.community_report('user_page','${owner}','spam','Private evidence') as id`)).rows[0].id;
    await assert.rejects(db.exec(`select public.community_report('user_page','${owner}','spam','duplicate')`), /already_reported/);
    await assert.rejects(db.exec(`select * from public.community_reports`), /permission denied/);
    await assert.rejects(db.exec(`select public.community_review_report('${report}','remove')`), /staff_required/);
    await db.exec(`reset role; delete from public.community_post_limits;`);
    await as(owner);
    await db.exec(`select public.community_save_user_page('New introduction',1)`);
    await as(admin);
    const queue = (await db.query(`select * from public.community_report_queue()`)).rows;
    assert.equal(queue[0].target_type,'user_page');
    assert.equal(queue[0].content,'**Hello**');
    assert.equal(queue[0].details,'Private evidence');
    await assert.rejects(db.exec(`select public.community_review_report('${report}','remove')`), /report_outdated/);
    assert.equal((await db.query(`select body from public.user_pages where user_id='${owner}'`)).rows[0].body,'New introduction');
    await db.exec(`select public.community_review_report('${report}','dismiss')`);
    await db.exec(`reset role; update public.community_reports set created_at=now()-interval '2 minutes';`);
    await as(reporter);
    const currentReport = (await db.query(`select public.community_report('user_page','${owner}','harassment','Current evidence') as id`)).rows[0].id;
    await as(admin);
    await db.exec(`select public.community_review_report('${currentReport}','remove')`);
    const removed = (await db.query(`select body,revision from public.user_pages where user_id='${owner}'`)).rows[0];
    assert.equal(removed.body,'');
    assert.equal(removed.revision,3);
    const history = (await db.query(`select * from public.community_report_queue('removed')`)).rows;
    assert.equal(history[0].content,'New introduction');
    await db.exec(`reset role; insert into public.community_restrictions values('${owner}','Restricted');`);
    await as(owner);
    await assert.rejects(db.exec(`select public.community_save_user_page('restricted',3)`), /account_restricted/);
    await assert.rejects(db.exec(`select public.community_report('user_page','${reporter}','spam')`), /account_restricted/);
    await db.exec('reset role; set role anon');
    assert.equal((await db.query(`select body from public.user_pages where user_id='${owner}'`)).rows[0].body,'');
    await assert.rejects(db.exec('select * from public.community_reports'), /permission denied/);
  } finally { await db.close(); }
});
