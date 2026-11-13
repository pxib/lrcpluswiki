const {test} = require('node:test');
const assert = require('node:assert/strict');
const waitForArtifact = require('../tools/wait-for-pages-artifact.cjs');

function fixture(responses) {
  const calls = [];
  let sleeps = 0;
  const options = {
    name: 'github-pages-123-2',
    context: {repo: {owner: 'owner', repo: 'wiki'}, runId: 123},
    core: {info() {}},
    sleep: async () => { sleeps++; },
    github: {rest: {actions: {async listWorkflowRunArtifacts(query) {
      calls.push(query);
      return {data: {artifacts: responses[Math.min(calls.length - 1, responses.length - 1)]}};
    }}}}
  };
  return {options, calls, sleeps: () => sleeps};
}

test('Pages waits for visibility and selects only the current attempt after a rerun', async () => {
  const stale = {name: 'github-pages-123-1', expired: false};
  const current = {name: 'github-pages-123-2', expired: false};
  const f = fixture([[stale], [stale, current]]);
  await waitForArtifact(f.options);
  assert.equal(f.calls.length, 2);
  assert.equal(f.sleeps(), 1);
  assert.equal(f.calls[0].run_id, 123);
  assert.equal(f.calls[0].name, current.name);
});

test('Pages fails after bounded retries if only expired artifacts are visible', async () => {
  const f = fixture([[{name: 'github-pages-123-2', expired: true}]]);
  await assert.rejects(waitForArtifact(f.options), /not discoverable yet/);
  assert.equal(f.calls.length, 12);
  assert.equal(f.sleeps(), 11);
});

test('Pages stops before deployment when an attempt has duplicate artifacts', async () => {
  const artifact = {name: 'github-pages-123-2', expired: false};
  const f = fixture([[artifact, artifact]]);
  await assert.rejects(waitForArtifact(f.options), /Multiple Pages artifacts/);
  assert.equal(f.sleeps(), 0);
});
