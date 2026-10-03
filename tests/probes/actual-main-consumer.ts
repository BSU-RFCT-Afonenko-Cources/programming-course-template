// Original course only: current source/install/native proof; public bytes seed retention.
import { copy } from "stdlib/fs";
import { dirname, fromFileUrl, join, relative, resolve } from "stdlib/path";
import { parse } from "stdlib/yaml";
import {
  ACTUAL_MAIN_INPUTS,
  ACTUAL_MAIN_INSTALLATIONS,
  ACTUAL_MAIN_MEMBERS,
  verifyActualMainRelease,
} from "./actual-main-contract.ts";
import {
  argumentsFor,
  assert,
  checkoutSource,
  command,
  currentRun,
  exact,
  exists,
  expectedCheckout,
  hash,
  readJson,
  settings,
  treeHashes,
} from "./actual-main-evidence.ts";
import {
  assertMainRunnerPhase,
  publicBaseline,
  verifyLateFromPublic,
  verifySingleRelease,
} from "./actual-main-split-contract.ts";
import { authenticatePublicBaseline } from "./actual-main-public-evidence.ts";
import {
  armFailureDiagnostics,
  diagnosticDigest,
  writeFailureDiagnosticsObservation,
} from "../../fixtures/probes/actual-main/state.ts";
const repo = dirname(dirname(dirname(fromFileUrl(import.meta.url))));
const args = argumentsFor(Deno.args, [
  "--phase",
  "--baseline",
  "--publisher",
  "--qrc",
  "--core",
  "--download",
  "--output",
]);
const phase = assertMainRunnerPhase(args["--phase"]);
for (
  const key of ["--publisher", "--qrc", "--core", "--download", "--output"]
) assert(args[key], `ACTUAL_MAIN: ${key} required`);
assert(
  ["full-release", "late"].includes(phase)
    ? !!args["--baseline"]
    : !args["--baseline"],
  "ACTUAL_MAIN: public baseline is required only for fresh full-release/late",
);
const evidence = resolve(args["--output"]);
if (await exists(evidence)) {
  let populated = false;
  for await (const _entry of Deno.readDir(evidence)) {
    populated = true;
    break;
  }
  assert(!populated, "ACTUAL_MAIN: evidence must be fresh; no stale reuse");
}
// Reject the old home-book root before installing, preparing or invoking native render.
const authored: any = parse(await Deno.readTextFile(join(repo, "_quarto.yml"))),
  config = await settings(repo);
assert(
  authored["project-publish"]?.portal === "index.qmd" &&
    !authored["project-publish"].home && await exists(join(repo, "index.qmd")),
  "ACTUAL_MAIN: MAIN_NOT_CONVERTED managed root required",
);
const integrations: string[] = authored["project-publish"].integrations;
assert(
  Array.isArray(integrations) &&
    integrations.includes(config.adapterSlots.prepare) &&
    integrations.includes(config.adapterSlots.finish) &&
    integrations.includes(config.adapterSlots.verify),
  "ACTUAL_MAIN: MAIN_NOT_CONVERTED authored adapter slots required",
);
const qrc = integrations.findIndex((p) =>
  p.endsWith("reference-catalog/entrypoints/publication.ts")
);
assert(
  qrc >= 0 && integrations.indexOf(config.adapterSlots.prepare) < qrc &&
    qrc < integrations.indexOf(config.adapterSlots.finish) &&
    integrations.indexOf(config.adapterSlots.finish) <
      integrations.indexOf(config.adapterSlots.verify),
  "ACTUAL_MAIN: configured QRC/child/navigation/current order required",
);
exact(config.adapterSlots, {
  prepare: "_publication/prepare.ts",
  finish: "_publication/finish.ts",
  verify: "_publication/verify.ts",
  state: "_publication/state.ts",
}, "frozen adapter slot paths");
for (const path of Object.values(config.adapterSlots) as string[]) {
  assert(
    await exists(join(repo, path)),
    `ACTUAL_MAIN: MAIN_NOT_CONVERTED authored slot ${path} absent`,
  );
}
if (phase === "late") {
  assert(
    config.lateRefusal,
    "ACTUAL_MAIN: precise documented late refusal not frozen",
  );
}
await Deno.mkdir(evidence, { recursive: true });
const expected = await expectedCheckout(repo),
  templateSource = await checkoutSource(repo),
  run = currentRun();
