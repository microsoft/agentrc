/**
 * Vendored subset of VS Code's built-in git extension API types.
 * Source: https://github.com/microsoft/vscode/blob/main/extensions/git/src/api/git.d.ts
 *
 * Only the interfaces used by the AgentRC extension are included.
 */

import type { Uri } from "vscode";

export interface GitExtension {
  getAPI(version: 1): API;
}

export interface API {
  readonly repositories: Repository[];
}

export interface Repository {
  readonly rootUri: Uri;
  readonly state: RepositoryState;
  add(resources: Uri[]): Promise<void>;
  commit(message: string, opts?: CommitOptions): Promise<void>;
  push(remoteName?: string, branchName?: string, setUpstream?: boolean): Promise<void>;
  getRefs(query: RefQuery): Promise<Ref[]>;
}

export interface RefQuery {
  readonly pattern?: string;
}

export interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly remotes: Remote[];
  readonly workingTreeChanges: Change[];
  readonly indexChanges: Change[];
}

export interface Branch {
  readonly name?: string;
}

export interface Ref {
  readonly name?: string;
  readonly commit?: string;
}

export interface Remote {
  readonly name: string;
  readonly fetchUrl?: string;
  readonly pushUrl?: string;
}

export interface Change {
  readonly uri: Uri;
}

export interface CommitOptions {
  all?: boolean | "tracked";
}
