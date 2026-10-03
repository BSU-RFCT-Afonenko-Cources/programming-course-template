// Real archive transport plus separately labelled PURE storage/ordering fixtures.
import { join } from "stdlib/path";
import {
  assert,
  command,
  hash,
  publicArchive,
} from "./actual-main-evidence.ts";
import { authenticatePublicBaseline } from "./actual-main-public-evidence.ts";
import { expected } from "./actual-main-receipt-guards.ts";
import { dirname, isAbsolute } from "stdlib/path";
import {
  armFailureDiagnostics,
  type FailureDiagnosticsRequest,
  readFailureDiagnostics,
  retainFailureDiagnostics,
} from "../../fixtures/probes/actual-main/state.ts";
import {
  ACTUAL_MAIN_INPUTS,
  ACTUAL_MAIN_MEMBERS,
} from "./actual-main-contract.ts";
const root = await Deno.makeTempDir({ prefix: "actual-main-transfer-guards-" });
const bytes = new TextEncoder().encode("completed public bytes\n");
const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
  .map((n) => n.toString(16).padStart(2, "0")).join("");
const maps = {
  student: { "index.html": sha, "deep/a.txt": sha },
  full: { "index.html": sha, "deep/a.txt": sha },
};
const pack = `import io,sys,tarfile
path,mode=sys.argv[1:]
entries=[('student/index.html','file'),('student/deep/a.txt','file'),('full/index.html','file'),('full/deep/a.txt','file')]
if mode=='symlink': entries += [('student/link','symlink')]
if mode=='hardlink': entries += [('student/link','hardlink')]
if mode=='traversal': entries += [('student/../escape','file')]
if mode=='private': entries += [('student/.project-publish/session.json','file')]
if mode=='extra': entries += [('owner-session.json','file')]
if mode=='missing': entries = entries[:2]
if mode=='duplicate': entries += [entries[0]]
if mode=='alias': entries += [('student//alias','file')]
with tarfile.open(path,'w:gz') as tf:
 for name,kind in entries:
  info=tarfile.TarInfo(name)
  if kind=='file':
   data=b'completed public bytes\\n'; info.size=len(data); tf.addfile(info,io.BytesIO(data))
  else:
   info.type=tarfile.SYMTYPE if kind=='symlink' else tarfile.LNKTYPE
   info.linkname='../full/index.html'; tf.addfile(info)
`;
let count = 0;
for (
  const mode of [
    "valid",
    "symlink",
    "hardlink",
    "traversal",
    "private",
    "extra",
    "missing",
    "duplicate",
    "alias",
    "map-drift",
    "archive-drift",
    "stale-destination",
  ]
) {
  const archive = join(root, `${mode}.tar.gz`),
    destination = join(root, `${mode}-public`);
  await command("python3", ["-c", pack, archive, mode], root);
  if (mode === "stale-destination") await Deno.mkdir(destination);
  const expected = {
    archiveSha256: mode === "archive-drift"
      ? "0".repeat(64)
      : await hash(archive),
    files: mode === "map-drift"
      ? { ...maps, full: { ...maps.full, "index.html": "1".repeat(64) } }
      : maps,
  };
  let error: unknown;
  try {
    await publicArchive(archive, destination, expected);
  } catch (e) {
    error = e;
  }
  assert(
    mode === "valid" ? error === undefined : error instanceof Error,
    `ACTUAL_MAIN_TRANSFER: ${mode} unexpected acceptance/refusal`,
  );
  count++;
}
for (
  const mode of [
    "native-log",
    "private-index",
    "missing-public-receipt",
    "symlink-receipt",
  ]
) {
  const artifact = join(root, `artifact-${mode}`);
  await Deno.mkdir(artifact);
  await Deno.writeTextFile(
    join(artifact, "publications.tar.gz"),
    "unused public archive\n",
  );
  if (mode === "symlink-receipt") {
    await Deno.symlink(
      join(artifact, "publications.tar.gz"),
      join(artifact, "public-baseline.json"),
    );
  } else if (mode !== "missing-public-receipt") {
    await Deno.writeTextFile(join(artifact, "public-baseline.json"), "{}\n");
  }
  if (mode === "native-log") {
    await Deno.writeTextFile(
      join(artifact, "actual-main-student.log"),
      "native proof must stay in aggregate evidence\n",
    );
  }
  if (mode === "private-index") {
    await Deno.writeTextFile(join(artifact, "owner-index.json"), "{}\n");
  }
  let error: unknown;
  try {
    await authenticatePublicBaseline(
      artifact,
      "student-release",
      "1.10.18",
      expected,
      {},
    );
  } catch (e) {
    error = e;
  }
  assert(
    error instanceof Error && /artifact|downstream/.test(error.message),
    `ACTUAL_MAIN_TRANSFER: ${mode} did not refuse before metadata/import`,
  );
  count++;
}
await Deno.remove(root, { recursive: true });
console.log(
  `PASS actual-main public archive transfer guards: ${count} checks; no private permission transport or native render`,
);