assert(
  !templateSource.dirty,
  "ACTUAL_MAIN: clean exact Template checkpoint required before install/native work",
);
const version =
  (await command(Deno.env.get("QUARTO") || "quarto", ["--version"], repo))
    .trim();
assert(
  ["1.10.18", "1.11.5"].includes(version),
  "ACTUAL_MAIN: required native channel",
);
const root = await Deno.makeTempDir({ prefix: "actual-main-source-" });
for (const path of Object.keys(templateSource.files)) {
  await Deno.mkdir(dirname(join(root, path)), { recursive: true });
  await Deno.copyFile(join(repo, path), join(root, path));
}
const authorConfigs = async () =>
  Object.fromEntries(
    await Promise.all(
      Object.keys(templateSource.files).filter((p) =>
        /(^|\/)\_quarto[^/]*\.ya?ml$/.test(p)
      ).map(async (p) => [p, await hash(join(root, p))]),
    ),
  );
const configsBeforeSetup = await authorConfigs();
const authorInputs = async () =>
  Object.fromEntries(
    await Promise.all(
      ["index.qmd", ...ACTUAL_MAIN_INPUTS.book, ...ACTUAL_MAIN_INPUTS.essay]
        .map(async (p) => [p, await hash(join(root, p))]),
    ),
  );
