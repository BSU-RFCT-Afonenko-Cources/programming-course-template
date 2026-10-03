// Downstream jobs read only this small public-retention artifact, never native logs.
import { join } from "stdlib/path";
import type { ActualMainExpected } from "./actual-main-contract.ts";
import { verifyPublicBaseline } from "./actual-main-split-contract.ts";
import {
  assert,
  exact,
  hash,
  publicArchive,
  readJson,
} from "./actual-main-evidence.ts";
export async function authenticatePublicBaseline(
  path: string,
  phase: "student-release" | "full-release",
  version: string,
  expected: ActualMainExpected,
  packageFiles: unknown,
) {
  const entries = [];
  for await (const entry of Deno.readDir(path)) {
    assert(
      entry.isFile && !(await Deno.lstat(join(path, entry.name))).isSymlink,
      "ACTUAL_MAIN: public baseline artifact must contain regular files only",
    );
    entries.push(entry.name);
  }
  exact(
    entries.sort(),
    ["public-baseline.json", "publications.tar.gz"],
    "downstream artifact contains native/private proof or misses public bytes",
  );
  const value = verifyPublicBaseline(
    await readJson(join(path, "public-baseline.json")),
    phase,
    version,
    expected,
    packageFiles,
  );
  const extracted = join(
    await Deno.makeTempDir({ prefix: "actual-main-public-parent-" }),
    "public",
  );
  await publicArchive(
    join(path, "publications.tar.gz"),
    extracted,
    value.published,
  );
  return {
    value,
    sha256: await hash(join(path, "public-baseline.json")),
    extracted,
  };
}
