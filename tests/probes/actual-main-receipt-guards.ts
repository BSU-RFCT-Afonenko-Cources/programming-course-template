// Synthetic evidence transport only; never a native course success claim.
import {
  ACTUAL_MAIN_INPUTS,
  ACTUAL_MAIN_INSTALLATIONS,
  ACTUAL_MAIN_MEMBERS,
  aggregateActualMain,
  assertActualMainPhase,
} from "./actual-main-contract.ts";
const h = (n: number, size = 40) => n.toString(16).padStart(size, "0");
const files = (n: number) => ({
  "index.html": h(n, 64),
  "deep/a.txt": h(n + 1, 64),
  "handouts/contracts.pdf": h(n + 2, 64),
});
export const expected = {
  template: {
    commit: h(1),
    tree: h(2),
    files: Object.fromEntries(
      [
        "_quarto.yml",
        "_quarto-student.yml",
        "book/_quarto.yml",
        "essay/_quarto.yaml",
        "index.qmd",
        ...ACTUAL_MAIN_INPUTS.book,
        ...ACTUAL_MAIN_INPUTS.essay,
        ...["prepare", "finish", "verify", "state", "verification"].map((p) =>
          `fixtures/probes/actual-main/${p}.ts`
        ),
      ].map((p, i) => [p, h(10 + i, 64)]),
    ),
  },
  providers: Object.fromEntries(
    ["core", "download", "publisher", "qrc"].map((
      name,
      i,
    ) => [name, { commit: h(30 + i), tree: h(40 + i) }]),
  ),
  run: { repository: "synthetic/template", runId: "100" },
  lateRefusal: "SYNTHETIC_CURRENT_ADDRESS_CHANGED",
};
export function fixture() {
  const configs = Object.fromEntries(
    Object.entries(expected.template.files).filter(([p]) =>
      /(^|\/)\_quarto[^/]*\.ya?ml$/.test(p)
    ),
  );
  const sources = Object.fromEntries(
    ["index.qmd", ...ACTUAL_MAIN_INPUTS.book, ...ACTUAL_MAIN_INPUTS.essay].map((
      p,
    ) => [p, expected.template.files[p]]),
  );
  return ["1.10.18", "1.11.5"].flatMap((version, channel) => {
    const source = { ...expected.template, dirty: false };
    const packages = [
      "course-core",
      "course-navigation",
      "course-presentation",
      "project-download",
      "project-publish",
      "reference-catalog",
    ].map((name, i) => ({
      name,
      archiveSha256: h(50 + i, 64),
      files: { "payload.txt": h(60 + i, 64) },
    }));
    const manifest = (phase: string) => ({
      protocol: 1,
      phase,
      templateSource: source,
      run: { ...expected.run, runAttempt: "1" },
      versions: { quarto: version, cue: "cue version v0.17.1" },
      companionSources: Object.entries(expected.providers).map(([name, r]) => ({
        name,
        ...r,
        dirty: false,
      })),
      packages,
      installations: ACTUAL_MAIN_INSTALLATIONS.map((i) => ({
        ...i,
        files: packages.find((p) => p.name === i.name)!.files,
      })),
      sourceInputs: { student: ACTUAL_MAIN_INPUTS, full: ACTUAL_MAIN_INPUTS },
      members: ACTUAL_MAIN_MEMBERS,
      scaffolding: ["prepare", "finish", "verify", "state", "verification"].map(
        (p) => ({
          source: `fixtures/probes/actual-main/${p}.ts`,
          target: `_publication/${p}.ts`,
          sha256:
            expected.template.files[`fixtures/probes/actual-main/${p}.ts`],
        }),
      ),
    });
    let current = { student: files(100 + channel), full: files(110 + channel) };
    const observations = ["student", "full"].map((profile, i) => {
      const previous = structuredClone(current);
      current = { ...current, [profile]: files(120 + channel * 5 + i) };
      return {
        label: `actual-main-${profile}`,
        profile,
        attemptId: `attempt-${channel}-${i}`,
        exit: 0,
        previous,
        current: structuredClone(current),
        authorConfigs: {
          before: structuredClone(configs),
          after: structuredClone(configs),
        },
        authorInputs: {
          before: structuredClone(sources),
          after: structuredClone(sources),
        },
        publicEvents: [{ kind: "rename" }],
        nativeMembers: ACTUAL_MAIN_MEMBERS.map((m) => ({
          ...m,
          output: `/current/${channel}/${i}/${m.namespace}`,
        })),
        ownerInputs: ACTUAL_MAIN_INPUTS,
        pipeline: [
          "qrc-finished",
          "child-owners-finished",
          "publication-verified",
        ],
        ownerIndexes: {
          book: { indexHash: h(160 + i + channel * 10, 64) },
          essay: { indexHash: h(170 + i + channel * 10, 64) },
        },
        pdf: {
          path: "handouts/contracts.pdf",
          sha256:
            current[profile as "student" | "full"]["handouts/contracts.pdf"],
        },
        checked: {
          rolesArchives: true,
          qrcSearchLinks: true,
          sourceConfigPreserved: true,
          allFive: true,
        },
      };
    });
    const receipt = (phase: string, labels: string[]) => ({
      protocol: 1,
      status: "success",
      phase,
      version,
      templateSource: source,
      run: { ...expected.run, runAttempt: "1" },
      labels,
      caseCount: labels.length,
      caseMultiplicity: Object.fromEntries(labels.map((p) => [p, 1])),
      networkImportsDisabled: true,
      resumedFrom: null,
    });
    const publication = {
      archiveSha256: h(210 + channel, 64),
      files: structuredClone(current),
    };
    const release = {
      version,
      phase: "releases",
      manifest: manifest("releases"),
      receipt: {
        ...receipt("releases", ["actual-main-student", "actual-main-full"]),
        publication,
      },
      observations,
      receiptSha256: h(220 + channel, 64),
      manifestSha256: h(230 + channel, 64),
      publication,
    };
    const late = {
      version,
      phase: "late",
      manifest: manifest("late"),
      receipt: {
        ...receipt("late", ["actual-main-late-current-address"]),
        expectedFailure: expected.lateRefusal,
        baseline: {
          artifactName: `actual-main-${version}-releases`,
          run: { ...expected.run, runAttempt: "1" },
          version,
          receiptSha256: release.receiptSha256,
          manifestSha256: release.manifestSha256,
          publicationArchiveSha256: publication.archiveSha256,
          files: structuredClone(current),
          transferred: ["student-publication", "full-publication"],
          privateStateTransferred: false,
        },
      },
      observations: [{
        ...structuredClone(observations[0]),
        label: "actual-main-late-current-address",
        attemptId: `late-${channel}`,
        exit: 1,
        previous: structuredClone(current),
        current: structuredClone(current),
        publicEvents: [],
        pipeline: [
          "qrc-finished",
          "child-owners-finished",
          "pdf-address-mutated",
        ],
        ownerIndexes: {
          book: { indexHash: h(250 + channel, 64) },
          essay: { indexHash: h(260 + channel, 64) },
        },
        mutation: {
          kind: "mounted-pdf-byte-drift",
          path: "handouts/contracts.pdf",
          beforeSha256: observations[0].pdf.sha256,
          afterSha256: h(280 + channel, 64),
          point: "after-child-finish-before-navigation-finish",
        },
        refusal: { code: expected.lateRefusal, observed: true },
      }],
    };
    return [release, late];
  });
}
export function runActualMainReceiptGuards() {
  let count = 0;
  function check(value: unknown, message: string) {
    if (!value) throw new Error(`ACTUAL_MAIN_GUARD: ${message}`);
  }
  function refuses(label: string, mutate: (x: any[]) => void) {
    const x = structuredClone(fixture());
    mutate(x);
    let error;
    try {
      aggregateActualMain(x, expected);
    } catch (e) {
      error = e;
    }
    check(error instanceof Error, `accepted ${label}`);
    count++;
  }
  check(
    aggregateActualMain(fixture(), expected).totalNativeCases === 6,
    "six original-course labels across two channels",
  );
  count++;
  for (const phase of ["releases", "late"]) {
    check(assertActualMainPhase(phase) === phase, "required phase refused");
  }
  for (const phase of ["student", "full", "smoke", "resume", "", "all25"]) {
    let refused = false;
    try {
      assertActualMainPhase(phase);
    } catch {
      refused = true;
    }
    check(refused, `accepted subset ${phase}`);
    count++;
  }
  refuses("missing required channel/phase", (x) => x.pop());
  refuses("duplicate required artifact", (x) => x[3] = structuredClone(x[1]));
  refuses(
    "failed required job receipt",
    (x) => x[0].receipt.status = "failure",
  );
  refuses(
    "source head mismatch",
    (x) => x[0].receipt.templateSource.commit = h(300),
  );
  refuses(
    "missing exact scaffolding bytes",
    (x) => delete x[0].manifest.scaffolding,
  );
  refuses(
    "unsigned scaffold source",
    (x) => x[0].manifest.scaffolding[0].sha256 = h(399, 64),
  );
  refuses(
    "scaffold mutates author config",
    (x) => x[0].manifest.scaffolding[0].target = "_quarto.yml",
  );
  refuses("all artifacts share wrong source bytes", (x) => {
    for (const item of x) {
      item.receipt.templateSource.files["index.qmd"] = h(301, 64);
      item.manifest.templateSource = structuredClone(
        item.receipt.templateSource,
      );
    }
  });
  refuses("dirty source", (x) => x[0].manifest.templateSource.dirty = true);
  refuses(
    "provider ref mismatch",
    (x) => x[0].manifest.companionSources[0].commit = h(302),
  );
  refuses(
    "provider tree mismatch",
    (x) => x[0].manifest.companionSources[0].tree = h(303),
  );
  refuses(
    "dirty provider",
    (x) => x[0].manifest.companionSources[0].dirty = true,
  );
  refuses("missing package", (x) => x[0].manifest.packages.pop());
  refuses(
    "changed package file map",
    (x) => x[0].manifest.packages[0].files = files(304),
  );
  refuses(
    "changed actual installation",
    (x) => x[0].manifest.installations[0].files = files(305),
  );
  refuses(
    "missing member installation",
    (x) => x[0].manifest.installations.pop(),
  );
  refuses(
    "wrong channel version",
    (x) => x[0].manifest.versions.quarto = "1.11.5",
  );
  refuses(
    "wrong run lineage",
    (x) => x[1].receipt.baseline.run.runId = "previous-run",
  );
  refuses(
    "wrong baseline channel",
    (x) => x[1].receipt.baseline.version = "1.11.5",
  );
  refuses(
    "changed baseline receipt bytes",
    (x) => x[1].receipt.baseline.receiptSha256 = h(306, 64),
  );
  refuses(
    "changed baseline archive bytes",
    (x) => x[1].receipt.baseline.publicationArchiveSha256 = h(307, 64),
  );
  refuses("missing public tree", (x) => delete x[0].publication.files.full);
  refuses("empty public tree", (x) => x[0].publication.files.full = {});
  refuses("private session tree transferred", (x) => {
    x[1].receipt.baseline.transferred.push("owner-session");
    x[1].receipt.baseline.privateStateTransferred = true;
  });
  refuses(
    "private state in public archive map",
    (x) =>
      x[0].publication.files.student[".project-publish/session.json"] = h(
        308,
        64,
      ),
  );
  refuses(
    "public archive differs from genuine current output",
    (x) => x[0].publication.files.student = files(309),
  );
  refuses(
    "late baseline tree changed",
    (x) => x[1].receipt.baseline.files.student = files(310),
  );
  refuses(
    "late previous tree differs from imported baseline",
    (x) => x[1].observations[0].previous.student = files(311),
  );
  refuses(
    "failed late changed prior output",
    (x) => x[1].observations[0].current.student = files(312),
  );
  refuses(
    "late temporary public file event",
    (x) => x[1].observations[0].publicEvents.push({ kind: "create" }),
  );
  refuses("no genuine baseline success", (x) => x[0].observations[1].exit = 1);
  refuses(
    "baseline retains seed bytes",
    (x) => x[0].observations[0].current = x[0].observations[0].previous,
  );
  refuses(
    "release chain discontinuity",
    (x) => x[0].observations[1].previous.student = files(313),
  );
  refuses(
    "success changes opposite profile",
    (x) => x[0].observations[0].current.full = files(314),
  );
  refuses(
    "book source subset",
    (x) => x[0].manifest.sourceInputs.full.book = ["book/index.qmd"],
  );
  refuses(
    "essay source subset",
    (x) => x[0].observations[0].ownerInputs.essay = ["essay/index.qmd"],
  );
  refuses(
    "missing native member",
    (x) => x[0].observations[0].nativeMembers.pop(),
  );
  refuses(
    "PDF changed to HTML",
    (x) => x[0].observations[0].nativeMembers.at(-1).format = "html",
  );
  refuses(
    "late reuses previous attempt",
    (x) => x[1].observations[0].attemptId = x[0].observations[0].attemptId,
  );
  refuses(
    "late reuses previous owner index",
    (x) =>
      x[1].observations[0].ownerIndexes.book.indexHash =
        x[0].observations[0].ownerIndexes.book.indexHash,
  );
  refuses(
    "late native command returned zero",
    (x) => x[1].observations[0].exit = 0,
  );
  refuses(
    "unrelated nonzero accepted",
    (x) => x[1].observations[0].refusal.code = "UNRELATED_FAILURE",
  );
  refuses(
    "refusal not observed",
    (x) => x[1].observations[0].refusal.observed = false,
  );
  refuses(
    "mutation before child finish",
    (x) =>
      x[1].observations[0].pipeline = [
        "qrc-finished",
        "pdf-address-mutated",
        "child-owners-finished",
      ],
  );
  refuses(
    "wrong mutated path",
    (x) => x[1].observations[0].mutation.path = "book/assets/contract.svg",
  );
  refuses(
    "mutation has no byte change",
    (x) =>
      x[1].observations[0].mutation.afterSha256 =
        x[1].observations[0].mutation.beforeSha256,
  );
  refuses(
    "author config changed",
    (x) => x[0].observations[0].authorConfigs.after = files(315),
  );
  refuses("config subset before and after", (x) => {
    delete x[0].observations[0].authorConfigs.before["book/_quarto.yml"];
    delete x[0].observations[0].authorConfigs.after["book/_quarto.yml"];
  });
  refuses("configs consistently differ from authored source", (x) => {
    x[0].observations[0].authorConfigs.before["_quarto.yml"] = h(316, 64);
    x[0].observations[0].authorConfigs.after["_quarto.yml"] = h(316, 64);
  });
  refuses(
    "chapter changed during attempt",
    (x) =>
      x[0].observations[0].authorInputs.after["book/index.qmd"] = h(317, 64),
  );
  refuses("chapter subset before and after", (x) => {
    delete x[0].observations[0].authorInputs
      .before["essay/text/decoding/index.qmd"];
    delete x[0].observations[0].authorInputs
      .after["essay/text/decoding/index.qmd"];
  });
  refuses("chapters consistently differ from authored source", (x) => {
    x[0].observations[0].authorInputs.before["book/index.qmd"] = h(318, 64);
    x[0].observations[0].authorInputs.after["book/index.qmd"] = h(318, 64);
  });
  refuses(
    "resumed permission receipt",
    (x) => x[1].receipt.resumedFrom = "old-session",
  );
  refuses(
    "network imports allowed",
    (x) => x[1].receipt.networkImportsDisabled = false,
  );
  refuses(
    "roles/archive check missing",
    (x) => x[0].observations[0].checked.rolesArchives = false,
  );
  refuses(
    "labels double-count fixture25",
    (x) => x[0].receipt.labels[0] = "main-five-student",
  );
  console.log(
    `PASS actual-main receipt guards: ${count} checks; synthetic transport only`,
  );
}
if (import.meta.main) runActualMainReceiptGuards();