exact(
  await authorInputs(),
  Object.fromEntries(
    ["index.qmd", ...ACTUAL_MAIN_INPUTS.book, ...ACTUAL_MAIN_INPUTS.essay].map((
      p,
    ) => [p, templateSource.files[p]]),
  ),
  "fresh original authored root/chapter byte set",
);
const scaffoldNames = ["prepare", "finish", "verify", "state", "verification"];
const scaffolding = [];
for (const name of scaffoldNames) {
  const source = `fixtures/probes/actual-main/${name}.ts`,
    target = `_publication/${name}.ts`,
    sha256 = await hash(join(repo, source));
  await Deno.copyFile(join(repo, source), join(root, target));
  assert(
    await hash(join(root, target)) === sha256,
    "ACTUAL_MAIN: exact test adapter payload mismatch",
  );
  scaffolding.push({ source, target, sha256 });
}
const providers = Object.fromEntries(
  ["publisher", "qrc", "core", "download"].map((
    name,
  ) => [name, resolve(args[`--${name}`])]),
);
const companionSources = [];
for (const [name, path] of Object.entries(providers)) {
  const source = {
    name,
    commit: (await command("git", ["rev-parse", "HEAD"], path)).trim(),
    tree: (await command("git", ["rev-parse", "HEAD^{tree}"], path)).trim(),
    dirty: !!(await command("git", ["status", "--porcelain"], path)).trim(),
  };
  exact(
    { commit: source.commit, tree: source.tree },
    expected.providers[name],
    `actual exact provider ref ${name}`,
  );
  assert(!source.dirty, `ACTUAL_MAIN: dirty provider ${name}`);
  companionSources.push(source);
}
const packageProviders: Record<string, string> = {
  "project-publish": "publisher",
  "reference-catalog": "qrc",
  "course-core": "core",
  "course-presentation": "core",
  "course-navigation": "core",
  "project-download": "download",
};
const packages: any[] = [], installations: any[] = [];
for (const [name, provider] of Object.entries(packageProviders)) {
  const pack = await Deno.makeTempDir({ prefix: "actual-main-package-" }),
    source = join(providers[provider], "_extensions", name),
    packageDir = join(pack, "_extensions", name);
  await copy(source, packageDir);
  const files = await treeHashes(packageDir),
    archive = join(evidence, "archives", `${name}.tar.gz`);
  await Deno.mkdir(dirname(archive), { recursive: true });
  await command("tar", ["-czf", archive, "-C", pack, "."], pack);
  const install = await Deno.makeTempDir({ prefix: "actual-main-quarto-add-" });
  await command(
    Deno.env.get("QUARTO") || "quarto",
    ["add", archive, "--no-prompt"],
    install,
    { QUARTO_RUN_NO_NETWORK: "true" },
  );
  const installed = join(install, "_extensions", name);
  exact(
    await treeHashes(installed),
    files,
    `actual quarto add ${name} full file-set/SHA`,
  );
  installations.push({ name, scope: "external", method: "quarto-add", files });
  for (
    const item of ACTUAL_MAIN_INSTALLATIONS.filter((p) =>
      p.name === name && p.method === "installed-copy"
    )
  ) {
    const destination = join(
      root,
      item.scope === "root" ? "" : item.scope,
      "_extensions/Afonenko-Course-Tools",
      name,
    );
    // Product copies must already be the intended complete payload. Reinstall identical bytes.
    exact(
      await treeHashes(destination),
      files,
      `authored exact product copy ${name}/${item.scope}`,
    );
    await Deno.remove(destination, { recursive: true });
    await copy(installed, destination);
    exact(
      await treeHashes(destination),
      files,
      `fresh actual installed copy ${name}/${item.scope}`,
    );
    installations.push({ ...item, files });
  }
  packages.push({ name, archiveSha256: await hash(archive), files });
}
const sourceInputs: any = {};
for (const profile of ["student", "full"]) {
  sourceInputs[profile] = {};
  for (const member of ["book", "essay"]) {
    const result = JSON.parse(
      await command(Deno.env.get("QUARTO") || "quarto", [
        "inspect",
        join(root, member),
        "--profile",
        profile,
      ], root),
    );
    const inputs = result.files.input.map((p: string) => relative(root, p));
    exact(
      inputs,
      ACTUAL_MAIN_INPUTS[member as "book" | "essay"],
      `original ${member}/${profile} native input set`,
    );
    assert(
      result.engines.every((engine: string) => engine === "markdown") &&
        Object.values(result.fileInformation).every((p: any) =>
          !(p.codeCells?.length)
        ),
      "ACTUAL_MAIN: changed original native engine coverage",
    );
    sourceInputs[profile][member] = inputs;
    await Deno.writeTextFile(
      join(evidence, `${member}-${profile}-inspect.json`),
      JSON.stringify(result, null, 2),
    );
  }
}
const members = Object.entries(authored["project-publish"].projects).map((
  [namespace, p]: any,
) => ({
  namespace,
  path: p.path,
  mount: p.mount || namespace,
  format: p.format,
}));
exact(
  members,
  ACTUAL_MAIN_MEMBERS,
  "authored original five boundary/mount/format set",
);
exact(
  await authorConfigs(),
  configsBeforeSetup,
  "scaffolding/install changed authored root/profile/chapter configs",
);
const manifest = {
  protocol: 1,
  phase,
  templateSource,
  run,
  versions: {
    quarto: version,
    cue: (await command("cue", ["version"], root)).split("\n")[0],
  },
  companionSources,
  packages,
  installations,
  sourceInputs,
  members,
  scaffolding,
};
await Deno.writeTextFile(
  join(evidence, "install-manifest.json"),
  JSON.stringify(manifest, null, 2),
);
// Durable passive-monitor location; native/public baselines never import this file.
const sourceLocation = {
  scope: "fresh original-course passive evidence location",
  sourceRoot: root,
  templateCommit: templateSource.commit,
  templateTree: templateSource.tree,
  phase,
  version,
  companionSources,
  createdAt: new Date().toISOString(),
};
await Deno.writeTextFile(
  join(evidence, "source-root.json"),
  JSON.stringify(sourceLocation, null, 2),
);
let baseline: any, baselinePublic: any;
if (phase === "late" || phase === "full-release") {
  const parent = await authenticatePublicBaseline(
    resolve(args["--baseline"]),
    phase === "full-release" ? "student-release" : "full-release",
    version,
    expected,
    Object.fromEntries(packages.map((p) => [p.name, p.files])),
  );
  baselinePublic = parent;
  for (const profile of ["student", "full"]) {
    await copy(join(parent.extracted, profile), join(root, `_site-${profile}`));
  }
  baseline = {
    artifactName: `actual-main-public-${version}-${
      phase === "full-release" ? "student-release" : "full-release"
    }`,
    publicReceiptSha256: parent.sha256,
    publicationArchiveSha256: parent.value.published.archiveSha256,
    files: parent.value.published.files,
    transferred: ["student-publication", "full-publication"],
    privateStateTransferred: false,
  };
} else {for (const profile of ["student", "full"]) {
    await Deno.mkdir(join(root, `_site-${profile}/seed/deep`), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(root, `_site-${profile}/index.html`),
      `${profile} populated previous publication\n`,
    );
    await Deno.writeTextFile(
      join(root, `_site-${profile}/seed/deep/asset.txt`),
      `${profile} previous nested asset\n`,
    );
  }}
