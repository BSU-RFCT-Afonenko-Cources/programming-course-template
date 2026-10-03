// Synthetic transport guards only; these do not claim a native portal result.
import {
  aggregatePortalReceipts,
  parsePortalPhase,
  PORTAL_CASES,
  PORTAL_PHASES,
  PORTAL_VERSIONS,
  verifyPhaseObservations,
} from "./portal-contract.ts";
const h = (n: number, size = 40) => n.toString(16).padStart(size, "0");
const expected = {
  template: {
    commit: h(1),
    tree: h(2),
    files: { "tests/probes/portal-consumer.ts": h(20, 64) },
  },
  providers: Object.fromEntries(
    ["publisher", "qrc", "core", "download"].map((name, i) => [
      name,
      { commit: h(i + 3), tree: h(i + 7) },
    ]),
  ),
};
function fixture() {
  return PORTAL_VERSIONS.flatMap((version) =>
    PORTAL_PHASES.map((phase) => {
      const cases = PORTAL_CASES[phase];
      const templateSource = {
        ...expected.template,
        dirty: false,
        files: { "tests/probes/portal-consumer.ts": h(20, 64) },
      };
      const packages = [
        "project-publish",
        "reference-catalog",
        "course-core",
        "course-presentation",
        "course-navigation",
        "project-download",
      ].map((name, i) => ({
        name,
        archiveSha256: h(30 + i, 64),
        files: { "payload.txt": h(40 + i, 64) },
      }));
      return {
        version,
        phase,
        receipt: {
          protocol: 1,
          status: "success",
          phase,
          templateSource,
          expectedLabels: cases.map((c) => c.label),
          expectedCount: cases.length,
          caseMultiplicity: Object.fromEntries(cases.map((c) => [c.label, 1])),
          networkImportsDisabled: true,
          resumedFrom: null,
          aggregateFullProfilesPreserved: true,
          results: cases.map((c) => ({
            ...c,
            exit: c.expectedFailure ? 1 : 0,
            milliseconds: 100,
            previousStudentPreserved: !!c.expectedFailure ||
              c.profile === "full",
            previousFullPreserved: !!c.expectedFailure ||
              c.profile === "student",
            publicEvents: c.expectedFailure ? 0 : 2,
          })),
        },
        manifest: {
          protocol: 1,
          phase,
          templateSource,
          versions: { quarto: version, cue: "cue version v0.17.1" },
          companionSources: Object.entries(expected.providers).map(
            ([name, source]) => ({ name, ...source, dirty: false }),
          ),
          packages,
          installations: [
            ...packages.map((p) => ({
              corpus: phase,
              scope:
                ["course-presentation", "course-navigation"].includes(p.name)
                  ? "external"
                  : "root",
              method: "quarto-add",
              name: p.name,
              files: p.files,
            })),
            ...(phase === "composition" ? [["tasks", "course-core"]] : [
              ["book", "course-core"],
              ["book", "project-download"],
              ...["book", "essay", "lectures", "practice"].map((
                scope,
              ) => [scope, "course-presentation"]),
              ...["lectures", "practice"].map((
                scope,
              ) => [scope, "course-navigation"]),
            ]).map(([scope, name]) => ({
              corpus: phase,
              scope,
              method: "member-copy",
              name,
              files: packages.find((p) => p.name === name)!.files,
            })),
          ],
        },
      };
    })
  );
}
let passed = 0;
function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`PORTAL_RECEIPT_TEST: ${message}`);
}
function refuses(label: string, mutate: (data: any[]) => void) {
  const data = structuredClone(fixture());
  mutate(data);
  let error: unknown;
  try {
    aggregatePortalReceipts(data, expected);
  } catch (caught) {
    error = caught;
  }
  check(error instanceof Error, `accepted ${label}`);
  passed++;
}
const result = aggregatePortalReceipts(fixture(), expected);
check(result.totalNativeCases === 50, "both channels must contain25 each");
check(parsePortalPhase(undefined) === "all", "default must remain all25");
for (const phase of PORTAL_PHASES) {
  check(parsePortalPhase(phase) === phase, "fixed phase rejected");
}
for (const value of ["smoke", "resume", "", "composition,main-five"]) {
  let failed = false;
  try {
    parsePortalPhase(value);
  } catch {
    failed = true;
  }
  check(failed, `unsupported phase ${value}`);
}
passed++;
refuses("missing required phase", (x) => x.pop());
refuses("duplicate phase", (x) => x[3] = structuredClone(x[2]));
refuses("unknown phase", (x) => x[0].phase = "smoke");
refuses("all receipt in phase slot", (x) => x[0].receipt.phase = "all");
refuses("failed phase", (x) => x[0].receipt.status = "failure");
refuses("missing native case", (x) => x[0].receipt.results.pop());
refuses(
  "duplicate case",
  (x) => x[0].receipt.results[2] = x[0].receipt.results[1],
);
refuses("unexpected case", (x) => x[0].receipt.results[2].label = "invented");
refuses("false expected count", (x) => x[0].receipt.expectedCount = 1);
refuses(
  "false multiplicity",
  (x) => x[0].receipt.caseMultiplicity["composition-student"] = 2,
);
refuses("wrong audience", (x) => x[0].receipt.results[0].profile = "full");
refuses("missing baseline success", (x) => x[0].receipt.results[1].exit = 1);
refuses("negative case returned zero", (x) => x[0].receipt.results[2].exit = 0);
refuses(
  "wrong expected failure",
  (x) => x[0].receipt.results[2].expectedFailure = "other",
);
refuses(
  "previous full publication altered",
  (x) => x[0].receipt.results[2].previousFullPreserved = false,
);
refuses(
  "temporary public events",
  (x) => x[0].receipt.results[2].publicEvents = 1,
);
refuses(
  "aggregate retention absent",
  (x) => delete x[0].receipt.aggregateFullProfilesPreserved,
);
refuses("resumed receipt", (x) => x[0].receipt.resumedFrom = "earlier");
refuses(
  "network imports enabled",
  (x) => x[0].receipt.networkImportsDisabled = false,
);
refuses(
  "different Template head",
  (x) => x[0].receipt.templateSource.commit = h(80),
);
refuses(
  "different Template source bytes",
  (x) =>
    x[0].receipt.templateSource.files["tests/probes/portal-consumer.ts"] = h(
      80,
      64,
    ),
);
refuses(
  "dirty Template source",
  (x) => x[0].receipt.templateSource.dirty = true,
);
refuses("all artifacts share forged Template source bytes", (x) => {
  for (const item of x) {
    item.receipt.templateSource.files["tests/probes/portal-consumer.ts"] = h(
      80,
      64,
    );
    item.manifest.templateSource = structuredClone(item.receipt.templateSource);
  }
});
refuses(
  "different provider commit",
  (x) => x[0].manifest.companionSources[0].commit = h(80),
);
refuses(
  "different provider tree",
  (x) => x[0].manifest.companionSources[0].tree = h(80),
);
refuses("missing provider", (x) => x[0].manifest.companionSources.pop());
refuses(
  "dirty provider",
  (x) => x[0].manifest.companionSources[0].dirty = true,
);
refuses(
  "different archived package bytes",
  (x) => x[0].manifest.packages[0].files["payload.txt"] = h(80, 64),
);
refuses(
  "different installed bytes",
  (x) => x[0].manifest.installations[0].files = { "payload.txt": h(80, 64) },
);
refuses(
  "missing actual install proof",
  (x) => x[0].manifest.installations.splice(0, 1),
);
refuses("missing required member installation", (x) => {
  x[0].manifest.installations = x[0].manifest.installations.filter((i: any) =>
    i.method !== "member-copy"
  );
});
refuses(
  "misplaced member installation",
  (x) => x[0].manifest.installations.at(-1).scope = "wrong-member",
);
refuses("wrong Quarto version", (x) => x[0].manifest.versions.quarto = "1.0.0");
refuses(
  "wrong CUE version",
  (x) => x[0].manifest.versions.cue = "cue version v0.1.0",
);
function observations() {
  const cases = PORTAL_CASES.composition;
  let current = {
    student: { "index.html": h(70, 64) },
    full: { "index.html": h(71, 64) },
  };
  return cases.map((c, i) => {
    const previous = structuredClone(current);
    if (i < 2) current[c.profile] = { "index.html": h(72 + i, 64) };
    return {
      ...c,
      mode: c.label,
      exit: c.expectedFailure ? 1 : 0,
      previous,
      current: structuredClone(current),
      authorConfigs: {
        before: { "_quarto.yml": h(75, 64) },
        after: { "_quarto.yml": h(75, 64) },
      },
      publicEvents: c.expectedFailure
        ? []
        : [{ kind: "rename" }, { kind: "rename" }],
    };
  });
}
const observedResults = fixture()[0].receipt.results;
verifyPhaseObservations("composition", observedResults, observations());
passed++;
function refusesObservation(label: string, mutate: (x: any[]) => void) {
  const x = observations();
  mutate(x);
  let error: unknown;
  try {
    verifyPhaseObservations("composition", observedResults, x);
  } catch (caught) {
    error = caught;
  }
  check(error instanceof Error, `accepted observation ${label}`);
  passed++;
}
refusesObservation("missing case", (x) => x.pop());
refusesObservation("wrong actual exit", (x) => x[0].exit = 1);
refusesObservation(
  "unchanged seed baseline",
  (x) => x[0].current.student = structuredClone(x[0].previous.student),
);
refusesObservation(
  "hidden prior publication mutation",
  (x) => x[2].current.full = { "index.html": h(90, 64) },
);
refusesObservation(
  "broken attempt chain",
  (x) => x[2].previous.student = { "index.html": h(90, 64) },
);
refusesObservation(
  "author config changed",
  (x) => x[2].authorConfigs.after = { "_quarto.yml": h(90, 64) },
);
refusesObservation(
  "false public event count",
  (x) => x[2].publicEvents = [{ kind: "modify" }],
);
console.log(
  `PASS portal receipt guards: ${passed} checks; synthetic transport only`,
);
