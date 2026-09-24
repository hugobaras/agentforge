export const GITHUB_CLIENT = 'GITHUB_CLIENT';

export interface GitHubPullRequestInput {
  owner: string;
  repo: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  body: string;
  commitMessage: string;
  files: Array<{ path: string; content: string }>;
}

export interface GitHubPullRequestResult {
  number: number;
  url: string;
  branch: string;
  headSha: string;
}

export interface GitHubClient {
  createPullRequest(input: GitHubPullRequestInput): Promise<GitHubPullRequestResult>;
}
