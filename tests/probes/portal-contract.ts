// Test orchestration and CI evidence transport; resource policy stays in Core.
export const PORTAL_PHASES = ["composition", "main-five"] as const;
export const PORTAL_VERSIONS = ["1.10.18", "1.11.5"] as const;
export const PORTAL_RUNNER_SOURCE_FILES = [
  "portal-consumer.ts",
  "portal-contract.ts",
  "portal-aggregate.ts",
  "portal-receipt-guards.ts",
  "portal-provider-refs.json",
];
export type PortalPhase = typeof PORTAL_PHASES[number];
export type PortalSelection = PortalPhase | "all";
interface Case {
  label: string;
  profile: "student" | "full";
  expectedFailure: string | null;
}
const c = (label: string, expectedFailure: string | null = null): Case => ({
  label,
  profile: label.endsWith("-full") ? "full" : "student",
  expectedFailure,
});
export const PORTAL_CASES: Record<PortalPhase, Case[]> = {
  composition: [
    c("composition-student"),
    c("composition-full"),
    c("before-failure", "INJECTED_BEFORE_FAILURE"),
    c("child-failure", "absent-portal-filter"),
    c("finalizer-failure", "INJECTED_FINALIZER_FAILURE"),
    c("source-drift", "SOURCE."),
    c("control-drift", "control"),
    c("late-closed-qrc", "tasks:sec-closed"),
    c("late-control-copy", "RESOURCE.PUBLICATION_DENIED_BYTES"),
    c("late-core-copy", "RESOURCE.PUBLICATION_DENIED_BYTES"),
    c("late-child-public-rename", "RESOURCE.PUBLICATION_DENIED_BYTES"),
    c("commit-failure", "INJECTED_COMMIT_FAILURE"),
    c("raw-core-selection", "RESOURCE."),
    c("root-pedagogy", "SOURCE.NAVIGATION_UNSUPPORTED"),
    c("root-engine", "SOURCE.NAVIGATION_COMPUTED_UNSUPPORTED"),
    c("renamed-closed-owner-bytes", "RESOURCE.PUBLICATION_DENIED_BYTES"),
    c("recovery-student"),
  ],
  "main-five": [
    c("main-five-student"),
    c("main-five-full"),
    c("late-download-state-copy", "RESOURCE.PUBLICATION_DENIED_BYTES"),
    c("dormant-boundary-drift", "SOURCE."),
    c("late-dormant-copy", "RESOURCE.PUBLICATION_DENIED_BYTES"),
    c("late-runtime-rename", "RESOURCE.PUBLICATION_DENIED_BYTES"),
    c("raw-runtime-selection", "RESOURCE."),
    c("orphan-root-source", "SOURCE.UNCOVERED_QMD"),
  ],
};
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PORTAL_RECEIPT: ${message}`);
}
function record(value: unknown, name: string): Record<string, any> {
  assert(value && typeof value === "object" && !Array.isArray(value), name);
  return value as Record<string, any>;
}
function list(value: unknown, name: string): any[] {
  assert(Array.isArray(value), name);
  return value;
}
function sha(value: unknown, size: number, name: string) {
  assert(
    typeof value === "string" && new RegExp(`^[a-f0-9]{${size}}$`).test(value),
    name,
  );
}
function fileMap(value: unknown, name: string) {
  const files = record(value, name);
  assert(Object.keys(files).length, `${name} is empty`);
  for (const [path, digest] of Object.entries(files)) {
    assert(
      path && !path.startsWith("/") && !path.split("/").includes(".."),
      `${name} path`,
    );
    sha(digest, 64, `${name} SHA256 ${path}`);
  }
  return files;
}
function sorted(value: any): any {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((k) => [k, sorted(value[k])]),
    );
  }
  return value;
}
export const canonical = (value: unknown) => JSON.stringify(sorted(value));
function same(actual: unknown, expected: unknown, name: string) {
  assert(canonical(actual) === canonical(expected), name);
}
export function parsePortalPhase(value: string | undefined): PortalSelection {
  if (value === undefined || value === "all") return "all";
  assert(
    PORTAL_PHASES.includes(value as PortalPhase),
    `unsupported phase ${value}`,
  );
  return value as PortalPhase;
}
export function requiredCases(phase: PortalSelection): Case[] {
  // Preserve the default runner's original ordering across its independent corpora.
  return phase === "all"
    ? [
      ...PORTAL_CASES.composition.slice(0, 2),
      ...PORTAL_CASES["main-five"],
      ...PORTAL_CASES.composition.slice(2),
    ]
    : PORTAL_CASES[phase];
}
export function verifyPhaseResults(phase: PortalSelection, value: unknown) {
  const results = list(value, "native results"),
    expected = requiredCases(phase);
  same(
    results.map((r) => r.label),
    expected.map((r) => r.label),
    "missing, duplicate, unexpected or reordered case",
  );
  for (let i = 0; i < expected.length; i++) {
    const actual = record(results[i], "native case"), wanted = expected[i];
    same(
      {
        label: actual.label,
        profile: actual.profile,
        expectedFailure: actual.expectedFailure,
      },
      wanted,
      `case contract ${wanted.label}`,
    );
    assert(
      Number.isInteger(actual.exit) &&
        (wanted.expectedFailure ? actual.exit !== 0 : actual.exit === 0),
      `native exit ${wanted.label}`,
    );
    assert(
      Number.isFinite(actual.milliseconds) && actual.milliseconds >= 0,
      `duration ${wanted.label}`,
    );
    assert(
      Number.isInteger(actual.publicEvents) && actual.publicEvents >= 0,
      `public events ${wanted.label}`,
    );
    if (wanted.expectedFailure || wanted.profile === "full") {
      assert(
        actual.previousStudentPreserved === true,
        `previous student changed ${wanted.label}`,
      );
    }
    if (wanted.expectedFailure || wanted.profile === "student") {
      assert(
        actual.previousFullPreserved === true,
        `previous full changed ${wanted.label}`,
      );
    }
    if (wanted.expectedFailure && wanted.label !== "commit-failure") {
      assert(
        actual.publicEvents === 0,
        `temporary public events ${wanted.label}`,
      );
    }
  }
  return Object.fromEntries(expected.map((c) => [c.label, 1]));
}
export interface SourceRef {
  commit: string;
  tree: string;
}
/** Recheck direct observations, including genuine baselines and the whole wave. */
export function verifyPhaseObservations(
  phase: PortalPhase,
  results: unknown,
  value: unknown,
) {
  verifyPhaseResults(phase, results);
  const rows = list(results, "results"),
    observations = list(value, "observations");
  assert(observations.length === rows.length, "missing attempt observation");
  let preceding: unknown, fullBaseline: unknown;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i],
      observation = record(observations[i], "attempt observation");
    same({
      label: observation.label,
      profile: observation.profile,
      expectedFailure: observation.expectedFailure,
    }, {
      label: row.label,
      profile: row.profile,
      expectedFailure: row.expectedFailure,
    }, "observation case contract");
    assert(
      observation.mode === row.label && observation.exit === row.exit,
      "observation mode/exit",
    );
    const previous = record(observation.previous, "previous publications"),
      current = record(observation.current, "current publications");
    for (const profile of ["student", "full"]) {
      fileMap(previous[profile], "previous publication file map");
      fileMap(current[profile], "current publication file map");
    }
    if (preceding !== undefined) {
      same(previous, preceding, "publication chain changed between attempts");
    }
    if (row.expectedFailure) {
      same(current, previous, "failed attempt changed previous publication");
    } else {
      const other = row.profile === "student" ? "full" : "student";
      same(
        current[other],
        previous[other],
        "success altered other publication",
      );
      if (i < 2) {
        assert(
          canonical(current[row.profile]) !== canonical(previous[row.profile]),
          "baseline retained populated seed instead of current native publication",
        );
      }
    }
    if (i === 1) fullBaseline = current.full;
    if (i > 1) {
      same(current.full, fullBaseline, "aggregate full publication changed");
    }
    const configs = record(observation.authorConfigs, "author configs");
    fileMap(configs.before, "before author configs");
    fileMap(configs.after, "after author configs");
    same(configs.before, configs.after, "author config bytes changed");
    assert(
      list(observation.publicEvents, "observed public events").length ===
        row.publicEvents,
      "false public event count",
    );
    preceding = current;
  }
}
export interface ExpectedRefs {
  template: SourceRef & { files: Record<string, string> };
  providers: Record<string, SourceRef>;
}
export interface PhaseEvidence {
  version: string;
  phase: string;
  receipt: unknown;
  manifest: unknown;
}
const providers = ["core", "download", "publisher", "qrc"];
const packageNames = [
  "course-core",
  "course-navigation",
  "course-presentation",
  "project-download",
  "project-publish",
  "reference-catalog",
];
// Exact fixture installation evidence, not a public-resource allowance.
function requiredInstallationKeys(phase: PortalPhase) {
  return [
    ...packageNames.map((name) =>
      `quarto-add/${
        ["course-presentation", "course-navigation"].includes(name)
          ? "external"
          : "root"
      }/${name}`
    ),
    ...(phase === "composition" ? ["member-copy/tasks/course-core"] : [
      "member-copy/book/course-core",
      "member-copy/book/project-download",
      ...["book", "essay", "lectures", "practice"].map((scope) =>
        `member-copy/${scope}/course-presentation`
      ),
      ...["lectures", "practice"].map((scope) =>
        `member-copy/${scope}/course-navigation`
      ),
    ]),
  ].sort();
}
function templateSource(value: unknown, expected: ExpectedRefs["template"]) {
  const source = record(value, "Template source");
  sha(source.commit, 40, "Template commit");
  sha(source.tree, 40, "Template tree");
  same(
    { commit: source.commit, tree: source.tree },
    { commit: expected.commit, tree: expected.tree },
    "wrong Template head/tree",
  );
  assert(source.dirty === false, "dirty Template source");
  fileMap(source.files, "Template source file map");
  same(
    source.files,
    fileMap(expected.files, "expected checkout source file map"),
    "Template source bytes differ from exact aggregator checkout",
  );
  return source;
}
/** Required CI gate: all4 current artifacts, never an inferred/partial full25. */
export function aggregatePortalReceipts(
  evidence: PhaseEvidence[],
  expected: ExpectedRefs,
) {
  same(
    Object.keys(expected.providers).sort(),
    providers,
    "expected provider set",
  );
  sha(expected.template.commit, 40, "expected Template commit");
  sha(expected.template.tree, 40, "expected Template tree");
  const pairs = PORTAL_VERSIONS.flatMap((v) =>
    PORTAL_PHASES.map((p) => `${v}/${p}`)
  );
  same(
    evidence.map((e) => `${e.version}/${e.phase}`).sort(),
    pairs.sort(),
    "required channel/phase matrix",
  );
  let sharedSource: unknown, sharedPackages: unknown;
  const channels: Record<string, unknown> = {};
  for (const version of PORTAL_VERSIONS) {
    const phases: Record<string, unknown>[] = [];
    const labels: string[] = [];
    for (const phase of PORTAL_PHASES) {
      const item = evidence.find((e) =>
        e.version === version && e.phase === phase
      )!;
      const receipt = record(item.receipt, "phase receipt"),
        manifest = record(item.manifest, "install manifest");
      assert(
        receipt.protocol === 1 && manifest.protocol === 1,
        "evidence protocol",
      );
      assert(
        receipt.status === "success" && receipt.phase === phase &&
          manifest.phase === phase,
        "phase did not succeed",
      );
      assert(
        receipt.networkImportsDisabled === true && receipt.resumedFrom === null,
        "network imports or resumed receipt",
      );
      assert(
        receipt.aggregateFullProfilesPreserved === true,
        "aggregate profile preservation missing",
      );
      const cases = requiredCases(phase),
        multiplicity = verifyPhaseResults(phase, receipt.results);
      same(
        receipt.expectedLabels,
        cases.map((c) => c.label),
        "false expected labels",
      );
      assert(receipt.expectedCount === cases.length, "false expected count");
      same(receipt.caseMultiplicity, multiplicity, "false case multiplicity");
      const source = templateSource(receipt.templateSource, expected.template);
      same(
        templateSource(manifest.templateSource, expected.template),
        source,
        "receipt/manifest Template source mismatch",
      );
      if (sharedSource === undefined) sharedSource = source;
      else {same(
          source,
          sharedSource,
          "different Template source bytes across phases/channels",
        );}
      assert(
        manifest.versions?.quarto === version &&
          manifest.versions?.cue === "cue version v0.17.1",
        "wrong actual Quarto/CUE version",
      );
      const companions = list(manifest.companionSources, "companion sources");
      same(
        companions.map((s) => s.name).sort(),
        providers,
        "wrong provider set",
      );
      for (const companion of companions) {
        const ref = expected.providers[companion.name];
        sha(ref.commit, 40, "expected provider commit");
        sha(ref.tree, 40, "expected provider tree");
        same(
          { commit: companion.commit, tree: companion.tree },
          ref,
          `provider ref ${companion.name}`,
        );
        assert(companion.dirty === false, `dirty provider ${companion.name}`);
      }
      const packages = list(manifest.packages, "packages");
      same(
        packages.map((p) => p.name).sort(),
        packageNames,
        "wrong package set",
      );
      const files = Object.fromEntries(packages.map((p) => {
        sha(p.archiveSha256, 64, `archive ${p.name}`);
        return [p.name, fileMap(p.files, `archive files ${p.name}`)];
      }));
      if (sharedPackages === undefined) sharedPackages = files;
      else {same(
          files,
          sharedPackages,
          "different package file maps across phases/channels",
        );}
      const installations = list(
        manifest.installations,
        "actual installations",
      );
      const keys: string[] = [];
      for (const install of installations) {
        assert(
          install.corpus === phase && typeof install.scope === "string" &&
            install.scope.length &&
            ["quarto-add", "member-copy"].includes(install.method),
          "invalid installation scope",
        );
        assert(Object.hasOwn(files, install.name), "unknown installed package");
        same(
          fileMap(install.files, `installed files ${install.name}`),
          files[install.name],
          "installed file-set/SHA mismatch",
        );
        keys.push(`${install.method}/${install.scope}/${install.name}`);
      }
      assert(
        new Set(keys).size === keys.length,
        "duplicate installation evidence",
      );
      same(
        keys.sort(),
        requiredInstallationKeys(phase),
        "missing, unexpected or misplaced actual installation proof",
      );
      labels.push(...cases.map((c) => c.label));
      phases.push({
        phase,
        caseCount: cases.length,
        caseMultiplicity: multiplicity,
        aggregateFullProfilesPreserved: true,
      });
    }
    same(
      labels.slice().sort(),
      requiredCases("all").map((c) => c.label).sort(),
      "channel does not contain all25 exactly once",
    );
    assert(
      new Set(labels).size === 25 && labels.length === 25,
      "channel multiplicity",
    );
    channels[version] = { caseCount: 25, phases };
  }
  return {
    protocol: 1,
    status: "success",
    templateSource: sharedSource,
    providers: expected.providers,
    packageFiles: sharedPackages,
    networkImportsDisabled: true,
    resumedFrom: null,
    channels,
    totalNativeCases: 50,
  };
}
