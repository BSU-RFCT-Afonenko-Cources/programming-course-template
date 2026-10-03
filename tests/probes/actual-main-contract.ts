// Original-course CI transport; visibility/resource policy remains in installed Core.
import {
  canonical,
  PORTAL_VERSIONS,
  type SourceRef,
} from "./portal-contract.ts";
export const ACTUAL_MAIN_PHASES = ["releases", "late"] as const;
export type ActualMainPhase = typeof ACTUAL_MAIN_PHASES[number];
export const ACTUAL_MAIN_INPUTS = {
  book: [
    "book/index.qmd",
    "book/topics/contracts/index.qmd",
    "book/topics/contracts/demonstration.qmd",
    "book/labs/01.qmd",
  ],
  essay: [
    "essay/index.qmd",
    "essay/text/index.qmd",
    "essay/text/representation/index.qmd",
    "essay/text/decoding/index.qmd",
    "essay/text/immutability/index.qmd",
  ],
};
export const ACTUAL_MAIN_MEMBERS = [
  { namespace: "book", path: "book", mount: "book", format: "html" },
  {
    namespace: "lectures",
    path: "lectures",
    mount: "lectures",
    format: "revealjs",
  },
  {
    namespace: "practice",
    path: "practice",
    mount: "practice",
    format: "revealjs",
  },
  { namespace: "essay", path: "essay", mount: "essay", format: "html" },
  { namespace: "handouts", path: "handouts", mount: "handouts", format: "pdf" },
];
const packageNames = [
  "course-core",
  "course-navigation",
  "course-presentation",
  "project-download",
  "project-publish",
  "reference-catalog",
];
const destinations: Record<string, string[]> = {
  "course-core": ["root", "book", "essay"],
  "course-navigation": ["lectures", "practice"],
  "course-presentation": [
    "book",
    "essay",
    "lectures",
    "practice",
    "examples/cloud",
    "examples/prairielearn",
  ],
  "project-download": ["book", "essay"],
  "project-publish": ["root"],
  "reference-catalog": ["root"],
};
export const ACTUAL_MAIN_INSTALLATIONS = [
  ...packageNames.map((name) => ({
    name,
    scope: "external",
    method: "quarto-add",
  })),
  ...packageNames.flatMap((name) =>
    destinations[name].map((scope) => ({
      name,
      scope,
      method: "installed-copy",
    }))
  ),
];
export const ACTUAL_MAIN_SOURCE_FILES = [
  "actual-main-consumer.ts",
  "actual-main-contract.ts",
  "actual-main-evidence.ts",
  "actual-main-aggregate.ts",
  "actual-main-receipt-guards.ts",
  "actual-main-settings.json",
];
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`ACTUAL_MAIN_RECEIPT: ${message}`);
}
function object(value: unknown, name: string): Record<string, any> {
  assert(value && typeof value === "object" && !Array.isArray(value), name);
  return value as Record<string, any>;
}
function array(value: unknown, name: string): any[] {
  assert(Array.isArray(value), name);
  return value;
}
function same(a: unknown, b: unknown, name: string) {
  assert(canonical(a) === canonical(b), name);
}
function digest(value: unknown, name: string, length = 64) {
  assert(
    typeof value === "string" &&
      new RegExp(`^[a-f0-9]{${length}}$`).test(value),
    name,
  );
}
export function actualMainFileMap(value: unknown, name: string) {
  const map = object(value, name);
  assert(Object.keys(map).length, `${name} empty`);
  for (const [path, value] of Object.entries(map)) {
    assert(
      path && !path.startsWith("/") &&
        !path.split("/").some((p) => !p || p === "." || p === ".."),
      `${name} relative path`,
    );
    digest(value, `${name} SHA256 ${path}`);
  }
  return map as Record<string, string>;
}
function publicMaps(value: unknown, name: string) {
  const maps = object(value, name);
  same(
    Object.keys(maps).sort(),
    ["full", "student"],
    `${name} both public trees required`,
  );
  for (const profile of ["student", "full"]) {
    const map = actualMainFileMap(maps[profile], `${name}/${profile}`);
    assert(Object.keys(map).length >= 2, `${name}/${profile} is not populated`);
    for (const path of Object.keys(map)) {
      assert(
        !path.split("/").some((part) =>
          [".project-publish", ".quarto", ".git"].includes(part)
        ),
        `${name} contains private state`,
      );
    }
  }
  return maps;
}
export interface ActualMainExpected {
  template: SourceRef & { files: Record<string, string> };
  providers: Record<string, SourceRef>;
  run: { repository: string; runId: string };
  lateRefusal: string;
}
export interface ActualMainEvidence {
  version: string;
  phase: string;
  manifest: unknown;
  receipt: unknown;
  observations: unknown;
  receiptSha256?: string;
  manifestSha256?: string;
  publication?: unknown;
  publicBaseline?: unknown;
  publicBaselineSha256?: string;
}
export function assertActualMainPhase(value: unknown): ActualMainPhase {
  assert(
    ACTUAL_MAIN_PHASES.includes(value as ActualMainPhase),
    `unsupported subset/phase ${value}`,
  );
  return value as ActualMainPhase;
}
function lineage(value: unknown, expected: ActualMainExpected) {
  const run = object(value, "run lineage");
  same(
    { repository: run.repository, runId: run.runId },
    expected.run,
    "not the current repository/workflow run",
  );
  assert(
    typeof run.runAttempt === "string" && /^[1-9][0-9]*$/.test(run.runAttempt),
    "run attempt absent",
  );
  return run;
}
function source(value: unknown, expected: ActualMainExpected) {
  const s = object(value, "Template source");
  digest(s.commit, "Template head", 40);
  digest(s.tree, "Template tree", 40);
  same({ commit: s.commit, tree: s.tree }, {
    commit: expected.template.commit,
    tree: expected.template.tree,
  }, "wrong Template head/tree");
  assert(s.dirty === false, "dirty Template source");
  same(
    actualMainFileMap(s.files, "Template source bytes"),
    expected.template.files,
    "Template bytes differ from exact aggregation checkout",
  );
  return s;
}
export function manifest(
  value: unknown,
  phase: string,
  version: string,
  expected: ActualMainExpected,
) {
  const m = object(value, "install manifest");
  assert(m.protocol === 1 && m.phase === phase, "manifest scope");
  source(m.templateSource, expected);
  lineage(m.run, expected);
  same(
    m.versions,
    { quarto: version, cue: "cue version v0.17.1" },
    "wrong actual native versions",
  );
  const providers = array(m.companionSources, "provider sources");
  same(
    providers.map((p) => p.name).sort(),
    Object.keys(expected.providers).sort(),
    "wrong provider set",
  );
  for (const p of providers) {
    same(
      { commit: p.commit, tree: p.tree },
      expected.providers[p.name],
      `provider ref ${p.name}`,
    );
    assert(p.dirty === false, `dirty provider ${p.name}`);
  }
  const packages = array(m.packages, "six packages");
  same(packages.map((p) => p.name).sort(), packageNames, "wrong package set");
  const maps = Object.fromEntries(packages.map((p) => {
    digest(p.archiveSha256, "archive SHA256");
    return [p.name, actualMainFileMap(p.files, `package ${p.name}`)];
  }));
  const installed = array(m.installations, "actual installations");
  same(
    installed.map(({ name, scope, method }) => ({ name, scope, method })).sort((
      a,
      b,
    ) => canonical(a).localeCompare(canonical(b))),
    ACTUAL_MAIN_INSTALLATIONS.slice().sort((a, b) =>
      canonical(a).localeCompare(canonical(b))
    ),
    "missing, duplicated or misplaced actual member package proof",
  );
  for (const p of installed) {
    same(
      actualMainFileMap(p.files, "installed bytes"),
      maps[p.name],
      "installed complete file-set/SHA differs",
    );
  }
  same(m.sourceInputs, {
    student: ACTUAL_MAIN_INPUTS,
    full: ACTUAL_MAIN_INPUTS,
  }, "original book4/essay5 native source subset or drift");
  same(
    m.members,
    ACTUAL_MAIN_MEMBERS,
    "original five native boundaries changed",
  );
  same(
    m.scaffolding,
    ["prepare", "finish", "verify", "state", "verification"].map((name) => ({
      source: `fixtures/probes/actual-main/${name}.ts`,
      target: `_publication/${name}.ts`,
      sha256: expected.template.files[`fixtures/probes/actual-main/${name}.ts`],
    })),
    "missing, unsigned or config-mutating test adapter bytes",
  );
  for (const scaffold of m.scaffolding) {
    digest(scaffold.sha256, "test adapter SHA256");
  }
  return { value: m, packageMaps: maps };
}
export function receipt(
  value: unknown,
  phase: string,
  version: string,
  expected: ActualMainExpected,
) {
  const r = object(value, "phase receipt");
  assert(
    r.protocol === 1 && r.status === "success" && r.phase === phase &&
      r.version === version,
    "required phase did not succeed",
  );
  source(r.templateSource, expected);
  lineage(r.run, expected);
  assert(
    r.networkImportsDisabled === true && r.resumedFrom === null,
    "network imports or resumed permission receipt",
  );
  const labels = phase === "releases"
    ? ["actual-main-student", "actual-main-full"]
    : phase === "student-release"
    ? ["actual-main-student"]
    : phase === "full-release"
    ? ["actual-main-full"]
    : ["actual-main-late-current-address"];
  same(
    r.labels,
    labels,
    "wrong original-course labels or fixture25 double count",
  );
  assert(r.caseCount === labels.length, "wrong native case count");
  same(
    r.caseMultiplicity,
    Object.fromEntries(labels.map((l) => [l, 1])),
    "case multiplicity",
  );
  return r;
}
export function observation(
  value: unknown,
  label: string,
  profile: string,
  expected: ActualMainExpected,
) {
  const o = object(value, "direct native observation");
  assert(o.label === label && o.profile === profile, "wrong observation case");
  assert(
    typeof o.attemptId === "string" && o.attemptId.length &&
      Number.isInteger(o.exit),
    "native attempt id/exit missing",
  );
  publicMaps(o.previous, "previous public outputs");
  publicMaps(o.current, "current public outputs");
  const configs = object(o.authorConfigs, "author configs");
  same(
    actualMainFileMap(configs.before, "before config bytes"),
    actualMainFileMap(configs.after, "after config bytes"),
    "author config changed during attempt",
  );
  same(
    configs.before,
    Object.fromEntries(
      Object.entries(expected.template.files).filter(([p]) =>
        /(^|\/)\_quarto[^/]*\.ya?ml$/.test(p)
      ),
    ),
    "author config map is not the complete exact authored source",
  );
  const inputs = object(o.authorInputs, "author root/chapter bytes");
  const originalInputs = Object.fromEntries(
    ["index.qmd", ...ACTUAL_MAIN_INPUTS.book, ...ACTUAL_MAIN_INPUTS.essay].map((
      p,
    ) => [p, expected.template.files[p]]),
  );
  same(
    actualMainFileMap(inputs.before, "before author input bytes"),
    originalInputs,
    "author input map differs from original full course checkout",
  );
  same(
    actualMainFileMap(inputs.after, "after author input bytes"),
    originalInputs,
    "authored root/chapter bytes changed during attempt",
  );
  const members = array(o.nativeMembers, "actual native metadata members");
  same(
    members.map(({ namespace, path, mount, format }) => ({
      namespace,
      path,
      mount,
      format,
    })),
    ACTUAL_MAIN_MEMBERS,
    "all five current native members/PDF required",
  );
  for (const m of members) {
    assert(
      typeof m.output === "string" && m.output.startsWith("/"),
      "actual absolute native output missing",
    );
  }
  same(
    o.ownerInputs,
    ACTUAL_MAIN_INPUTS,
    "original native owner input coverage reduced",
  );
  const owners = object(o.ownerIndexes, "fresh current owner indexes");
  same(
    Object.keys(owners).sort(),
    ["book", "essay"],
    "book/essay owners required",
  );
  for (const owner of Object.values(owners)) {
    digest(object(owner, "owner proof").indexHash, "current index hash");
  }
  assert(
    o.pdf?.path === "handouts/contracts.pdf",
    "actual configured PDF address missing",
  );
  digest(o.pdf.sha256, "current PDF SHA256");
  same(o.checked, {
    rolesArchives: true,
    qrcSearchLinks: true,
    sourceConfigPreserved: true,
    allFive: true,
  }, "original roles/archive/QRC/config checks absent");
  array(o.publicEvents, "public watcher events");
  return o;
}
/** Authenticate one same-channel genuine public baseline before importing bytes. */
export function verifyActualMainRelease(
  release: ActualMainEvidence,
  expected: ActualMainExpected,
) {
  assert(
    PORTAL_VERSIONS.includes(release.version as any) &&
      release.phase === "releases",
    "unsupported genuine baseline channel/phase",
  );
  const m = manifest(release.manifest, "releases", release.version, expected),
    r = receipt(release.receipt, "releases", release.version, expected);
  const successes = array(release.observations, "genuine release observations");
  assert(successes.length === 2, "both genuine baselines required");
  const student = observation(
      successes[0],
      "actual-main-student",
      "student",
      expected,
    ),
    full = observation(successes[1], "actual-main-full", "full", expected);
  for (const o of [student, full]) {
    assert(o.exit === 0, "genuine release failed");
    const other = o.profile === "student" ? "full" : "student";
    same(
      o.current[other],
      o.previous[other],
      "positive release changed other profile",
    );
    assert(
      canonical(o.current[o.profile]) !== canonical(o.previous[o.profile]),
      "genuine baseline kept populated seed",
    );
    same(o.pipeline, [
      "qrc-finished",
      "child-owners-finished",
      "publication-verified",
    ], "native release lifecycle/guard absent");
    assert(
      o.current[o.profile][o.pdf.path] === o.pdf.sha256,
      "current public PDF differs from native proof",
    );
  }
  assert(student.attemptId !== full.attemptId, "positive attempts reused");
  same(
    full.previous,
    student.current,
    "release public-map chain discontinuity",
  );
  const published = object(
    release.publication,
    "complete public baseline archive",
  );
  digest(published.archiveSha256, "public archive SHA256");
  same(
    publicMaps(published.files, "complete genuine public archive maps"),
    full.current,
    "public archive differs from genuine released current trees",
  );
  same(r.publication, published, "release receipt/archive mismatch");
  digest(release.receiptSha256, "release receipt SHA256");
  digest(release.manifestSha256, "release manifest SHA256");
  return { receipt: r, published, student, full, packageMaps: m.packageMaps };
}
export function verifyActualMainChannel(
  release: ActualMainEvidence,
  late: ActualMainEvidence,
  expected: ActualMainExpected,
) {
  const version = release.version;
  assert(
    late.version === version && late.phase === "late",
    "wrong current late channel/phase",
  );
  manifest(late.manifest, "late", version, expected);
  receipt(late.receipt, "late", version, expected);
  const { published, student, full } = verifyActualMainRelease(
      release,
      expected,
    ),
    l = object(late.receipt, "late receipt");
  const baseline = object(l.baseline, "late public baseline lineage");
  lineage(baseline.run, expected);
  assert(
    baseline.version === version &&
      baseline.artifactName === `actual-main-${version}-releases`,
    "not the same-channel release artifact",
  );
  same({
    receiptSha256: baseline.receiptSha256,
    manifestSha256: baseline.manifestSha256,
    publicationArchiveSha256: baseline.publicationArchiveSha256,
  }, {
    receiptSha256: release.receiptSha256,
    manifestSha256: release.manifestSha256,
    publicationArchiveSha256: published.archiveSha256,
  }, "baseline receipt/manifest/archive byte lineage changed");
  same(
    publicMaps(baseline.files, "imported public baseline trees"),
    published.files,
    "baseline trees changed",
  );
  same(
    baseline.transferred,
    ["student-publication", "full-publication"],
    "private proof/state transfer forbidden",
  );
  assert(
    baseline.privateStateTransferred === false,
    "private session/index/capture transfer forbidden",
  );
  const observedLate = array(late.observations, "late observation");
  assert(observedLate.length === 1, "exact one fresh late attempt required");
  const failed = observation(
    observedLate[0],
    "actual-main-late-current-address",
    "student",
    expected,
  );
  assert(
    failed.attemptId !== student.attemptId &&
      failed.attemptId !== full.attemptId,
    "late reused prior native attempt",
  );
  for (const name of ["book", "essay"]) {
    for (const previous of [student, full]) {
      assert(
        failed.ownerIndexes[name].indexHash !==
          previous.ownerIndexes[name].indexHash,
        "late reused prior owner permission index",
      );
    }
  }
  assert(failed.exit !== 0, "late native mutation returned zero");
  same(
    failed.previous,
    published.files,
    "late does not start with genuine baseline bytes",
  );
  same(
    failed.current,
    failed.previous,
    "late failure altered prior publication",
  );
  assert(
    failed.publicEvents.length === 0,
    "late created temporary public files",
  );
  same(failed.pipeline, [
    "qrc-finished",
    "child-owners-finished",
    "pdf-address-mutated",
  ], "late mutation ordering/current boundary wrong");
  same(
    failed.refusal,
    { code: expected.lateRefusal, observed: true },
    "unrelated/nonobserved nonzero is not the required refusal",
  );
  assert(l.expectedFailure === expected.lateRefusal, "false expected refusal");
  const mutation = object(failed.mutation, "actual late PDF mutation");
  assert(
    mutation.kind === "mounted-pdf-byte-drift" &&
      mutation.path === "handouts/contracts.pdf" &&
      mutation.point === "after-child-finish-before-navigation-finish",
    "wrong mutation point/address",
  );
  digest(mutation.beforeSha256, "before PDF hash");
  digest(mutation.afterSha256, "after PDF hash");
  assert(
    mutation.beforeSha256 !== mutation.afterSha256 &&
      mutation.beforeSha256 === failed.pdf.sha256,
    "PDF bytes unchanged or not actual current proof",
  );
  return {
    labels: [
      "actual-main-student",
      "actual-main-full",
      "actual-main-late-current-address",
    ],
    caseCount: 3,
    retainedStudentFull: true,
    freshLatePermissionProof: true,
  };
}
export function aggregateActualMain(
  evidence: ActualMainEvidence[],
  expected: ActualMainExpected,
) {
  assert(
    typeof expected.lateRefusal === "string" && expected.lateRefusal.length &&
      !expected.lateRefusal.startsWith("UNFROZEN"),
    "precise provider refusal is not frozen",
  );
  same(Object.keys(expected.providers).sort(), [
    "core",
    "download",
    "publisher",
    "qrc",
  ], "expected provider set");
  actualMainFileMap(expected.template.files, "expected source bytes");
  same(
    evidence.map((e) => `${e.version}/${e.phase}`).sort(),
    PORTAL_VERSIONS.flatMap((v) => ACTUAL_MAIN_PHASES.map((p) => `${v}/${p}`))
      .sort(),
    "required both-channel release/late artifact matrix",
  );
  const channels: Record<string, unknown> = {};
  let packages: unknown;
  for (const version of PORTAL_VERSIONS) {
    const release = evidence.find((e) =>
        e.version === version && e.phase === "releases"
      )!,
      late = evidence.find((e) => e.version === version && e.phase === "late")!;
    for (const item of [release, late]) {
      const m = manifest(
        item.manifest,
        assertActualMainPhase(item.phase),
        version,
        expected,
      );
      receipt(
        item.receipt,
        assertActualMainPhase(item.phase),
        version,
        expected,
      );
      if (packages === undefined) packages = m.packageMaps;
      else {same(
          m.packageMaps,
          packages,
          "different installed package bytes between phases/channels",
        );}
    }
    channels[version] = verifyActualMainChannel(release, late, expected);
  }
  return {
    protocol: 1,
    status: "success",
    scope: "original-course managed portal, distinct from fixture25",
    templateSource: expected.template,
    providers: expected.providers,
    run: expected.run,
    channels,
    totalNativeCases: 6,
    packageFiles: packages,
    resumedFrom: null,
    networkImportsDisabled: true,
  };
}
