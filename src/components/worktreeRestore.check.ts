import assert from "node:assert/strict";
import { anchoredSessionIds, externalBranchCandidates } from "./worktreeRestore.ts";

const branches = [
  { id: "b-tempest", projectId: "p1", path: "/repo/.tempest/feat" },
  { id: "b-external", projectId: "p1", path: "/worktrees/my-feature" },
  { id: "b-gone", projectId: "p1", path: "/worktrees/deleted" },
  { id: "b-closed-project", projectId: "p2", path: "/elsewhere/wt" },
];
const branchPath = (id: string) => branches.find((b) => b.id === id)?.path;
const projectPath = (id: string) => ({ p1: "/repo", p2: "/other" } as Record<string, string>)[id];

const scanned = new Set(["/repo/.tempest/feat"]);

// Only branches of open projects that the .tempest scan missed need a disk check.
assert.deepEqual(
  externalBranchCandidates(branches, new Set(["p1"]), scanned).map((b) => b.id),
  ["b-external", "b-gone"],
);

const sessions = [
  { id: "s-tempest", projectId: "p1", branchId: "b-tempest" },
  { id: "s-external", projectId: "p1", branchId: "b-external" },
  { id: "s-gone", projectId: "p1", branchId: "b-gone" },
  { id: "s-unknown-branch", projectId: "p1", branchId: "missing" },
  { id: "s-root", projectId: "p1" },
  { id: "s-root-closed", projectId: "p2" },
];
const openProjectPaths = new Set(["/repo"]);

// The external worktree's folder still exists, so its session survives the
// prune alongside the .tempest one (the bug: it used to be deleted).
const live = new Set([...scanned, "/worktrees/my-feature"]);
assert.deepEqual(
  [...anchoredSessionIds(sessions, { branchPath, projectPath }, live, openProjectPaths)].sort(),
  ["s-external", "s-root", "s-tempest"],
);

// Without the external check only the .tempest session is anchored — sessions
// whose folder is really gone are still pruned.
assert.deepEqual(
  [...anchoredSessionIds(sessions, { branchPath, projectPath }, scanned, openProjectPaths)].sort(),
  ["s-root", "s-tempest"],
);

console.log("worktreeRestore.check: ok");
