'use strict';

// Upload completion can precede visibility in the API used by deploy-pages.
module.exports = async function waitForPagesArtifact({github, context, core, name,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))}) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const {data} = await github.rest.actions.listWorkflowRunArtifacts({
      owner: context.repo.owner,
      repo: context.repo.repo,
      run_id: context.runId,
      name,
      per_page: 100
    });
    const matches = data.artifacts.filter(artifact => artifact.name === name && !artifact.expired);
    if (matches.length === 1) {
      core.info(`Pages artifact is available: ${name}`);
      return;
    }
    if (matches.length > 1) throw new Error(`Multiple Pages artifacts found for this attempt: ${name}`);
    if (attempt < 11) {
      core.info(`Waiting for Pages artifact visibility: ${name}`);
      await sleep(5000);
    }
  }
  throw new Error(`Pages artifact was uploaded but is not discoverable yet: ${name}`);
};
