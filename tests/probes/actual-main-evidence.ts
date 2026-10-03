// File/process evidence only. No source or resource visibility policy is implemented here.
import { dirname, join, relative, resolve } from "stdlib/path";
import { canonical } from "./portal-contract.ts";
import {
  type ActualMainEvidence,
  type ActualMainExpected,
  actualMainFileMap,
  verifyActualMainRelease,
} from "./actual-main-contract.ts";
import {
  assert,
  command,
  exists,
  hash,
  treeHashes,
} from "../../fixtures/probes/portal/common.ts";
export {
  assert,
  command,
  dirname,
  exists,
  hash,
  join,
  relative,
  resolve,
  treeHashes,
};
export function exact(actual: unknown, expected: unknown, message: string) {
  assert(canonical(actual) === canonical(expected), `ACTUAL_MAIN: ${message}`);
}
export function argumentsFor(args: string[], keys: string[]) {
  const values: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    assert(
      keys.includes(key) && value && !value.startsWith("--") &&
        !Object.hasOwn(values, key),
      "ACTUAL_MAIN: unsupported, incomplete or repeated argument",
    );
    values[key] = value;
  }
  return values;
}
export async function readJson(path: string) {
  return JSON.parse(await Deno.readTextFile(path));
}
export async function settings(repo: string) {
  const value = await readJson(
    join(repo, "tests/probes/actual-main-settings.json"),
  );
  exact(
    Object.keys(value).sort(),
    ["adapterSlots", "lateRefusal"],
    "settings fields",
  );
  assert(
    value.lateRefusal === null ||
      /^(SOURCE|RESOURCE)\.[A-Z_]+$/.test(value.lateRefusal),
    "ACTUAL_MAIN: precise documented provider refusal required",
  );
  exact(Object.keys(value.adapterSlots).sort(), [
    "finish",
    "prepare",
    "state",
    "verify",
  ], "adapter slots");
  for (const slot of Object.values(value.adapterSlots)) {
    assert(
      typeof slot === "string" && /^[a-zA-Z0-9_/-]+\.ts$/.test(slot) &&
        !slot.split("/").includes(".."),
      "ACTUAL_MAIN: invalid authored integration slot",
    );
  }
  return value;
}
export async function checkoutSource(repo: string) {
  const tracked = (await command("git", ["ls-files", "-z"], repo)).split("\0")
    .filter(Boolean);
  const files: Record<string, string> = {};
  for (const path of tracked) {
    assert(
      (await Deno.lstat(join(repo, path))).isFile,
      `ACTUAL_MAIN: tracked source is not a regular file ${path}`,
    );
    files[path] = await hash(join(repo, path));
  }
  return {
    commit: (await command("git", ["rev-parse", "HEAD"], repo)).trim(),
    tree: (await command("git", ["rev-parse", "HEAD^{tree}"], repo)).trim(),
    dirty: !!(await command("git", ["status", "--porcelain"], repo)).trim(),
    files,
  };
}
export function currentRun() {
  const runId = Deno.env.get("GITHUB_RUN_ID") ||
    Deno.env.get("ACTUAL_MAIN_RUN_ID");
  assert(
    runId,
    "ACTUAL_MAIN: current workflow/local run id required for baseline lineage",
  );
  return {
    repository: Deno.env.get("GITHUB_REPOSITORY") || "local/template",
    runId,
    runAttempt: Deno.env.get("GITHUB_RUN_ATTEMPT") || "1",
  };
}
export async function expectedCheckout(
  repo: string,
): Promise<ActualMainExpected> {
  const template = await checkoutSource(repo),
    run = currentRun(),
    config = await settings(repo);
  const providers = await readJson(
    join(repo, "tests/probes/portal-provider-refs.json"),
  );
  exact(
    Object.keys(providers).sort(),
    ["core", "download", "publisher", "qrc"],
    "provider ref set",
  );
  for (const value of Object.values(providers) as any[]) {
    exact(Object.keys(value).sort(), ["commit", "tree"], "provider ref fields");
    assert(
      /^[a-f0-9]{40}$/.test(value.commit) && /^[a-f0-9]{40}$/.test(value.tree),
      "ACTUAL_MAIN: exact provider commit/tree required",
    );
  }
  return {
    template,
    providers,
    run: { repository: run.repository, runId: run.runId },
    lateRefusal: config.lateRefusal || "UNFROZEN_PROVIDER_REFUSAL",
  };
}
/** Validate and extract ONLY the two regular-file public trees to a fresh directory. */
export async function publicArchive(
  archive: string,
  destination: string,
  expected: { archiveSha256: string; files: unknown },
) {
  assert(
    !(await exists(destination)),
    "ACTUAL_MAIN: public extraction destination must be fresh",
  );
  assert(
    await hash(archive) === expected.archiveSha256,
    "ACTUAL_MAIN: public archive byte lineage mismatch",
  );
  const script = `import sys, tarfile, pathlib
archive, dest = sys.argv[1:]
dest = pathlib.Path(dest)
assert not dest.exists()
with tarfile.open(archive, 'r:gz') as tf:
    members = tf.getmembers()
    seen = set()
    for m in members:
        name = m.name
        while name.startswith('./'): name = name[2:]
        name = name.rstrip('/')
        p = pathlib.PurePosixPath(name)
        assert name and name == str(p) and not p.is_absolute() and all(x not in ('', '.', '..', '.project-publish', '.quarto', '.course-owner', '.git') for x in p.parts)
        assert p.parts[0] in ('student', 'full') and (m.isfile() or m.isdir())
        assert name not in seen
        seen.add(name)
    dest.mkdir()
    for m in members:
        name = m.name
        while name.startswith('./'): name = name[2:]
        target = dest / name
        if m.isdir(): target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            stream = tf.extractfile(m)
            assert stream is not None
            target.write_bytes(stream.read())
assert sorted(p.name for p in dest.iterdir()) == ['full', 'student']
`;
  await command(
    "python3",
    ["-c", script, archive, destination],
    dirname(archive),
  );
  const files = {
    student: await treeHashes(join(destination, "student")),
    full: await treeHashes(join(destination, "full")),
  };
  exact(
    files,
    expected.files,
    "extracted complete public file-set/SHA differs from genuine baseline",
  );
  return files;
}
export async function loadEvidence(
  path: string,
  version: string,
  phase: "releases" | "student-release" | "full-release" | "late",
): Promise<ActualMainEvidence> {
  const receipt = join(path, "phase-results.json"),
    manifest = join(path, "install-manifest.json");
  const value = await readJson(receipt), installed = await readJson(manifest);
  const labels = phase === "releases"
    ? ["actual-main-student", "actual-main-full"]
    : phase === "student-release"
    ? ["actual-main-student"]
    : phase === "full-release"
    ? ["actual-main-full"]
    : ["actual-main-late-current-address"];
  exact(
    value.labels,
    labels,
    "artifact labels differ from required finite phase",
  );
  const observations = [];
  for (const label of labels) {
    const log = join(path, `${label}.log`), info = await Deno.stat(log);
    assert(info.isFile && info.size, "ACTUAL_MAIN: full native log missing");
    const observation = await readJson(join(path, `${label}-observation.json`));
    const nativePath = join(path, `${label}-native.jsonl`),
      nativeText = await Deno.readTextFile(nativePath);
    assert(
      nativeText.trim(),
      "ACTUAL_MAIN: direct native metadata log missing",
    );
    const events = nativeText.trim().split("\n").map((line) =>
      JSON.parse(line)
    );
    assert(
      events.every((event) => event.attemptId === observation.attemptId),
      "ACTUAL_MAIN: native metadata attempt differs from observation",
    );
    const members = observation.nativeMembers.map((member: any) => {
      const matches = events.filter((event) =>
        event.stage === "native-member" && event.namespace === member.namespace
      );
      assert(
        matches.length === 1,
        "ACTUAL_MAIN: missing/duplicate direct native member metadata",
      );
      const { namespace, path, mount, format, output } = matches[0];
      return { namespace, path, mount, format, output };
    });
    exact(
      members,
      observation.nativeMembers,
      "observation differs from actual native member metadata",
    );
    const finished = events.filter((event) =>
      event.stage === "child-owners-finished"
    );
    assert(
      finished.length === 1,
      "ACTUAL_MAIN: direct child completion proof missing/duplicate",
    );
    exact(
      finished[0].ownerIndexes,
      observation.ownerIndexes,
      "current owner hash proof differs from native metadata",
    );
    exact(
      finished[0].pdf,
      observation.pdf,
      "PDF proof differs from native metadata",
    );
    exact(finished[0].checked, {
      rolesArchives: observation.checked.rolesArchives,
      qrcSearchLinks: observation.checked.qrcSearchLinks,
      allFive: observation.checked.allFive,
    }, "current stage checks differ from native metadata");
    exact(
      events.filter((event) =>
        [
          "qrc-finished",
          "child-owners-finished",
          "pdf-address-mutated",
          "publication-verified",
        ].includes(event.stage)
      ).map((event) => event.stage),
      observation.pipeline,
      "lifecycle differs from direct native metadata",
    );
    if (phase === "late") {
      const mutated = events.filter((event) =>
        event.stage === "pdf-address-mutated"
      );
      assert(
        mutated.length === 1,
        "ACTUAL_MAIN: direct current PDF mutation missing/duplicate",
      );
      exact(
        mutated[0].mutation,
        observation.mutation,
        "mutation differs from direct native metadata",
      );
    }
    if (phase === "late") {
      assert(
        typeof value.expectedFailure === "string" &&
          (await Deno.readTextFile(log)).includes(value.expectedFailure),
        "ACTUAL_MAIN: precise native refusal absent from full log",
      );
    }
    observations.push(observation);
  }
  return {
    version,
    phase,
    manifest: installed,
    receipt: value,
    observations,
    receiptSha256: await hash(receipt),
    manifestSha256: await hash(manifest),
    ...(phase !== "late" ? { publication: value.publication } : {}),
    ...(["student-release", "full-release"].includes(phase)
      ? {
        publicBaseline: await readJson(join(path, "public-baseline.json")),
        publicBaselineSha256: await hash(join(path, "public-baseline.json")),
      }
      : {}),
  };
}
export async function authenticateBaseline(
  path: string,
  version: string,
  expected: ActualMainExpected,
) {
  const evidence = await loadEvidence(path, version, "releases");
  const verified = verifyActualMainRelease(evidence, expected);
  const extracted = join(
    await Deno.makeTempDir({ prefix: "actual-public-parent-" }),
    "public",
  );
  await publicArchive(
    join(path, "publications.tar.gz"),
    extracted,
    verified.published as any,
  );
  return { evidence, verified, extracted };
}
export async function verifyPackageArchives(path: string, manifest: any) {
  for (const pkg of manifest.packages) {
    actualMainFileMap(pkg.files, `package ${pkg.name}`);
    assert(
      await hash(join(path, "archives", `${pkg.name}.tar.gz`)) ===
        pkg.archiveSha256,
      `ACTUAL_MAIN: downloaded ${pkg.name} archive bytes differ`,
    );
  }
}
