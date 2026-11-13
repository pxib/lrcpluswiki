const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('../.tmp/community-check/node_modules/@electric-sql/pglite');

test('numbered migrations build a working public wiki database without losing existing users or discussions', async () => {
  const db = new PGlite();
  const directory = path.join(__dirname, '../supabase/migrations');
  const files = fs.readdirSync(directory).filter(file => file.endsWith('.sql')).sort();
  const user = '10000000-0000-0000-0000-000000000001';
  let topic;
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb,
        email_confirmed_at timestamptz, banned_until timestamptz, created_at timestamptz default now());
      create function auth.uid() returns uuid language sql as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;`);
    for (const file of files) {
      await db.exec('begin');
      await db.exec(fs.readFileSync(path.join(directory, file), 'utf8'));
      await db.exec('commit');
      if (file.endsWith('_community.sql')) {
        await db.query('insert into auth.users(id,raw_user_meta_data,email_confirmed_at) values($1,$2,now())',
          [user, {username: 'ExistingUser'}]);
        topic = (await db.query("insert into community_topics(article_id,author_id,title,body) values('main',$1,'Existing topic','Existing opening') returning id", [user])).rows[0].id;
      }
    }
    assert.equal((await db.query('select username from profiles where id=$1', [user])).rows[0].username, 'ExistingUser');
    assert.ok((await db.query('select joined_on from profiles where id=$1', [user])).rows[0].joined_on);
    await db.exec('set role anon');
    assert.equal((await db.query('select body from community_topics where id=$1', [topic])).rows[0].body, 'Existing opening');
    assert.equal(Number((await db.query('select * from community_topic_stats($1::uuid[])', [[topic]])).rows[0].comment_count), 1);
    const activity = (await db.query("select * from community_talk_activity('main')")).rows;
    assert.equal(activity[0].topic_id, topic);
    assert.equal(activity[0].username, 'ExistingUser');
    assert.deepEqual((await db.query('select * from community_staff_indicators($1::uuid[])', [[user]])).rows, []);
    assert.deepEqual((await db.query('select * from user_pages')).rows, []);
    await assert.rejects(db.query('select * from community_reports'), /permission denied/);
  } finally { await db.close(); }
});