// PURE real-file storage and fixture ordering only; no Native engine or owner grant.
const retentionRoot = await Deno.makeTempDir({
  prefix: "actual-main-retention-pure-",
});
const retentionResults: {
  name: string;
  status: "pass" | "fail";
  error?: string;
}[] = [];
const digest = async (text: string, algorithm = "SHA-1") =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest(algorithm, new TextEncoder().encode(text)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0")).join("");
const regularExists = async (path: string) => {
  try {
    return (await Deno.lstat(path)).isFile;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
};
async function write(path: string, bytes: Uint8Array | string) {
  await Deno.mkdir(dirname(path), { recursive: true });
  await Deno.writeFile(
    path,
    typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes,
  );
}
async function pure(name: string, check: () => Promise<void>) {
  try {
    await check();
    retentionResults.push({ name, status: "pass" });
    console.log(`PASS PURE actual-main failure retention: ${name}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    retentionResults.push({ name, status: "fail", error });
    console.log(`FAIL PURE actual-main failure retention: ${name}: ${error}`);
  }
}
type Candidate = {
  sourcePath: string;
  scope: string;
  profile: string;
  sourceRelative: string;
};
async function inventory(sourceRoot: string, profile: "student" | "full") {
  const tuples = [{
    root: sourceRoot,
    scope: "root",
    profile,
    sourceRelative: "index.qmd",
  }];
  for (const selected of ["student", "full"] as const) {
    for (const member of ["book", "essay"] as const) {
      for (const source of ACTUAL_MAIN_INPUTS[member]) {
        tuples.push({
          root: join(sourceRoot, member),
          scope: member,
          profile: selected,
          sourceRelative: source.slice(member.length + 1),
        });
      }
    }
  }
  const candidates: Candidate[] = [];
  for (const tuple of tuples) {
    const h = await digest(tuple.sourceRelative),
      k = await digest(`${tuple.profile}:${tuple.sourceRelative}`);
    const paths: string[] = [];
    for (const phase of ["capture", "identity", "render"]) {
      paths.push(
        `.course-owner/native-listing/input/${phase}/${tuple.profile}/${h}.md`,
      );
      paths.push(
        `.course-owner/native-listing/witness/${phase}/${tuple.profile}/${h}.json`,
      );
      paths.push(`.course-owner/${phase}/${tuple.profile}/${h}.json`);
    }
    paths.push(`.course-owner/reader-input/${tuple.profile}/${h}.md`);
    paths.push(
      `.course-owner/capture-${k}.log`,
      `.course-owner/identity-${k}.log`,
    );
    for (const path of paths) {
      candidates.push({
        sourcePath: join(tuple.root, path),
        scope: tuple.scope,
        profile: tuple.profile,
        sourceRelative: tuple.sourceRelative,
      });
    }
  }
  assert(
    tuples.length === 19 && candidates.length === 228,
    "PURE independent finite oracle geometry",
  );
  return candidates;
}
let fixtureId = 0;
async function fixture(
  profile: "student" | "full" = "student",
  complete = false,
) {
  const base = join(retentionRoot, `case-${++fixtureId}`),
    project = join(base, "project"),
    attemptId = `00000000-0000-4000-8000-${
      String(fixtureId).padStart(12, "0")
    }`,
    sourceRoot = join(project, ".project-publish/builds", attemptId, "sources");
  await Deno.mkdir(sourceRoot, { recursive: true });
  const selectedHashes: Record<string, string> = {};
  for (
    const path of [
      "index.qmd",
      "_quarto.yml",
      "_quarto-publish-portal.yml",
      ...ACTUAL_MAIN_INPUTS.book,
      ...ACTUAL_MAIN_INPUTS.essay,
    ]
  ) {
    await write(
      join(sourceRoot, path),
      `authored synthetic reference ${path}\n`,
    );
    selectedHashes[path] = await hash(join(sourceRoot, path));
  }
  for (const member of ACTUAL_MAIN_MEMBERS) {
    await Deno.mkdir(join(sourceRoot, member.path), { recursive: true });
  }
  const candidates = await inventory(sourceRoot, profile),
    content = new Map<string, Uint8Array>();
  for (const [i, candidate] of candidates.entries()) {
    if (complete || [0, 1, 10, 12, 43, 90, 144, 226].includes(i)) {
      // Deliberately opaque, noncanonical bytes: never parse or reserialize witnesses.
      const bytes = new TextEncoder().encode(
        `  { "nativeShape" : [ {"opaque":${i}} ], "diagnostic":"${candidate.profile}" } \n\n`,
      );
      await write(candidate.sourcePath, bytes);
      content.set(candidate.sourcePath, bytes);
    }
  }
  for (
    const path of [
      ".course-owner/session.json",
      ".course-owner/preparation.json",
      ".course-owner/active.json",
      ".course-owner/finished.json",
      ".course-owner/index.json",
      ".course-owner/private-publication-addresses.json",
      ".course-owner/native-listing/unknown.json",
      ".project-publish/actual-main-adapter.json",
    ]
  ) {
    await write(
      join(sourceRoot, path),
      "PRIVATE AUTHORITY MUST NOT BE COPIED\n",
    );
  }
  const request: Omit<FailureDiagnosticsRequest, "protocol" | "sink"> = {
    label: profile === "student" ? "actual-main-student" : "actual-main-full",
    phase: `${profile}-release`,
    profile,
    root: project,
    forbiddenRoots: [project],
    members: ACTUAL_MAIN_MEMBERS.map((m) => ({ ...m })),
    sourceInputs: {
      student: {
        book: [...ACTUAL_MAIN_INPUTS.book],
        essay: [...ACTUAL_MAIN_INPUTS.essay],
      },
      full: {
        book: [...ACTUAL_MAIN_INPUTS.book],
        essay: [...ACTUAL_MAIN_INPUTS.essay],
      },
    },
    selectedHashes,
    run: {
      repository: "PURE/template",
      runId: "pure-file-fixture",
      runAttempt: "1",
    },
    anchors: {
      installManifestSha256: "1".repeat(64),
      inspectSha256: {
        "book-student": "2".repeat(64),
        "book-full": "3".repeat(64),
        "essay-student": "4".repeat(64),
        "essay-full": "5".repeat(64),
      },
      template: { commit: "6".repeat(40), tree: "7".repeat(40) },
      providers: ["publisher", "qrc", "core", "download"].map((name) => ({
        name,
        commit: "8".repeat(40),
        tree: "9".repeat(40),
      })),
      packages: [
        "course-core",
        "course-navigation",
        "course-presentation",
        "project-publish",
        "project-download",
        "reference-catalog",
      ].map((name) => ({
        name,
        archiveSha256: "a".repeat(64),
        fileMapSha256: "b".repeat(64),
      })),
      installationsSha256: "c".repeat(64),
      coreModuleSha256: { "owner-preflight/owner.ts": "d".repeat(64) },
    },
  };
  const ctx: any = {
    root: project,
    sourceRoot,
    attemptId,
    profiles: [profile],
    config: { project: { type: "website" } },
    members: ACTUAL_MAIN_MEMBERS.map((m) => ({
      ...m,
      path: join(sourceRoot, m.path),
    })),
    portal: {
      input: join(sourceRoot, "index.qmd"),
      output: join(project, ".project-publish/builds", attemptId, "portal"),
      renderProfiles: [profile, "publish-portal"],
      control: join(sourceRoot, "_quarto-publish-portal.yml"),
      controlHash: selectedHashes["_quarto-publish-portal.yml"],
      configHashes: {
        [join(sourceRoot, "_quarto.yml")]: selectedHashes["_quarto.yml"],
        [join(sourceRoot, "_quarto-publish-portal.yml")]:
          selectedHashes["_quarto-publish-portal.yml"],
      },
    },
    failure: {
      phase: "preparation",
      operation: "before-render",
      error: { name: "Error", message: "PURE original preparation refusal" },
    },
  };
  const directory = join(base, "diagnostics"),
    armed = await armFailureDiagnostics(request, directory);
  return {
    base,
    project,
    sourceRoot,
    attemptId,
    candidates,
    content,
    request,
    ctx,
    armed,
    directory,
  };
}
async function manifest(
  result: { manifestPath: string; manifestSha256: string },
) {
  assert(
    await hash(result.manifestPath) === result.manifestSha256,
    "PURE manifest SHA mismatch",
  );
  return JSON.parse(await Deno.readTextFile(result.manifestPath));
}
async function verifyRows(
  f: Awaited<ReturnType<typeof fixture>>,
  result: { manifestPath: string; manifestSha256: string },
) {
  const value = await manifest(result);
  assert(
    value.protocol === 1 && value.scope === "diagnostic-only" &&
      value.attemptId === f.attemptId &&
      value.requestSha256 === f.armed.requestSha256,
    "PURE closed diagnostic manifest anchors",
  );
  assert(
    value.label === f.request.label && value.phase === f.request.phase &&
      JSON.stringify(value.run) === JSON.stringify(f.request.run) &&
      JSON.stringify(value.anchors) === JSON.stringify(f.request.anchors) &&
      value.context.root === f.ctx.root &&
      value.context.sourceRoot === f.ctx.sourceRoot &&
      JSON.stringify(value.context.profiles) ===
        JSON.stringify(f.ctx.profiles) &&
      JSON.stringify(value.context.members) === JSON.stringify(f.ctx.members),
    "PURE request lineage and actual root/member/profile context remain exact",
  );
  assert(
    value.candidates.length === 228 && value.counts.total === 228,
    "PURE exact 228 candidate rows",
  );
  const rows = new Map(
    value.candidates.map((row: any) => [row.sourcePath, row]),
  );
  assert(rows.size === 228, "PURE unique finite candidate rows");
  for (const candidate of f.candidates) {
    const row: any = rows.get(candidate.sourcePath),
      bytes = f.content.get(candidate.sourcePath);
    assert(
      row && row.profile === candidate.profile &&
        row.sourceRelative === candidate.sourceRelative,
      "PURE exact candidate path/profile/source oracle",
    );
    if (bytes) {
      assert(
        row.status === "retained" && row.bytes === bytes.length,
        "PURE actual produced candidate must be retained",
      );
      const path = isAbsolute(row.destination)
        ? row.destination
        : join(dirname(result.manifestPath), row.destination);
      assert(
        !row.destination.split(/[\\/]/).some((p: string) => p.startsWith(".")),
        "PURE retained upload filenames must be nonhidden",
      );
      const copied = await Deno.readFile(path);
      assert(
        copied.length === bytes.length && copied.every((b, i) =>
          b === bytes[i]
        ) && await hash(path) === row.sha256,
        "PURE byte-exact opaque witness/input/observation/log retention",
      );
    } else {
      assert(
        row.status === "absent-at-notification" && row.bytes === undefined &&
          row.sha256 === undefined,
        "PURE absent candidate cannot become placeholder or proof",
      );
      if (row.destination) {
        assert(
          !await regularExists(
            join(dirname(result.manifestPath), row.destination),
          ),
          "PURE absent candidate planned destination cannot contain a placeholder",
        );
      }
    }
  }
  assert(
    value.counts.retained === f.content.size &&
      value.counts.absent === 228 - f.content.size && value.counts.errors === 0,
    "PURE finite count closure",
  );
  assert(
    !JSON.stringify(value).includes("PRIVATE AUTHORITY MUST NOT BE COPIED"),
    "PURE no forbidden neighbor contents",
  );
  return value;
}
async function refusedBeforeCopy(
  f: Awaited<ReturnType<typeof fixture>>,
  ctx = f.ctx,
  supplied = f.armed,
) {
  let error: unknown;
  try {
    await retainFailureDiagnostics(ctx, supplied);
  } catch (e) {
    error = e;
  }
  assert(error instanceof Error, "PURE invalid request/context must refuse");
  assert(
    !await regularExists(join(f.directory, f.attemptId, "manifest.json")),
    "PURE invalid request/context must refuse before manifest/copy",
  );
  try {
    await Deno.lstat(join(f.directory, f.attemptId));
    assert(
      false,
      "PURE invalid request/context must refuse before destination creation",
    );
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}
async function partial(
  f: Awaited<ReturnType<typeof fixture>>,
  hooks?: Parameters<typeof retainFailureDiagnostics>[2],
) {
  let error: unknown;
  try {
    await retainFailureDiagnostics(f.ctx, f.armed, hooks);
  } catch (e) {
    error = e;
  }
  assert(
    error instanceof Error && /retention incomplete/.test(error.message),
    "PURE per-candidate refusal must report secondary retention incomplete",
  );
  const manifestPath = join(f.directory, f.attemptId, "manifest.json"),
    result = { manifestPath, manifestSha256: await hash(manifestPath) };
  const value = await manifest(result);
  assert(
    value.candidates.length === 228 && value.counts.total === 228 &&
      value.counts.errors >= 1 && value.counts.retained >= 1,
    "PURE partial manifest preserves complete finite inventory and successful copies",
  );
  for (
    const row of value.candidates.filter((r: any) => r.status === "retained")
  ) {
    const path = isAbsolute(row.destination)
      ? row.destination
      : join(dirname(manifestPath), row.destination);
    assert(
      await hash(path) === row.sha256,
      "PURE partial retained files remain exact",
    );
  }
  return { value, result, error };
}
try {
  await pure("all 228 finite files and opaque witness bytes", async () => {
    const f = await fixture("student", true),
      result = await retainFailureDiagnostics(f.ctx, f.armed);
    await verifyRows(f, result);
    const files = await Array.fromAsync(
      Deno.readDir(join(f.directory, f.attemptId, "files")),
    );
    assert(
      files.length === 228 && files.every((entry) => entry.isFile),
      "PURE exclusive regular finite file copies only",
    );
  });
  await pure(
    "preparation without adapter state, sparse rows survive Source cleanup",
    async () => {
      const f = await fixture(),
        result = await retainFailureDiagnostics(f.ctx, f.armed);
      assert(
        !await regularExists(
          join(
            f.project,
            ".project-publish/builds",
            f.attemptId,
            "actual-main-adapter.json",
          ),
        ),
        "PURE no saved adapter state",
      );
      await Deno.remove(
        join(f.project, ".project-publish/builds", f.attemptId),
        { recursive: true },
      );
      await verifyRows(f, result);
      const inventory: any = await readFailureDiagnostics(f.armed);
      assert(
        inventory.status === "retained" && inventory.attempts.length === 1 &&
          inventory.attempts[0].attemptId === f.attemptId &&
          inventory.attempts[0].manifestSha256 === result.manifestSha256 &&
          inventory.attempts[0].retainedCount === f.content.size &&
          inventory.attempts[0].absentCount === 228 - f.content.size,
        "PURE separate diagnostic inventory survives Source cleanup",
      );
    },
  );
  for (const profile of ["student", "full"] as const) {
    for (const namespace of [undefined, "book", "essay"] as const) {
      await pure(
        `${profile} actual ${namespace || "portal"} failure geometry`,
        async () => {
          const f = await fixture(profile);
          f.ctx.failure = {
            phase: "render",
            operation: namespace ? "member-render" : "portal-render",
            error: {
              name: "Error",
              message: "PURE metadata-returned child refusal",
            },
          };
          f.ctx.format = "html";
          f.ctx.output = namespace
            ? join(f.sourceRoot, namespace, "_site")
            : f.ctx.portal.output;
          if (namespace) f.ctx.namespace = namespace;
          const value = await verifyRows(
            f,
            await retainFailureDiagnostics(f.ctx, f.armed),
          );
          assert(
            value.profile === profile &&
              value.context.namespace === namespace &&
              value.context.output === f.ctx.output &&
              value.context.failure.operation === f.ctx.failure.operation,
            "PURE actual namespace/output/failure facts",
          );
        },
      );
    }
  }
  await pure(
    "successful fixture attempt produces no failure manifest",
    async () => {
      const f = await fixture(),
        value: any = await readFailureDiagnostics(f.armed);
      assert(
        value.status === "not-notified" && value.attempts.length === 0 &&
          await regularExists(f.armed.requestPath),
        "PURE armed success has request only",
      );
      assert(
        !await regularExists(join(f.directory, f.attemptId, "manifest.json")),
        "PURE successful attempt no failure manifest",
      );
    },
  );
  await pure("request SHA mismatch before candidate access", async () => {
    const f = await fixture();
    await refusedBeforeCopy(f, f.ctx, {
      ...f.armed,
      requestSha256: "0".repeat(64),
    });
  });
  for (
    const mutation of [
      "root",
      "source-root",
      "attempt",
      "profiles",
      "member-path",
      "member-mount",
      "member-format",
      "missing-member",
      "portal-input",
      "portal-control",
      "portal-output",
    ] as const
  ) {
    await pure(`wrong actual ${mutation} geometry before copy`, async () => {
      const f = await fixture(), ctx = structuredClone(f.ctx);
      if (mutation === "root") ctx.root = join(f.base, "unregistered-project");
      if (mutation === "source-root") {
        ctx.sourceRoot = join(
          f.project,
          ".project-publish/builds",
          "wrong-attempt",
          "sources",
        );
      }
      if (mutation === "attempt") ctx.attemptId = "escape/attempt";
      if (mutation === "profiles") ctx.profiles = ["full"];
      if (mutation === "member-path") {
        ctx.members[0].path = join(f.sourceRoot, "essay");
      }
      if (mutation === "member-mount") ctx.members[0].mount = "wrong-book";
      if (mutation === "member-format") ctx.members[0].format = "pdf";
      if (mutation === "missing-member") ctx.members.pop();
      if (mutation === "portal-input") {
        ctx.portal.input = join(f.sourceRoot, "book/index.qmd");
      }
      if (mutation === "portal-control") {
        ctx.portal.control = join(f.sourceRoot, "_quarto.yml");
      }
      if (mutation === "portal-output") {
        ctx.portal.output = join(f.base, "outside-output");
      }
      await refusedBeforeCopy(f, ctx);
    });
  }
  await pure(
    "escaping registered source refuses even with matching request SHA",
    async () => {
      const f = await fixture(),
        request = JSON.parse(await Deno.readTextFile(f.armed.requestPath));
      request.sourceInputs.student.book[0] = "book/../escape.qmd";
      await Deno.writeTextFile(
        f.armed.requestPath,
        JSON.stringify(request) + "\n",
      );
      await refusedBeforeCopy(f, f.ctx, {
        ...f.armed,
        requestSha256: await hash(f.armed.requestPath),
      });
    },
  );
  for (const link of ["symlink", "hardlink"] as const) {
    await pure(`${link} request refuses before copy`, async () => {
      const f = await fixture(), actual = join(f.base, "request-linked.json");
      await Deno.rename(f.armed.requestPath, actual);
      if (link === "symlink") await Deno.symlink(actual, f.armed.requestPath);
      else await Deno.link(actual, f.armed.requestPath);
      await refusedBeforeCopy(f);
    });
  }
  await pure("diagnostic sink cannot alias original or Source", async () => {
    const f = await fixture();
    for (
      const sink of [
        join(f.project, "diagnostics"),
        join(f.sourceRoot, "diagnostics"),
      ]
    ) {
      let error: unknown;
      try {
        await armFailureDiagnostics(f.request, sink);
      } catch (e) {
        error = e;
      }
      assert(
        error instanceof Error,
        "PURE diagnostic sink must remain outside original and Source",
      );
    }
  });
  await pure("symlink sink ancestor refuses before copy", async () => {
    const f = await fixture(), actual = join(f.base, "actual-diagnostics");
    await Deno.rename(f.directory, actual);
    await Deno.symlink(actual, f.directory);
    await refusedBeforeCopy(f);
  });
  await pure("preexisting attempt destination cannot overwrite", async () => {
    const f = await fixture(),
      sentinel = join(f.directory, f.attemptId, "sentinel.txt");
    await write(sentinel, "existing evidence\n");
    let error: unknown;
    try {
      await retainFailureDiagnostics(f.ctx, f.armed);
    } catch (e) {
      error = e;
    }
    assert(
      error instanceof Error &&
        await Deno.readTextFile(sentinel) === "existing evidence\n",
      "PURE preexisting destination refused and unchanged",
    );
    assert(
      !await regularExists(join(f.directory, f.attemptId, "manifest.json")),
      "PURE stale attempt cannot gain a new manifest",
    );
  });
  await pure(
    "duplicate notification cannot overwrite first evidence",
    async () => {
      const f = await fixture(),
        first = await retainFailureDiagnostics(f.ctx, f.armed),
        before = await hash(first.manifestPath);
      let error: unknown;
      try {
        await retainFailureDiagnostics(f.ctx, f.armed);
      } catch (e) {
        error = e;
      }
      assert(
        error instanceof Error && await hash(first.manifestPath) === before,
        "PURE repeated attempt refuses and preserves original manifest",
      );
      await verifyRows(f, first);
    },
  );
  for (const kind of ["directory", "symlink", "hardlink"] as const) {
    await pure(
      `candidate ${kind} is secondary refusal with partial preservation`,
      async () => {
        const f = await fixture(), bad = f.candidates[0].sourcePath;
        await Deno.remove(bad);
        if (kind === "directory") await Deno.mkdir(bad);
        else {
          const outside = join(f.base, "outside-diagnostic-source.txt");
          await write(outside, "must not become copied diagnostic bytes\n");
          if (kind === "symlink") await Deno.symlink(outside, bad);
          else await Deno.link(outside, bad);
        }
        const { value } = await partial(f),
          row = value.candidates.find((r: any) => r.sourcePath === bad);
        assert(
          row?.status === "error" && row.bytes === undefined &&
            row.sha256 === undefined &&
            (row.destination === undefined || !await regularExists(
              join(f.directory, f.attemptId, row.destination),
            )),
          "PURE nonregular/linked source never produces an accepted copy",
        );
        const inventory: any = await readFailureDiagnostics(f.armed);
        assert(
          inventory.status === "retention-error" &&
            inventory.attempts.length === 1 &&
            inventory.attempts[0].errorCount >= 1,
          "PURE partial notification remains a diagnostic error in separate inventory",
        );
      },
    );
  }
  await pure(
    "real source mutation after read is unstable and preserves other rows",
    async () => {
      const f = await fixture();
      let changed: string | undefined;
      const { value } = await partial(f, {
        afterRead: async (candidate) => {
          if (!changed) {
            changed = candidate.sourcePath;
            await Deno.writeTextFile(
              candidate.sourcePath,
              "actual changed Source bytes\n",
            );
          }
        },
      });
      const row = value.candidates.find((r: any) => r.sourcePath === changed);
      assert(
        row?.status === "unstable" && row.bytes === undefined &&
          row.sha256 === undefined &&
          (row.destination === undefined ||
            !await regularExists(
              join(f.directory, f.attemptId, row.destination),
            )),
        "PURE changing candidate cannot be retained as stable proof",
      );
    },
  );
  await pure(
    "produced candidate disappearing after read is unstable, not absent",
    async () => {
      const f = await fixture();
      let removed: string | undefined, error: unknown;
      try {
        await retainFailureDiagnostics(f.ctx, f.armed, {
          afterRead: async (candidate) => {
            if (!removed) {
              removed = candidate.sourcePath;
              await Deno.remove(candidate.sourcePath);
            }
          },
        });
      } catch (e) {
        error = e;
      }
      const value = JSON.parse(
        await Deno.readTextFile(
          join(f.directory, f.attemptId, "manifest.json"),
        ),
      );
      const row = value.candidates.find((r: any) => r.sourcePath === removed);
      console.log(
        `PURE disappearance after actual read: ${row?.status}; retained=${value.counts.retained}; errors=${value.counts.errors}; secondaryError=${
          error instanceof Error
        }`,
      );
      assert(
        removed && error instanceof Error &&
          /retention incomplete/.test(error.message) &&
          row?.status === "unstable" && row.bytes === undefined &&
          row.sha256 === undefined &&
          row.destination === undefined && value.counts.errors >= 1 &&
          value.counts.retained >= 1,
        "PURE observed produced bytes disappearing during retention must be unstable secondary refusal with partial evidence",
      );
      const inventory: any = await readFailureDiagnostics(f.armed);
      assert(
        inventory.status === "retention-error",
        "PURE disappearance cannot become an accepted absent-only notification",
      );
    },
  );
  await pure(
    "exclusive destination collision preserves sentinel and partial manifest",
    async () => {
      const f = await fixture();
      let collision: string | undefined;
      const { value } = await partial(f, {
        afterRead: async (candidate) => {
          if (!collision) {
            collision = candidate.destinationPath;
            await write(collision, "preexisting collision\n");
          }
        },
      });
      assert(
        collision &&
          await Deno.readTextFile(collision) === "preexisting collision\n" &&
          value.candidates.some((r: any) => r.status === "error"),
        "PURE exclusive write cannot replace collision bytes",
      );
    },
  );
  await pure(
    "selected Source hash drift is recorded without suppressing copies",
    async () => {
      const f = await fixture(), path = "book/index.qmd";
      await Deno.writeTextFile(
        join(f.sourceRoot, path),
        "actual selected Source drift\n",
      );
      const value = await verifyRows(
          f,
          await retainFailureDiagnostics(f.ctx, f.armed),
        ),
        row = value.selectedHashes.find((r: any) => r.path === path);
      assert(
        row && row.expected === f.request.selectedHashes[path] &&
          row.observed === await hash(join(f.sourceRoot, path)) &&
          row.expected !== row.observed,
        "PURE selected Source expected/observed drift retained",
      );
    },
  );
  await pure("publication finalize retains actual stage facts", async () => {
    const f = await fixture();
    f.ctx.failure = {
      phase: "publication",
      operation: "finalize",
      error: { name: "Error", message: "PURE actual finalize refusal" },
    };
    f.ctx.stage = join(f.project, ".project-publish", `publish-${f.attemptId}`);
    await Deno.mkdir(f.ctx.stage, { recursive: true });
    const value = await verifyRows(
      f,
      await retainFailureDiagnostics(f.ctx, f.armed),
    );
    assert(
      value.context.stage === f.ctx.stage &&
        value.context.failure.operation === "finalize",
      "PURE actual stage context retained",
    );
  });
  await pure(
    "deferred PURE retention resolves before simulated cleanup",
    async () => {
      const f = await fixture(),
        primary = new Error("PURE primary child refusal");
      let release!: () => void,
        entered!: () => void,
        first = true,
        cleaned = false;
      const barrier = new Promise<void>((resolve) => {
          release = resolve;
        }),
        inside = new Promise<void>((resolve) => {
          entered = resolve;
        });
      let result:
        | Awaited<ReturnType<typeof retainFailureDiagnostics>>
        | undefined;
      const attempt = (async () => {
        try {
          result = await retainFailureDiagnostics(f.ctx, f.armed, {
            afterRead: async () => {
              if (first) {
                first = false;
                entered();
                await barrier;
              }
            },
          });
        } finally {
          await Deno.remove(
            join(f.project, ".project-publish/builds", f.attemptId),
            { recursive: true },
          );
          cleaned = true;
        }
        throw primary;
      })();
      const settled = attempt.then(() => "settled", () => "settled"),
        phase = await Promise.race([inside.then(() => "entered"), settled]);
      try {
        assert(
          phase === "entered" && !cleaned &&
            await regularExists(f.candidates[0].sourcePath),
          "PURE awaited retention holds cleanup while actual Source exists",
        );
      } finally {
        release();
      }
      let error: unknown;
      try {
        await attempt;
      } catch (e) {
        error = e;
      }
      assert(
        error === primary && cleaned && result,
        "PURE original refusal propagates after retention and cleanup",
      );
      await verifyRows(f, result);
    },
  );
  await pure(
    "PURE caller keeps primary refusal with retention and cleanup errors",
    async () => {
      const f = await fixture(),
        primary = new Error("PURE primary refusal"),
        cleanupError = new Error("PURE cleanup refusal after Source removal"),
        bad = f.candidates[0].sourcePath;
      await Deno.remove(bad);
      await Deno.mkdir(bad);
      const errors: unknown[] = [primary];
      try {
        await retainFailureDiagnostics(f.ctx, f.armed);
      } catch (e) {
        errors.push(e);
      }
      await Deno.remove(
        join(f.project, ".project-publish/builds", f.attemptId),
        { recursive: true },
      );
      errors.push(cleanupError);
      // This fixture models the accepted provider's ordering, not its implementation.
      const failure = new AggregateError(errors, primary.message, {
        cause: primary,
      });
      assert(
        failure.cause === primary && failure.errors[0] === primary &&
          failure.errors.length === 3 && failure.errors[2] === cleanupError,
        "PURE fixture primary-first/cause and cleanup remain present",
      );
      const value = JSON.parse(
        await Deno.readTextFile(
          join(f.directory, f.attemptId, "manifest.json"),
        ),
      );
      assert(
        value.counts.errors >= 1 && value.counts.retained >= 1,
        "PURE partial evidence survives cleanup with secondary errors",
      );
    },
  );
} finally {
  const output = Deno.env.get("ACTUAL_MAIN_RETENTION_PURE_OUTPUT");
  if (output) {
    await Deno.mkdir(output, { recursive: true });
    await Deno.writeTextFile(
      join(output, "retention-pure-result.json"),
      JSON.stringify(
        {
          protocol: 1,
          scope: "PURE real-file storage and fixture ordering",
          nativeExecuted: false,
          publicTransferChecks: count,
          cases: retentionResults,
          passed: retentionResults.filter((r) => r.status === "pass").length,
          failed: retentionResults.filter((r) => r.status === "fail").length,
        },
        null,
        2,
      ) + "\n",
      { createNew: true },
    );
  }
  await Deno.remove(retentionRoot, { recursive: true });
}
console.log(
  `PURE actual-main failure retention: ${
    retentionResults.filter((r) => r.status === "pass").length
  }/${retentionResults.length} passed; no Native acceptance`,
);
assert(
  retentionResults.every((r) => r.status === "pass"),
  "PURE actual-main failure retention checks failed",
);
