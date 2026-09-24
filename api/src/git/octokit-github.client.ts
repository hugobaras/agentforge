import {
  GitHubClient,
  GitHubPullRequestInput,
  GitHubPullRequestResult,
} from './github-client';

type OctokitLike = {
  rest: {
    repos: { get: (params: object) => Promise<{ data: { default_branch: string } }> };
    git: {
      getRef: (params: object) => Promise<{ data: { object: { sha: string } } }>;
      getCommit: (params: object) => Promise<{ data: { tree: { sha: string } } }>;
      createBlob: (params: object) => Promise<{ data: { sha: string } }>;
      createTree: (params: object) => Promise<{ data: { sha: string } }>;
      createCommit: (params: object) => Promise<{ data: { sha: string } }>;
      createRef: (params: object) => Promise<unknown>;
      updateRef: (params: object) => Promise<unknown>;
    };
    pulls: {
      create: (params: object) => Promise<{ data: { number: number; html_url: string } }>;
      list: (params: object) => Promise<{ data: Array<{ number: number; html_url: string }> }>;
    };
  };
};

export class OctokitGitHubClient implements GitHubClient {
  constructor(private readonly octokit: OctokitLike) {}

  static async fromToken(token: string): Promise<OctokitGitHubClient> {
    const { Octokit } = await import('@octokit/rest');
    return new OctokitGitHubClient(
      new Octokit({ auth: token }) as unknown as OctokitLike,
    );
  }

  async createPullRequest(
    input: GitHubPullRequestInput,
  ): Promise<GitHubPullRequestResult> {
    const { owner, repo } = input;
    const repoInfo = await this.octokit.rest.repos.get({ owner, repo });
    const baseBranch = input.baseBranch || repoInfo.data.default_branch;

    const baseRef = await this.octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });
    const baseSha = baseRef.data.object.sha;

    const baseCommit = await this.octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: baseSha,
    });

    const blobs = await Promise.all(
      input.files.map((file) =>
        this.octokit.rest.git.createBlob({
          owner,
          repo,
          content: file.content,
          encoding: 'utf-8',
        }),
      ),
    );

    const tree = await this.octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: baseCommit.data.tree.sha,
      tree: input.files.map((file, index) => ({
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blobs[index]?.data.sha,
      })),
    });

    const commit = await this.octokit.rest.git.createCommit({
      owner,
      repo,
      message: input.commitMessage,
      tree: tree.data.sha,
      parents: [baseSha],
    });

    await this.ensureBranch(owner, repo, input.headBranch, commit.data.sha);

    const pull = await this.createOrReusePull(
      owner,
      repo,
      input,
      baseBranch,
    );

    return {
      number: pull.number,
      url: pull.url,
      branch: input.headBranch,
      headSha: commit.data.sha,
    };
  }

  private async ensureBranch(
    owner: string,
    repo: string,
    headBranch: string,
    sha: string,
  ): Promise<void> {
    try {
      await this.octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${headBranch}`,
        sha,
      });
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error;
      }
      await this.octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${headBranch}`,
        sha,
        force: true,
      });
    }
  }

  private async createOrReusePull(
    owner: string,
    repo: string,
    input: GitHubPullRequestInput,
    baseBranch: string,
  ): Promise<{ number: number; url: string }> {
    try {
      const created = await this.octokit.rest.pulls.create({
        owner,
        repo,
        title: input.title,
        head: input.headBranch,
        base: baseBranch,
        body: input.body,
      });
      return { number: created.data.number, url: created.data.html_url };
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error;
      }
      const existing = await this.octokit.rest.pulls.list({
        owner,
        repo,
        head: `${owner}:${input.headBranch}`,
        state: 'open',
      });
      const first = existing.data[0];
      if (!first) {
        throw error;
      }
      return { number: first.number, url: first.html_url };
    }
  }
}

function isAlreadyExists(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const status = 'status' in error ? Number(error.status) : NaN;
  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message.toLowerCase()
      : '';
  return (
    status === 422 &&
    (message.includes('already exists') ||
      message.includes('reference already exists') ||
      message.includes('a pull request already exists'))
  );
}
