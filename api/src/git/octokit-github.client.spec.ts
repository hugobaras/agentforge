import { OctokitGitHubClient } from './octokit-github.client';

describe('OctokitGitHubClient', () => {
  it('crée blobs, commit, branche et pull request', async () => {
    const octokit = {
      rest: {
        repos: {
          get: jest.fn().mockResolvedValue({ data: { default_branch: 'main' } }),
        },
        git: {
          getRef: jest.fn().mockResolvedValue({ data: { object: { sha: 'base' } } }),
          getCommit: jest
            .fn()
            .mockResolvedValue({ data: { tree: { sha: 'tree0' } } }),
          createBlob: jest.fn().mockResolvedValue({ data: { sha: 'blob1' } }),
          createTree: jest.fn().mockResolvedValue({ data: { sha: 'tree1' } }),
          createCommit: jest.fn().mockResolvedValue({ data: { sha: 'commit1' } }),
          createRef: jest.fn().mockResolvedValue({}),
          updateRef: jest.fn(),
        },
        pulls: {
          create: jest.fn().mockResolvedValue({
            data: { number: 7, html_url: 'https://github.com/acme/api/pull/7' },
          }),
          list: jest.fn(),
        },
      },
    };

    const client = new OctokitGitHubClient(octokit as never);
    const result = await client.createPullRequest({
      owner: 'acme',
      repo: 'api',
      baseBranch: 'main',
      headBranch: 'agentforge/lot-1',
      title: 'PR',
      body: 'body',
      commitMessage: 'feat',
      files: [{ path: 'src/a.ts', content: 'export {}' }],
    });

    expect(result).toEqual({
      number: 7,
      url: 'https://github.com/acme/api/pull/7',
      branch: 'agentforge/lot-1',
      headSha: 'commit1',
    });
    expect(octokit.rest.git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        base_tree: 'tree0',
        tree: [
          expect.objectContaining({ path: 'src/a.ts', sha: 'blob1' }),
        ],
      }),
    );
    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        head: 'agentforge/lot-1',
        base: 'main',
      }),
    );
  });
});
