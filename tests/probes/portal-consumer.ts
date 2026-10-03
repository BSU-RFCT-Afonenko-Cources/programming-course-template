// Exact installed packages and real managed native children; no fixture visibility policy.
import { copy } from "stdlib/fs";
import { dirname, fromFileUrl, join, relative, resolve } from "stdlib/path";
import {
  assert,
  command,
  exists,
  files,
  hash,
  treeHashes,
  write,
} from "../../fixtures/probes/portal/common.ts";
import { fixture } from "../../fixtures/probes/portal/fixture.ts";
import {
  parsePortalPhase,
  PORTAL_RUNNER_SOURCE_FILES,
  requiredCases,
  verifyPhaseResults,
} from "./portal-contract.ts";
const repo = dirname(dirname(dirname(fromFileUrl(import.meta.url))));
const arg = (name: string) => {
  const i = Deno.args.indexOf(name);
  return i < 0 ? undefined : Deno.args[i + 1];
};
const allowed = [
  "--publisher",
  "--qrc",
  "--core",
  "--download",
  "--output",
  "--phase",
];
for (let i = 0; i < Deno.args.length; i += 2) {
  assert(
    allowed.includes(Deno.args[i]) && Deno.args[i + 1] &&
      !Deno.args[i + 1].startsWith("--"),
    "unsupported or incomplete argument",
  );
  assert(Deno.args.indexOf(Deno.args[i]) === i, "repeated argument");
}
const phase = parsePortalPhase(arg("--phase"));
const templateSource = {
  commit: (await command("git", ["rev-parse", "HEAD"], repo)).trim(),
  tree: (await command("git", ["rev-parse", "HEAD^{tree}"], repo)).trim(),
  dirty: !!(await command("git", ["status", "--porcelain"], repo)).trim(),
  files: Object.fromEntries(
    await Promise.all([
      ...await files(join(repo, "fixtures/probes/portal")),
      ...PORTAL_RUNNER_SOURCE_FILES.map((name) =>
        join(repo, "tests/probes", name)
      ),
    ].map(async (path) => [relative(repo, path), await hash(path)])),
  ),
};
const providers = Object.fromEntries(
  ["publisher", "qrc", "core", "download"].map((name) => {
    const path = arg(`--${name}`);
    assert(path, `--${name} required`);
    return [name, resolve(path)];
  }),
);
const quarto = Deno.env.get("QUARTO") || "quarto";
const evidence = resolve(
  arg("--output") || await Deno.makeTempDir({ prefix: "portal-evidence-" }),
);
if (await exists(evidence)) {
  let populated = false;
  for await (const _entry of Deno.readDir(evidence)) {
    populated = true;
    break;
  }
  assert(
    !populated,
    "evidence directory must be fresh; no stale receipt reuse",
  );
}
await Deno.mkdir(evidence, { recursive: true });
const preparation = await Deno.makeTempDir({ prefix: "portal-archives-" });
const packageSources = [
  ["project-publish", join(providers.publisher, "_extensions/project-publish")],
  ["reference-catalog", join(providers.qrc, "_extensions/reference-catalog")],
  ["course-core", join(providers.core, "_extensions/course-core")],
  [
    "course-presentation",
    join(providers.core, "_extensions/course-presentation"),
  ],
  ["course-navigation", join(providers.core, "_extensions/course-navigation")],
  [
    "project-download",
    join(providers.download, "_extensions/project-download"),
  ],
];
const packages: {
  name: string;
  source: string;
  archive: string;
  archiveSha256: string;
  files: Record<string, string>;
}[] = [];
for (const [name, source] of packageSources) {
  const root = join(preparation, name),
    archive = join(evidence, "archives", `${name}.tar.gz`),
    snapshot = join(root, "_extensions", name);
  await copy(source, snapshot);
  await Deno.mkdir(dirname(archive), { recursive: true });
  await command("tar", ["-czf", archive, "-C", root, "."], preparation);
  packages.push({
    name,
    source,
    archive,
    archiveSha256: await hash(archive),
    files: await treeHashes(snapshot),
  });
}
const consumers: Record<string, string> = {},
  results: Record<string, unknown>[] = [];
