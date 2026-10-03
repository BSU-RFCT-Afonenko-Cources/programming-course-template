// CI evidence gate only. Native producer jobs supply the actual observations.
import { dirname, fromFileUrl, join, relative, resolve } from "stdlib/path";
import {
  command,
  exists,
  files,
  hash,
} from "../../fixtures/probes/portal/common.ts";
import {
  aggregatePortalReceipts,
  PORTAL_PHASES,
  PORTAL_RUNNER_SOURCE_FILES,
  PORTAL_VERSIONS,
  type PortalPhase,
  verifyPhaseObservations,
} from "./portal-contract.ts";
const repo = dirname(dirname(dirname(fromFileUrl(import.meta.url))));
const values: Record<string, string> = {};
for (let i = 0; i < Deno.args.length; i += 2) {
  const key = Deno.args[i], value = Deno.args[i + 1];
  if (
    !["--artifacts", "--expected-head", "--jobs-result", "--output"].includes(
      key,
    ) || !value || value.startsWith("--") || Object.hasOwn(values, key)
  ) {
    throw new Error(
      "PORTAL_AGGREGATE: unsupported, repeated or incomplete argument",
    );
  }
  values[key] = value;
}
for (
  const key of ["--artifacts", "--expected-head", "--jobs-result", "--output"]
) {
  if (!values[key]) throw new Error(`PORTAL_AGGREGATE: ${key} required`);
}
if (values["--jobs-result"] !== "success") {
  throw new Error(
    "PORTAL_AGGREGATE: required native matrix jobs did not all succeed",
  );
}
const commit = (await command("git", ["rev-parse", "HEAD"], repo)).trim();
if (commit !== values["--expected-head"]) {
  throw new Error(
    "PORTAL_AGGREGATE: aggregator checkout is not the required exact head",
  );
}
if ((await command("git", ["status", "--porcelain"], repo)).trim()) {
  throw new Error("PORTAL_AGGREGATE: aggregator checkout is dirty");
}
const output = resolve(values["--output"]);
if (await exists(output)) {
  throw new Error(
    "PORTAL_AGGREGATE: output already exists; no stale receipt reuse",
  );
}
const expected = {
  template: {
    commit,
    tree: (await command("git", ["rev-parse", "HEAD^{tree}"], repo)).trim(),
    files: Object.fromEntries(
      await Promise.all([
        ...await files(join(repo, "fixtures/probes/portal")),
        ...PORTAL_RUNNER_SOURCE_FILES.map((name) =>
          join(repo, "tests/probes", name)
        ),
      ].map(async (path) => [relative(repo, path), await hash(path)])),
    ),
  },
  providers: JSON.parse(
    await Deno.readTextFile(
      join(repo, "tests/probes/portal-provider-refs.json"),
    ),
  ),
};
const evidence = [];
const evidenceFiles: Record<string, string> = {};
for (const version of PORTAL_VERSIONS) {
  for (const phase of PORTAL_PHASES) {
    const name = `portal-${version}-${phase}`;
    const path = join(resolve(values["--artifacts"]), name);
    const receipt = join(path, "phase-results.json"),
      manifest = join(path, "install-manifest.json");
    evidence.push({
      version,
      phase,
      receipt: JSON.parse(await Deno.readTextFile(receipt)),
      manifest: JSON.parse(await Deno.readTextFile(manifest)),
    });
    evidenceFiles[`${name}/phase-results.json`] = await hash(receipt);
    evidenceFiles[`${name}/install-manifest.json`] = await hash(manifest);
  }
}
const result = aggregatePortalReceipts(evidence, expected);
for (const item of evidence) {
  const path = join(
    resolve(values["--artifacts"]),
    `portal-${item.version}-${item.phase}`,
  );
  const observations = [];
  for (const row of item.receipt.results) {
    const observed = join(path, `${row.label}-observation.json`),
      log = join(path, `${row.label}.log`);
    const logInfo = await Deno.stat(log);
    if (!logInfo.isFile || !logInfo.size) {
      throw new Error("PORTAL_AGGREGATE: missing full native log");
    }
    if (
      row.expectedFailure &&
      !(await Deno.readTextFile(log)).includes(row.expectedFailure)
    ) {
      throw new Error(
        "PORTAL_AGGREGATE: required native refusal absent from log",
      );
    }
    observations.push(JSON.parse(await Deno.readTextFile(observed)));
    evidenceFiles[
      `portal-${item.version}-${item.phase}/${row.label}-observation.json`
    ] = await hash(observed);
    evidenceFiles[`portal-${item.version}-${item.phase}/${row.label}.log`] =
      await hash(log);
    if (!row.expectedFailure) {
      const events = join(path, `${row.label}-events.json`);
      const actual = JSON.parse(await Deno.readTextFile(events));
      if (!Array.isArray(actual) || actual.at(-1)?.stage !== "verified") {
        throw new Error(
          "PORTAL_AGGREGATE: native final verification events absent",
        );
      }
      evidenceFiles[
        `portal-${item.version}-${item.phase}/${row.label}-events.json`
      ] = await hash(events);
    }
  }
  verifyPhaseObservations(
    item.phase as PortalPhase,
    item.receipt.results,
    observations,
  );
  for (const pkg of item.manifest.packages) {
    const archive = join(path, "archives", `${pkg.name}.tar.gz`),
      digest = await hash(archive);
    if (digest !== pkg.archiveSha256) {
      throw new Error(
        "PORTAL_AGGREGATE: downloaded archive bytes differ from native installed manifest",
      );
    }
    evidenceFiles[
      `portal-${item.version}-${item.phase}/archives/${pkg.name}.tar.gz`
    ] = digest;
  }
}
await Deno.mkdir(dirname(output), { recursive: true });
await Deno.writeTextFile(
  output,
  JSON.stringify({ ...result, evidenceFiles }, null, 2),
);
console.log(
  "PASS complete installed portal gate:25 native cases exactly once per channel, both channels and both phases",
);
