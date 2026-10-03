// Required original-course gate, separate from the fixture25 aggregation.
import { dirname, fromFileUrl, join, resolve } from "stdlib/path";
import {
  aggregateSplitActualMain,
  MAIN_SPLIT_PHASES,
  type SplitEvidence,
} from "./actual-main-split-contract.ts";
import { PORTAL_VERSIONS } from "./portal-contract.ts";
import {
  argumentsFor,
  assert,
  command,
  exists,
  expectedCheckout,
  hash,
  loadEvidence,
  publicArchive,
  verifyPackageArchives,
} from "./actual-main-evidence.ts";
const repo = dirname(dirname(dirname(fromFileUrl(import.meta.url))));
const keys = [
  "--artifacts",
  "--expected-head",
  "--student-jobs-result",
  "--full-jobs-result",
  "--late-jobs-result",
  "--output",
];
const values = argumentsFor(Deno.args, keys);
for (const key of keys) assert(values[key], `ACTUAL_MAIN: ${key} required`);
assert(
  values["--student-jobs-result"] === "success" &&
    values["--full-jobs-result"] === "success" &&
    values["--late-jobs-result"] === "success",
  "ACTUAL_MAIN: required student/full/late matrix jobs did not all succeed",
);
assert(
  (await command("git", ["rev-parse", "HEAD"], repo)).trim() ===
    values["--expected-head"],
  "ACTUAL_MAIN: aggregation checkout is not exact required head",
);
assert(
  !(await command("git", ["status", "--porcelain"], repo)).trim(),
  "ACTUAL_MAIN: aggregation checkout is dirty",
);
const output = resolve(values["--output"]);
assert(
  !(await exists(output)),
  "ACTUAL_MAIN: stale complete output receipt forbidden",
);
const expected = await expectedCheckout(repo);
assert(
  !expected.lateRefusal.startsWith("UNFROZEN"),
  "ACTUAL_MAIN: precise provider refusal is not frozen",
);
const artifacts = resolve(values["--artifacts"]);
const required = PORTAL_VERSIONS.flatMap((v) =>
  MAIN_SPLIT_PHASES.map((p) => `actual-main-native-${v}-${p}`)
);
for await (const entry of Deno.readDir(artifacts)) {
  // A prior complete artifact in a same-run aggregation retry is never input proof.
  assert(
    entry.isDirectory && !entry.isSymlink &&
      (required.includes(entry.name) ||
        entry.name === "actual-main-complete-receipt"),
    "ACTUAL_MAIN: unknown/subset phase artifact",
  );
}
const evidence: SplitEvidence[] = [],
  evidenceFiles: Record<string, string> = {};
for (const version of PORTAL_VERSIONS) {
  for (const phase of MAIN_SPLIT_PHASES) {
    const name = `actual-main-native-${version}-${phase}`,
      path = join(artifacts, name);
    const item = await loadEvidence(path, version, phase);
    evidence.push(item);
    await verifyPackageArchives(path, item.manifest);
    const labels = (item.receipt as any).labels;
    for (
      const file of [
        "phase-results.json",
        "install-manifest.json",
        ...labels.flatMap((
          label: string,
        ) => [
          `${label}.log`,
          `${label}-observation.json`,
          `${label}-native.jsonl`,
        ]),
        ...(item.manifest as any).packages.map((p: any) =>
          `archives/${p.name}.tar.gz`
        ),
      ]
    ) evidenceFiles[`${name}/${file}`] = await hash(join(path, file));
    if (phase !== "late") {
      const extracted = join(
        await Deno.makeTempDir({ prefix: "actual-main-aggregate-public-" }),
        "public",
      );
      await publicArchive(
        join(path, "publications.tar.gz"),
        extracted,
        item.publication as any,
      );
      evidenceFiles[`${name}/public-baseline.json`] = await hash(
        join(path, "public-baseline.json"),
      );
      evidenceFiles[`${name}/publications.tar.gz`] = await hash(
        join(path, "publications.tar.gz"),
      );
    }
  }
}
const verified = aggregateSplitActualMain(evidence, expected);
await Deno.mkdir(dirname(output), { recursive: true });
await Deno.writeTextFile(
  output,
  JSON.stringify({ ...verified, evidenceFiles }, null, 2),
);
console.log(
  "PASS complete original-course managed gate:3labels/channel,both channels,current genuine releases and fresh late refusal/retention; distinct from fixture25",
);