const outputMaps = async () => ({
  student: await treeHashes(join(root, "_site-student")),
  full: await treeHashes(join(root, "_site-full")),
});
const observations: any[] = [];
for (
  const label of phase === "releases"
    ? ["actual-main-student", "actual-main-full"]
    : phase === "student-release"
    ? ["actual-main-student"]
    : phase === "full-release"
    ? ["actual-main-full"]
    : ["actual-main-late-current-address"]
) {
  const profile = label === "actual-main-full" ? "full" : "student",
    previous = await outputMaps(),
    before = await authorConfigs(),
    inputsBefore = await authorInputs(),
    publicEvents: any[] = [];
  const watcher = Deno.watchFs([
    join(root, "_site-student"),
    join(root, "_site-full"),
  ], { recursive: true });
  const watching = (async () => {
    try {
      for await (const event of watcher) publicEvents.push(event);
    } catch (e) {
      if (!(e instanceof Deno.errors.BadResource)) throw e;
    }
  })();
  const observerPath = join(evidence, `${label}-native.jsonl`),
    started = performance.now();
  await Deno.writeTextFile(
    join(evidence, "source-root.json"),
    JSON.stringify(
      {
        ...sourceLocation,
        nativeStartedAt: new Date().toISOString(),
        label,
        profile,
        observerPath,
      },
      null,
      2,
    ),
  );
  const diagnosticRequest = await armFailureDiagnostics({
    label,
    phase,
    profile,
    root,
    forbiddenRoots: [
      root,
      ...(baselinePublic
        ? [resolve(args["--baseline"]), baselinePublic.extracted]
        : []),
    ],
    members,
    sourceInputs,
    selectedHashes: { ...before, ...inputsBefore },
    run,
    anchors: {
      installManifestSha256: await hash(
        join(evidence, "install-manifest.json"),
      ),
      inspectSha256: Object.fromEntries(
        await Promise.all(
          ["book-student", "book-full", "essay-student", "essay-full"].map(
            async (name) => [
              name,
              await hash(join(evidence, `${name}-inspect.json`)),
            ],
          ),
        ),
      ),
      template: { commit: templateSource.commit, tree: templateSource.tree },
      providers: companionSources.map(({ name, commit, tree }) => ({
        name,
        commit,
        tree,
      })),
      packages: await Promise.all(packages.map(async (p) => ({
        name: p.name,
        archiveSha256: p.archiveSha256,
        fileMapSha256: await diagnosticDigest(
          new TextEncoder().encode(JSON.stringify(p.files)),
        ),
      }))),
      installationsSha256: await diagnosticDigest(
        new TextEncoder().encode(JSON.stringify(installations)),
      ),
      coreModuleSha256: Object.fromEntries(
        Object.entries(
          packages.find((p) => p.name === "course-core").files,
        ).filter(([path]) =>
          [
            "owner-preflight/owner.ts",
            "owner-preflight/filter.lua",
            "owner-preflight/native-listing.lua",
            "owner-preflight/native-listing-evidence.ts",
            "owner-preflight/native-listing-provider.ts",
            "owner-preflight/native-listing-providers.json",
          ].includes(path)
        ),
      ) as Record<string, string>,
    },
  }, join(evidence, "failure-diagnostics", label));
  const result = await new Deno.Command(Deno.env.get("QUARTO") || "quarto", {
    args: [
      "run",
      "_extensions/Afonenko-Course-Tools/project-publish/entrypoints/render.ts",
      "--profile",
      profile,
    ],
    cwd: root,
    env: {
      QUARTO_RUN_NO_NETWORK: "true",
      XDG_CACHE_HOME: join(evidence, `${label}-cache`),
      QUARTO_PROJECT_OUTPUT_DIR: "",
      ACTUAL_MAIN_MODE: label,
      ACTUAL_MAIN_OBSERVER_PATH: observerPath,
      ACTUAL_MAIN_NATIVE_DIAGNOSTICS_REQUEST: diagnosticRequest.requestPath,
      ACTUAL_MAIN_NATIVE_DIAGNOSTICS_REQUEST_SHA256:
        diagnosticRequest.requestSha256,
    },
    stdout: "piped",
    stderr: "piped",
  }).output();
  watcher.close();
  await watching;
  const log = new TextDecoder().decode(result.stdout) +
    new TextDecoder().decode(result.stderr);
  await Deno.writeTextFile(join(evidence, `${label}.log`), log);
  // Diagnostics remain outside the authenticated publication observation/receipt.
  try {
    await writeFailureDiagnosticsObservation(diagnosticRequest, result.code);
  } catch (error) {
    await Deno.writeTextFile(
      join(evidence, `${label}-failure-diagnostics-error.json`),
      JSON.stringify(
        {
          label,
          phase,
          profile,
          childExit: result.code,
          status: "inventory-error",
          error: error instanceof Error
            ? error.message
            : "diagnostic inventory failure",
        },
        null,
        2,
      ),
    );
  }
  const events = await exists(observerPath)
    ? (await Deno.readTextFile(observerPath)).trim().split("\n").filter(Boolean)
      .map((s) => JSON.parse(s))
    : [];
  const finished = events.find((e) => e.stage === "child-owners-finished"),
    mutated = events.find((e) => e.stage === "pdf-address-mutated"),
    after = await authorConfigs(),
    inputsAfter = await authorInputs(),
    current = await outputMaps();
  const observation = {
    label,
    profile,
    attemptId: events[0]?.attemptId,
    exit: result.code,
    milliseconds: Math.round(performance.now() - started),
    previous,
    current,
    authorConfigs: { before, after },
    authorInputs: { before: inputsBefore, after: inputsAfter },
    publicEvents,
    nativeMembers: ACTUAL_MAIN_MEMBERS.map((member) =>
      events.find((e) =>
        e.stage === "native-member" && e.namespace === member.namespace
      )
    ).map((e) =>
      e
        ? {
          namespace: e.namespace,
          path: e.path,
          mount: e.mount,
          format: e.format,
          output: e.output,
        }
        : null
    ),
    ownerInputs: ACTUAL_MAIN_INPUTS,
    pipeline: events.filter((e) =>
      [
        "qrc-finished",
        "child-owners-finished",
        "pdf-address-mutated",
        "publication-verified",
      ].includes(e.stage)
    ).map((e) => e.stage),
    ownerIndexes: finished?.ownerIndexes,
    pdf: finished?.pdf,
    checked: {
      ...finished?.checked,
      sourceConfigPreserved: JSON.stringify(before) === JSON.stringify(after) &&
        JSON.stringify(inputsBefore) === JSON.stringify(inputsAfter),
    },
    ...(phase === "late"
      ? {
        mutation: mutated?.mutation,
        refusal: {
          code: config.lateRefusal,
          observed: !!config.lateRefusal && log.includes(config.lateRefusal),
        },
      }
      : {}),
  };
  observations.push(observation);
  await Deno.writeTextFile(
    join(evidence, `${label}-observation.json`),
    JSON.stringify(observation, null, 2),
  );
  await Deno.writeTextFile(
    join(evidence, "partial-results.json"),
    JSON.stringify(
      {
        phase,
        labels: observations.map((o) => o.label),
        observations,
      },
      null,
      2,
    ),
  );
  exact(before, after, "author configs changed during native attempt");
  exact(
    inputsBefore,
    inputsAfter,
    "author root/chapter bytes changed during native attempt",
  );
  if (phase === "late") {
    assert(
      result.code !== 0 && config.lateRefusal &&
        log.includes(config.lateRefusal),
      "ACTUAL_MAIN: specific documented current-address refusal was not observed",
    );
    exact(
      current,
      previous,
      "late failure changed genuine previous public trees",
    );
    assert(
      publicEvents.length === 0,
      "ACTUAL_MAIN: late temporary public events",
    );
  } else {
    assert(
      result.success && events.at(-1)?.stage === "publication-verified",
      `ACTUAL_MAIN: genuine native release failed ${label}`,
    );
    exact(
      current[profile === "student" ? "full" : "student"],
      previous[profile === "student" ? "full" : "student"],
      "positive release changed opposite profile",
    );
  }
}
const labels = observations.map((o) => o.label),
  receipt: any = {
    protocol: 1,
    status: "success",
    phase,
    version,
    templateSource,
    run,
    labels,
    caseCount: labels.length,
    caseMultiplicity: Object.fromEntries(labels.map((l) => [l, 1])),
    networkImportsDisabled: true,
    resumedFrom: null,
  };
