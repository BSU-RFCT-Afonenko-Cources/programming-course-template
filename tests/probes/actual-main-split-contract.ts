// Finite original-course phase transport. Provider APIs retain ownership policy.
import { canonical, PORTAL_VERSIONS } from "./portal-contract.ts";
import {
  type ActualMainEvidence,
  type ActualMainExpected,
  actualMainFileMap,
  manifest,
  observation,
  receipt,
} from "./actual-main-contract.ts";
export const MAIN_SPLIT_PHASES = [
  "student-release",
  "full-release",
  "late",
] as const;
export type MainSplitPhase = typeof MAIN_SPLIT_PHASES[number];
export type MainRunnerPhase = MainSplitPhase | "releases";
export interface SplitEvidence extends ActualMainEvidence {
  publicBaseline?: unknown;
  publicBaselineSha256?: string;
}
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`ACTUAL_MAIN_SPLIT: ${message}`);
}
function same(a: unknown, b: unknown, name: string) {
  assert(canonical(a) === canonical(b), name);
}
function keys(value: any, expected: string[], name: string) {
  assert(value && typeof value === "object" && !Array.isArray(value), name);
  same(
    Object.keys(value).sort(),
    expected.slice().sort(),
    `${name}: unknown/private/missing fields`,
  );
}
function digest(value: unknown, name: string) {
  assert(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), name);
}
function maps(value: any) {
  keys(value, ["student", "full"], "public trees");
  for (const profile of ["student", "full"]) {
    const files = actualMainFileMap(value[profile], `public ${profile}`);
    assert(Object.keys(files).length >= 2, "populated public tree required");
    for (const path of Object.keys(files)) {
      assert(
        !path.split("/").some((part) =>
          [".project-publish", ".quarto", ".course-owner", ".git"].includes(
            part,
          )
        ),
        "private state is not public retention input",
      );
    }
  }
  return value;
}
export function assertMainRunnerPhase(value: unknown): MainRunnerPhase {
  assert(
    [...MAIN_SPLIT_PHASES, "releases"].includes(value as any),
    `unsupported finite phase/subset ${value}`,
  );
  return value as MainRunnerPhase;
}
/** A portable baseline contains only completed public bytes and safe lineage. */
export function verifyPublicBaseline(
  value: any,
  phase: "student-release" | "full-release",
  version: string,
  expected: ActualMainExpected,
  packageFiles: unknown,
) {
  keys(value, [
    "protocol",
    "status",
    "scope",
    "phase",
    "version",
    "manifest",
    "nativeReceiptSha256",
    "manifestSha256",
    "published",
    "completed",
    ...(phase === "full-release" ? ["parent"] : []),
  ], "public baseline");
  assert(
    value.protocol === 1 && value.status === "success" &&
      value.scope === "completed public retention" && value.phase === phase &&
      value.version === version,
    "public baseline scope/channel did not succeed",
  );
  const m = value.manifest;
  keys(m, [
    "protocol",
    "phase",
    "templateSource",
    "run",
    "versions",
    "companionSources",
    "packages",
    "installations",
    "sourceInputs",
    "members",
    "scaffolding",
  ], "safe source/install manifest");
  keys(m.templateSource, ["commit", "tree", "dirty", "files"], "safe source");
  keys(m.run, ["repository", "runId", "runAttempt"], "safe run");
  keys(m.versions, ["quarto", "cue"], "safe versions");
  for (const p of m.companionSources) {
    keys(p, ["name", "commit", "tree", "dirty"], "safe provider");
  }
  for (const p of m.packages) {
    keys(p, ["name", "archiveSha256", "files"], "safe package");
  }
  for (const p of m.installations) {
    keys(p, ["name", "scope", "method", "files"], "safe installation");
  }
  for (const p of m.members) {
    keys(p, ["namespace", "path", "mount", "format"], "safe member");
  }
  for (const p of m.scaffolding) {
    keys(p, ["source", "target", "sha256"], "safe test adapter");
  }
  const verified = manifest(m, phase, version, expected);
  same(
    verified.packageMaps,
    packageFiles,
    "public baseline differs from fresh complete installed bytes",
  );
  digest(value.nativeReceiptSha256, "native receipt lineage");
  digest(value.manifestSha256, "manifest lineage");
  keys(value.published, ["archiveSha256", "files"], "public archive");
  digest(value.published.archiveSha256, "archive lineage");
  maps(value.published.files);
  keys(
    value.completed,
    ["labels", "attempts"],
    "completed public observations",
  );
  const profiles = phase === "student-release"
    ? ["student"]
    : ["student", "full"];
  same(
    value.completed.labels,
    profiles.map((p) => `actual-main-${p}`),
    "not the required completed public labels",
  );
  keys(value.completed.attempts, profiles, "completed attempt lineage");
  for (const p of profiles) {
    assert(
      typeof value.completed.attempts[p] === "string" &&
        value.completed.attempts[p].length,
      "completed attempt id absent",
    );
    digest(
      value.published.files[p]["handouts/contracts.pdf"],
      "completed original-course public PDF is missing",
    );
  }
  if (phase === "full-release") {
    assert(
      value.completed.attempts.student !== value.completed.attempts.full,
      "positive native attempt reused",
    );
    keys(value.parent, [
      "artifactName",
      "publicReceiptSha256",
      "publicationArchiveSha256",
    ], "public parent lineage");
    assert(
      value.parent.artifactName ===
        `actual-main-public-${version}-student-release`,
      "wrong same-channel public parent",
    );
    digest(value.parent.publicReceiptSha256, "public parent receipt lineage");
    digest(
      value.parent.publicationArchiveSha256,
      "public parent archive lineage",
    );
  }
  return value;
}
export function verifySingleRelease(
  item: SplitEvidence,
  expected: ActualMainExpected,
) {
  assert(
    PORTAL_VERSIONS.includes(item.version as any) &&
      ["student-release", "full-release"].includes(item.phase),
    "unsupported positive phase/channel",
  );
  const m = manifest(item.manifest, item.phase, item.version, expected),
    r = receipt(item.receipt, item.phase, item.version, expected);
  assert(
    Array.isArray(item.observations) && item.observations.length === 1,
    "exactly one actual positive attempt required",
  );
  const profile = item.phase === "student-release" ? "student" : "full",
    o = observation(
      item.observations[0],
      `actual-main-${profile}`,
      profile,
      expected,
    );
  assert(o.exit === 0, "genuine positive native attempt failed");
  const other = profile === "student" ? "full" : "student";
  same(
    o.current[other],
    o.previous[other],
    "positive changed opposite public profile",
  );
  assert(
    canonical(o.current[profile]) !== canonical(o.previous[profile]),
    "positive kept populated previous seed",
  );
  same(o.pipeline, [
    "qrc-finished",
    "child-owners-finished",
    "publication-verified",
  ], "current positive lifecycle/guard absent");
  assert(
    o.current[profile][o.pdf.path] === o.pdf.sha256,
    "published PDF differs from current native proof",
  );
  keys(r.publication, ["archiveSha256", "files"], "positive public export");
  digest(r.publication.archiveSha256, "positive public archive SHA");
  same(
    maps(r.publication.files),
    o.current,
    "positive archive differs from complete current trees",
  );
  digest(item.receiptSha256, "positive native receipt SHA");
  digest(item.manifestSha256, "positive manifest SHA");
  return { manifest: m, receipt: r, observation: o, published: r.publication };
}
export function publicBaseline(
  item: SplitEvidence,
  expected: ActualMainExpected,
  parent?: { value: any; sha256: string },
) {
  const verified = verifySingleRelease(item, expected),
    profile = item.phase === "student-release" ? "student" : "full";
  assert(
    profile === "student" ? !parent : !!parent,
    "public release parent scope",
  );
  if (parent) {
    verifyPublicBaseline(
      parent.value,
      "student-release",
      item.version,
      expected,
      verified.manifest.packageMaps,
    );
  }
  if (parent) {
    same(
      verified.observation.previous,
      parent.value.published.files,
      "full starts outside genuine imported public trees",
    );
    same(verified.receipt.baseline, {
      artifactName: `actual-main-public-${item.version}-student-release`,
      publicReceiptSha256: parent.sha256,
      publicationArchiveSha256: parent.value.published.archiveSha256,
      files: parent.value.published.files,
      transferred: ["student-publication", "full-publication"],
      privateStateTransferred: false,
    }, "full public input lineage changed or private transfer");
  }
  const value = {
    protocol: 1,
    status: "success",
    scope: "completed public retention",
    phase: item.phase,
    version: item.version,
    manifest: item.manifest,
    nativeReceiptSha256: item.receiptSha256,
    manifestSha256: item.manifestSha256,
    published: verified.published,
    completed: {
      labels: profile === "student"
        ? ["actual-main-student"]
        : ["actual-main-student", "actual-main-full"],
      attempts: {
        ...(parent ? parent.value.completed.attempts : {}),
        [profile]: verified.observation.attemptId,
      },
    },
    ...(parent
      ? {
        parent: {
          artifactName: `actual-main-public-${item.version}-student-release`,
          publicReceiptSha256: parent.sha256,
          publicationArchiveSha256: parent.value.published.archiveSha256,
        },
      }
      : {}),
  };
  return verifyPublicBaseline(
    value,
    item.phase as "student-release" | "full-release",
    item.version,
    expected,
    verified.manifest.packageMaps,
  );
}
export function verifyLateFromPublic(
  item: SplitEvidence,
  prior: any,
  expected: ActualMainExpected,
  publicReceiptSha256: string,
) {
  const m = manifest(item.manifest, "late", item.version, expected),
    r = receipt(item.receipt, "late", item.version, expected);
  verifyPublicBaseline(
    prior,
    "full-release",
    item.version,
    expected,
    m.packageMaps,
  );
  digest(publicReceiptSha256, "late public parent receipt SHA");
  same(r.baseline, {
    artifactName: `actual-main-public-${item.version}-full-release`,
    publicReceiptSha256,
    publicationArchiveSha256: prior.published.archiveSha256,
    files: prior.published.files,
    transferred: ["student-publication", "full-publication"],
    privateStateTransferred: false,
  }, "late public input lineage changed or private transfer");
  assert(
    !expected.lateRefusal.startsWith("UNFROZEN"),
    "documented specific late refusal is not frozen",
  );
  assert(
    Array.isArray(item.observations) && item.observations.length === 1,
    "exact one fresh late attempt",
  );
  const failed = observation(
    item.observations[0],
    "actual-main-late-current-address",
    "student",
    expected,
  );
  assert(
    !Object.values(prior.completed.attempts).includes(failed.attemptId),
    "late reused prior native attempt",
  );
  assert(
    failed.exit !== 0 && r.expectedFailure === expected.lateRefusal,
    "late returned zero or wrong failure",
  );
  same(
    failed.previous,
    prior.published.files,
    "late baseline is not genuine public bytes",
  );
  same(failed.current, failed.previous, "late altered prior publications");
  assert(
    failed.publicEvents.length === 0,
    "late created temporary public files",
  );
  same(failed.pipeline, [
    "qrc-finished",
    "child-owners-finished",
    "pdf-address-mutated",
  ], "wrong current mutation ordering");
  same(
    failed.refusal,
    { code: expected.lateRefusal, observed: true },
    "unrelated/nonobserved native refusal",
  );
  const mutation = failed.mutation;
  keys(
    mutation,
    ["kind", "path", "point", "beforeSha256", "afterSha256"],
    "current PDF mutation",
  );
  assert(
    mutation.kind === "mounted-pdf-byte-drift" &&
      mutation.path === "handouts/contracts.pdf" &&
      mutation.point === "after-child-finish-before-navigation-finish",
    "wrong documented current mutation",
  );
  digest(mutation.beforeSha256, "before PDF SHA");
  digest(mutation.afterSha256, "after PDF SHA");
  assert(
    mutation.beforeSha256 === failed.pdf.sha256 &&
      mutation.beforeSha256 !== mutation.afterSha256,
    "no actual current PDF byte change",
  );
  return failed;
}
export function aggregateSplitActualMain(
  items: SplitEvidence[],
  expected: ActualMainExpected,
) {
  same(
    items.map((p) => `${p.version}/${p.phase}`).sort(),
    PORTAL_VERSIONS.flatMap((v) => MAIN_SPLIT_PHASES.map((p) => `${v}/${p}`))
      .sort(),
    "required six original native jobs/receipts",
  );
  const channels: Record<string, unknown> = {};
  let packageFiles: unknown;
  for (const version of PORTAL_VERSIONS) {
    const student = items.find((p) =>
        p.version === version && p.phase === "student-release"
      )!,
      full = items.find((p) =>
        p.version === version && p.phase === "full-release"
      )!,
      late = items.find((p) => p.version === version && p.phase === "late")!;
    const s = verifySingleRelease(student, expected),
      f = verifySingleRelease(full, expected);
    for (const item of [student, full, late]) {
      digest(item.receiptSha256, "required phase receipt SHA");
      digest(item.manifestSha256, "required phase manifest SHA");
    }
    for (
      const m of [
        s.manifest,
        f.manifest,
        manifest(late.manifest, "late", version, expected),
      ]
    ) {
      if (packageFiles === undefined) packageFiles = m.packageMaps;
      else {same(
          m.packageMaps,
          packageFiles,
          "phase/channel installed bytes changed",
        );}
    }
    const sp = verifyPublicBaseline(
        student.publicBaseline,
        "student-release",
        version,
        expected,
        packageFiles,
      ),
      fp = verifyPublicBaseline(
        full.publicBaseline,
        "full-release",
        version,
        expected,
        packageFiles,
      );
    for (const [item, p] of [[student, sp], [full, fp]] as const) {
      digest(item.publicBaselineSha256, "public baseline receipt SHA");
      same(
        p.manifest,
        item.manifest,
        "public export manifest differs from actual native job",
      );
      same({
        receipt: p.nativeReceiptSha256,
        manifest: p.manifestSha256,
        published: p.published,
      }, {
        receipt: item.receiptSha256,
        manifest: item.manifestSha256,
        published: (item.receipt as any).publication,
      }, "public lineage differs from actual completed job");
    }
    same(
      f.observation.previous,
      s.observation.current,
      "fresh full does not retain genuine student public trees",
    );
    assert(
      s.observation.attemptId !== f.observation.attemptId,
      "positive attempts reused",
    );
    same(fp.completed.attempts, {
      student: s.observation.attemptId,
      full: f.observation.attemptId,
    }, "completed public native attempts changed");
    same(fp.parent, {
      artifactName: `actual-main-public-${version}-student-release`,
      publicReceiptSha256: student.publicBaselineSha256,
      publicationArchiveSha256: sp.published.archiveSha256,
    }, "full imported wrong public lineage");
    for (
      const [item, parent, expectedPhase] of [[full, sp, "student-release"], [
        late,
        fp,
        "full-release",
      ]] as const
    ) {
      const b = (item.receipt as any).baseline;
      keys(b, [
        "artifactName",
        "publicReceiptSha256",
        "publicationArchiveSha256",
        "files",
        "transferred",
        "privateStateTransferred",
      ], "imported public lineage");
      const parentItem = expectedPhase === "student-release" ? student : full;
      same(
        b,
        {
          artifactName: `actual-main-public-${version}-${expectedPhase}`,
          publicReceiptSha256: parentItem.publicBaselineSha256,
          publicationArchiveSha256: parent.published.archiveSha256,
          files: parent.published.files,
          transferred: ["student-publication", "full-publication"],
          privateStateTransferred: false,
        },
        "wrong same-run/channel/source public input or private proof transfer",
      );
    }
    const failed = verifyLateFromPublic(
      late,
      fp,
      expected,
      full.publicBaselineSha256!,
    );
    for (const name of ["book", "essay"]) {
      for (const prior of [s.observation, f.observation]) {
        assert(
          failed.ownerIndexes[name].indexHash !==
            prior.ownerIndexes[name].indexHash,
          "late permission index reused",
        );
      }
    }
    channels[version] = {
      labels: [
        "actual-main-student",
        "actual-main-full",
        "actual-main-late-current-address",
      ],
      phases: [...MAIN_SPLIT_PHASES],
      caseCount: 3,
      retainedStudentFull: true,
      freshLatePermissionProof: true,
    };
  }
  return {
    protocol: 1,
    status: "success",
    scope: "original-course split native jobs, distinct from fixture25",
    templateSource: expected.template,
    providers: expected.providers,
    run: expected.run,
    channels,
    totalNativeCases: 6,
    packageFiles,
    resumedFrom: null,
    networkImportsDisabled: true,
  };
}
