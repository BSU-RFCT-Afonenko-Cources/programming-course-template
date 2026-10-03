// Synthetic portable public-retention metadata; no private producer proof.
import {
  assertMainRunnerPhase,
  verifyPublicBaseline,
} from "./actual-main-split-contract.ts";
const h = (n: number, size = 40) => n.toString(16).padStart(size, "0");
const files = { "index.html": h(1, 64), "deep/a.txt": h(2, 64) };
const source = {
  commit: h(10),
  tree: h(11),
  dirty: false,
  files: { "index.qmd": h(12, 64) },
};
const expected = {
  template: source,
  providers: Object.fromEntries(
    ["core", "download", "publisher", "qrc"].map((
      name,
      i,
    ) => [name, { commit: h(20 + i), tree: h(30 + i) }]),
  ),
  run: { repository: "synthetic/template", runId: "100" },
  lateRefusal: "SYNTHETIC_REFUSAL",
};
// The complete manifest validator is exercised by existing63 native-transport guards;
// portable guard fixtures below reject missing manifests rather than inventing one.
let count = 0;
for (const phase of ["releases", "student-release", "full-release", "late"]) {
  if (assertMainRunnerPhase(phase) !== phase) {
    throw new Error("required phase refused");
  }
  count++;
}
for (const phase of ["student", "full", "smoke", "resume", "all25", ""]) {
  let error: unknown;
  try {
    assertMainRunnerPhase(phase);
  } catch (e) {
    error = e;
  }
  if (!(error instanceof Error)) throw new Error(`accepted subset ${phase}`);
  count++;
}
for (
  const value of [null, {}, {
    protocol: 1,
    status: "success",
    phase: "student-release",
    manifest: {},
    published: {
      archiveSha256: h(1, 64),
      files: { student: files, full: files },
    },
    ownerSession: "forbidden",
  }]
) {
  let error: unknown;
  try {
    verifyPublicBaseline(value, "student-release", "1.10.18", expected, {});
  } catch (e) {
    error = e;
  }
  if (!(error instanceof Error)) {
    throw new Error("accepted malformed/private portable baseline");
  }
  count++;
}
console.log(
  `PASS actual-main public-only baseline early guards:${count}; synthetic transport only`,
);