if (phase !== "late") {
  const publicRoot = await Deno.makeTempDir({
    prefix: "actual-main-public-export-",
  });
  for (const profile of ["student", "full"]) {
    await copy(join(root, `_site-${profile}`), join(publicRoot, profile));
  }
  const archive = join(evidence, "publications.tar.gz");
  await command(
    "tar",
    ["-czf", archive, "-C", publicRoot, "student", "full"],
    publicRoot,
  );
  receipt.publication = {
    archiveSha256: await hash(archive),
    files: await outputMaps(),
  };
} else receipt.expectedFailure = config.lateRefusal;
if (baseline) receipt.baseline = baseline;
const resultPath = join(evidence, "phase-results.json");
const raw = JSON.stringify(receipt, null, 2),
  digest = [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)),
    ),
  ].map((n) => n.toString(16).padStart(2, "0")).join("");
const current = {
  version,
  phase,
  receipt,
  manifest,
  observations,
  ...(phase !== "late" ? { publication: receipt.publication } : {}),
  receiptSha256: digest,
  manifestSha256: await hash(join(evidence, "install-manifest.json")),
};
if (phase === "releases") verifyActualMainRelease(current, expected);
else if (phase === "late") {
  verifyLateFromPublic(
    current,
    baselinePublic.value,
    expected,
    baselinePublic.sha256,
  );
} else {
  verifySingleRelease(current, expected);
  const portable = publicBaseline(
    current,
    expected,
    phase === "full-release"
      ? { value: baselinePublic.value, sha256: baselinePublic.sha256 }
      : undefined,
  );
  await Deno.writeTextFile(
    join(evidence, "public-baseline.json"),
    JSON.stringify(portable, null, 2),
  );
}
await Deno.writeTextFile(resultPath, JSON.stringify(receipt, null, 2));
console.log(
  `PASS original-course ${phase}:${labels.length} required native labels; complete gate additionally requires all three CI phases on both channels; distinct from fixture25`,
);