const installations: Record<string, unknown>[] = [];
async function setup(label: string, composition: boolean) {
  const root = await Deno.makeTempDir({ prefix: `portal-${label}-` });
  consumers[label] = root;
  const installedPackages: Record<string, string> = {};
  for (const pkg of packages) {
    // Child-only runtime packages are installed in a native installation workspace.
    // They are activated at their real child scopes, never as root dependencies.
    const installRoot =
      ["course-presentation", "course-navigation"].includes(pkg.name)
        ? await Deno.makeTempDir({ prefix: `installed-${pkg.name}-` })
        : root;
    await command(quarto, ["add", pkg.archive, "--no-prompt"], installRoot, {
      QUARTO_RUN_NO_NETWORK: "true",
    });
    const installed = join(installRoot, "_extensions", pkg.name);
    const actualFiles = await treeHashes(installed);
    assert(
      JSON.stringify(actualFiles) === JSON.stringify(pkg.files),
      `${label}/${pkg.name}: exact installed file-set/SHA mismatch`,
    );
    installations.push({
      corpus: label,
      scope: installRoot === root ? "root" : "external",
      method: "quarto-add",
      name: pkg.name,
      files: actualFiles,
    });
    const namespaced = join(
      installRoot,
      "_extensions/Afonenko-Course-Tools",
      pkg.name,
    );
    await Deno.mkdir(dirname(namespaced), { recursive: true });
    await Deno.rename(installed, namespaced);
    installedPackages[pkg.name] = namespaced;
  }
  await fixture(root, composition);
  await copy(join(repo, "fixtures/probes/portal"), join(root, "_probe/portal"));
  async function childPackage(member: string, name: string) {
    const destination = join(
      root,
      member,
      "_extensions/Afonenko-Course-Tools",
      name,
    );
    await copy(installedPackages[name], destination);
    const actualFiles = await treeHashes(destination);
    assert(
      JSON.stringify(actualFiles) ===
        JSON.stringify(packages.find((pkg) => pkg.name === name)!.files),
      `${member}/${name} exact installed file-set/SHA mismatch`,
    );
    installations.push({
      corpus: label,
      scope: member,
      method: "member-copy",
      name,
      files: actualFiles,
    });
  }
  if (composition) {
    await childPackage("tasks", "course-core");
  } else {
    await childPackage("book", "course-core");
    await childPackage("book", "project-download");
    for (const member of ["book", "essay", "lectures", "practice"]) {
      await childPackage(member, "course-presentation");
    }
    for (const member of ["lectures", "practice"]) {
      await childPackage(member, "course-navigation");
    }
  }
  await Deno.writeTextFile(
    join(evidence, "partial-results.json"),
    JSON.stringify(
      {
        phase,
        expectedLabels: requiredCases(phase).map((c) => c.label),
        consumers,
        results,
      },
      null,
      2,
    ),
  );
  await writeInstallManifest();
  return root;
}
async function events(root: string) {
  const path = join(root, ".project-publish/consumer-events.jsonl");
  if (!await exists(path)) return [];
  const records = (await Deno.readTextFile(path)).trim().split("\n").map(
    (line) => JSON.parse(line),
  );
  return records.filter((record) =>
    record.attemptId === records.at(-1).attemptId
  );
}
async function authorConfigs(root: string) {
  return Object.fromEntries(
    await Promise.all(
      (await files(root)).filter((path) =>
        relative(root, path).split("/").every((part) =>
          ![".project-publish", ".quarto", "_site-student", "_site-full"]
            .includes(part)
        ) && /_quarto[^/]*\.ya?ml$/.test(path)
      ).map(async (path) => [relative(root, path), await hash(path)]),
    ),
  );
}
async function render(
  root: string,
  label: string,
  profile = "student",
  failure?: string,
  mode = label,
) {
  const previous = {
    student: await treeHashes(join(root, "_site-student")),
    full: await treeHashes(join(root, "_site-full")),
  };
  const configs = await authorConfigs(root);
  const cache = join(evidence, `cache-${label}`);
  assert(!await exists(cache), `fresh native cache ${label}`);
  const publicEvents: unknown[] = [];
  const watch = Deno.watchFs([
    join(root, "_site-student"),
    join(root, "_site-full"),
  ], { recursive: true });
  const watching = (async () => {
    for await (const event of watch) publicEvents.push(event);
  })();
  const started = performance.now();
  const args = mode === "commit-failure"
    ? ["run", "_probe/portal/commit-failure.ts"]
    : ["render", ".", "--profile", profile];
  const result = await new Deno.Command(quarto, {
    args,
    cwd: root,
    env: {
      QUARTO: quarto,
      QUARTO_RUN_NO_NETWORK: "true",
      QUARTO_PROFILE: profile,
      QUARTO_PROJECT_OUTPUT_DIR: "",
      XDG_CACHE_HOME: cache,
      DENO_DIR: join(cache, "deno"),
      PORTAL_CONSUMER_CASE: mode,
      PORTAL_ENGINE_WITNESS: join(evidence, "unsupported-root-engine-ran.txt"),
    },
    stdout: "piped",
    stderr: "piped",
  }).output();
  watch.close();
  await watching;
  const text = new TextDecoder().decode(result.stdout) +
    new TextDecoder().decode(result.stderr);
  await Deno.writeTextFile(join(evidence, `${label}.log`), text);
  const current = {
    student: await treeHashes(join(root, "_site-student")),
    full: await treeHashes(join(root, "_site-full")),
  };
  const currentConfigs = await authorConfigs(root);
  // Save observations before assertions so a first contract failure remains
  // reviewable without reconstructing the temporary native workspace.
  await Deno.writeTextFile(
    join(evidence, `${label}-observation.json`),
    JSON.stringify(
      {
        label,
        profile,
        mode,
        expectedFailure: failure ?? null,
        exit: result.code,
        previous,
        current,
        authorConfigs: { before: configs, after: currentConfigs },
        publicEvents,
      },
      null,
      2,
    ),
  );
  assert(
    result.success === !failure,
    `${label}: unexpected exit ${result.code}\n${text.slice(-12000)}`,
  );
  if (failure) {
    assert(
      text.includes(failure),
      `${label}: expected ${failure}\n${text.slice(-12000)}`,
    );
    for (const audience of ["student", "full"] as const) {
      assert(
        JSON.stringify(current[audience]) ===
          JSON.stringify(previous[audience]),
        `${label}: changed previous ${audience} file-set/SHA`,
      );
    }
    if (mode !== "commit-failure") {
      assert(
        publicEvents.length === 0,
        `${label}: temporary public file events before commit`,
      );
    }
  } else {
    const other = profile === "student" ? "full" : "student";
    assert(
      JSON.stringify(current[other]) ===
        JSON.stringify(previous[other]),
      `${label}: changed other ${other} file-set/SHA`,
    );
    const currentEvents = await events(root);
    assert(
      currentEvents.filter((event) => event.stage === "navigation-activated")
        .length === 1,
      `${label}: navigation activated more than once or never`,
    );
    const prepared = currentEvents.find((event) => event.stage === "prepared");
    assert(
      prepared.portal.input ===
          join(prepared.members[0].path, "../index.qmd") &&
        prepared.profiles.join() === profile &&
        prepared.portal.renderProfiles.join() === `${profile},publish-portal`,
      `${label}: actual native root selection/audience mismatch`,
    );
    assert(
      currentEvents.at(-1)?.stage === "verified",
      `${label}: final QRC/resource verification missing`,
    );
    await Deno.writeTextFile(
      join(evidence, `${label}-events.json`),
      JSON.stringify(currentEvents, null, 2),
    );
    assert(
      !await exists(join(root, `_site-${profile}/old`)),
      `${label}: current stage seeded from previous output`,
    );
    assert(
      !Object.keys(current[profile as "student" | "full"]).some(
        (path) =>
          /(?:^|\/)(?:_quarto[^/]*\.ya?ml|_extensions|\.course-owner|\.project-publish)(?:\/|$)/
            .test(path),
      ),
      `${label}: service/control file published`,
    );
  }
  assert(
    JSON.stringify(currentConfigs) === JSON.stringify(configs),
    `${label}: author root/profile/member config bytes changed`,
  );
  assert(
    !await exists(join(evidence, "unsupported-root-engine-ran.txt")),
    `${label}: unsupported root engine executed`,
  );
  results.push({
    label,
    profile,
    expectedFailure: failure ?? null,
    exit: result.code,
    milliseconds: Math.round(performance.now() - started),
    previousStudentPreserved: !!failure || profile === "full",
    previousFullPreserved: !!failure || profile === "student",
    publicEvents: publicEvents.length,
  });
  await Deno.writeTextFile(
    join(evidence, "partial-results.json"),
    JSON.stringify(
      {
        phase,
        expectedLabels: requiredCases(phase).map((c) => c.label),
        consumers,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`PASS ${label} (${result.code})`);
}
const installManifest = {
  protocol: 1,
  phase,
  templateSource,
  method:
    "local archives -> quarto add -> complete installed file-set/SHA equality",
  versions: {
    quarto: (await command(quarto, ["--version"], preparation)).trim(),
    cue: (await command("cue", ["version"], preparation)).split("\n")[0],
  },
  companionSources: await Promise.all(
    Object.entries(providers).map(async ([name, path]) => ({
      name,
      commit: (await command("git", ["rev-parse", "HEAD"], path)).trim(),
      tree: (await command("git", ["rev-parse", "HEAD^{tree}"], path))
        .trim(),
      dirty: !!(await command("git", ["status", "--porcelain"], path))
        .trim(),
    })),
  ),
  packages: packages.map(({ source: _source, archive: _archive, ...pkg }) =>
    pkg
  ),
  installations,
};
async function writeInstallManifest() {
  await Deno.writeTextFile(
    join(evidence, "install-manifest.json"),
    JSON.stringify(installManifest, null, 2),
  );
}
await writeInstallManifest();
const composition = phase === "main-five"
  ? undefined
  : await setup("composition", true);
let expectedCompositionFull: Record<string, string> | undefined;
if (composition) {
  await render(composition, "composition-student", "student");
  await render(composition, "composition-full", "full");
  expectedCompositionFull = await treeHashes(
    join(composition, "_site-full"),
  );
}
const main = phase === "composition"
  ? undefined
  : await setup("main-five", false);
let expectedMainFull: Record<string, string> | undefined;
if (main) {
  await render(main, "main-five-student", "student");
  await render(main, "main-five-full", "full");
  expectedMainFull = await treeHashes(join(main, "_site-full"));
  await render(
    main,
    "late-download-state-copy",
    "student",
    "RESOURCE.PUBLICATION_DENIED_BYTES",
  );
  await render(main, "dormant-boundary-drift", "student", "SOURCE.");
  await render(
    main,
    "late-dormant-copy",
    "student",
    "RESOURCE.PUBLICATION_DENIED_BYTES",
  );
  await render(
    main,
    "late-runtime-rename",
    "student",
    "RESOURCE.PUBLICATION_DENIED_BYTES",
  );
  const originalMain = await Deno.readTextFile(join(main, "_quarto.yml"));
  const rawRuntimePath = join(
    main,
    "lectures/_extensions/Afonenko-Course-Tools/course-presentation/presentation.css",
  );
  await write(
    main,
    "_quarto.yml",
    originalMain.replace(
      "resources: [./configured.txt",
      "resources: [./lectures/_extensions/Afonenko-Course-Tools/course-presentation/presentation.css, ./configured.txt",
    ).replace(', "!lectures/**"', ""),
  );
  // Quarto subtracts resource exclusions after includes. The negative case
  // must select these bytes, rather than leave them excluded with the member.
  const rawInspect = JSON.parse(
    await command(quarto, ["inspect", main, "--profile", "student"], main, {
      QUARTO_RUN_NO_NETWORK: "true",
      QUARTO_PROFILE: "student",
      QUARTO_PROJECT_OUTPUT_DIR: "",
    }),
  );
  await Deno.writeTextFile(
    join(evidence, "raw-runtime-selection-inspect.json"),
    JSON.stringify(rawInspect, null, 2),
  );
  assert(
    rawInspect.files.resources.some((path: string) =>
      resolve(main, path) === rawRuntimePath
    ),
    "raw-runtime-selection: native inspect did not select the raw runtime",
  );
  await render(main, "raw-runtime-selection", "student", "RESOURCE.");
  await write(main, "_quarto.yml", originalMain);
  await write(main, "orphan.qmd", "# Unknown root source\n");
  await render(main, "orphan-root-source", "student", "SOURCE.UNCOVERED_QMD");
  await Deno.remove(join(main, "orphan.qmd"));
}
if (composition) {
  for (
    const [label, failure] of [
      ["before-failure", "INJECTED_BEFORE_FAILURE"],
      ["child-failure", "absent-portal-filter"],
      ["finalizer-failure", "INJECTED_FINALIZER_FAILURE"],
      ["source-drift", "SOURCE."],
      ["control-drift", "control"],
      ["late-closed-qrc", "tasks:sec-closed"],
      ["late-control-copy", "RESOURCE.PUBLICATION_DENIED_BYTES"],
      ["late-core-copy", "RESOURCE.PUBLICATION_DENIED_BYTES"],
      ["late-child-public-rename", "RESOURCE.PUBLICATION_DENIED_BYTES"],
      ["commit-failure", "INJECTED_COMMIT_FAILURE"],
    ]
  ) await render(composition, label, "student", failure);
  const originalRoot = await Deno.readTextFile(
    join(composition, "_quarto.yml"),
  );
  const originalInput = await Deno.readTextFile(join(composition, "index.qmd"));
  for (
    const [label, mutate, failure] of [
      ["raw-core-selection", async () =>
        write(
          composition,
          "_quarto.yml",
          originalRoot.replace(
            "resources: [./configured.txt",
            "resources: [./_extensions/Afonenko-Course-Tools/course-core/filter.lua, ./configured.txt",
          ),
        ), "RESOURCE."],
      ["root-pedagogy", async () =>
        write(
          composition,
          "index.qmd",
          originalInput +
            '\n::: {#exr-unsupported target="manual"}\nUnknown root pedagogy.\n:::\n',
        ), "SOURCE.NAVIGATION_UNSUPPORTED"],
      ["root-engine", async () =>
        write(
          composition,
          "index.qmd",
          "---\nengine: jupyter\n---\n" + originalInput +
            '\n```{python}\nimport os\nfrom pathlib import Path\nPath(os.environ["PORTAL_ENGINE_WITNESS"]).write_text("unsupported root engine executed")\n```\n',
        ), "SOURCE.NAVIGATION_COMPUTED_UNSUPPORTED"],
      ["renamed-closed-owner-bytes", async () => {
        await Deno.copyFile(
          join(composition, "tasks/closed.txt"),
          join(composition, "renamed-closed.txt"),
        );
        await write(
          composition,
          "_quarto.yml",
          originalRoot.replace(
            "resources: [./configured.txt",
            "resources: [./renamed-closed.txt, ./configured.txt",
          ),
        );
      }, "RESOURCE.PUBLICATION_DENIED_BYTES"],
    ] as const
  ) {
    await mutate();
    await render(composition, label, "student", failure);
    await write(composition, "_quarto.yml", originalRoot);
    await write(composition, "index.qmd", originalInput);
    if (await exists(join(composition, "renamed-closed.txt"))) {
      await Deno.remove(join(composition, "renamed-closed.txt"));
    }
  }
  await render(composition, "recovery-student", "student");
  assert(
    JSON.stringify(await treeHashes(join(composition, "_site-full"))) ===
      JSON.stringify(expectedCompositionFull),
    "negative wave/recovery altered composition full profile",
  );
}
if (main) {
  assert(
    JSON.stringify(await treeHashes(join(main, "_site-full"))) ===
      JSON.stringify(expectedMainFull),
    "negative wave altered main full profile",
  );
}
const caseMultiplicity = verifyPhaseResults(phase, results);
await Deno.writeTextFile(
  join(evidence, phase === "all" ? "results.json" : "phase-results.json"),
  JSON.stringify(
    {
      protocol: 1,
      status: "success",
      phase,
      templateSource,
      expectedLabels: requiredCases(phase).map((c) => c.label),
      expectedCount: requiredCases(phase).length,
      caseMultiplicity,
      consumers,
      networkImportsDisabled: true,
      resumedFrom: null,
      aggregateFullProfilesPreserved: true,
      results,
    },
    null,
    2,
  ),
);
console.log(
  phase === "all"
    ? `PASS installed managed portal: ${results.length} native cases, full suite`
    : `PASS installed managed portal phase ${phase}: ${results.length} native cases; full suite requires both phases`,
);
