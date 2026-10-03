// Six-job transport and public-only dependency, not native success evidence.
import {
  expected,
  fixture as legacyFixture,
} from "./actual-main-receipt-guards.ts";
import {
  aggregateSplitActualMain,
  publicBaseline,
  verifyPublicBaseline,
} from "./actual-main-split-contract.ts";
const h = (n: number) => n.toString(16).padStart(64, "0");
function fixture(): any[] {
  const old: any[] = legacyFixture(), result: any[] = [];
  for (let channel = 0; channel < 2; channel++) {
    const release = old[channel * 2],
      legacyLate = old[channel * 2 + 1],
      version = release.version;
    const one = (phase: string, i: number) => ({
      version,
      phase,
      manifest: { ...structuredClone(release.manifest), phase },
      receipt: {
        ...structuredClone(release.receipt),
        phase,
        labels: [`actual-main-${i ? "full" : "student"}`],
        caseCount: 1,
        caseMultiplicity: { [`actual-main-${i ? "full" : "student"}`]: 1 },
        publication: {
          archiveSha256: h(400 + channel * 10 + i),
          files: structuredClone(release.observations[i].current),
        },
      },
      observations: [structuredClone(release.observations[i])],
      receiptSha256: h(410 + channel * 10 + i),
      manifestSha256: h(420 + channel * 10 + i),
      publicBaselineSha256: h(430 + channel * 10 + i),
    });
    const student: any = one("student-release", 0),
      full: any = one("full-release", 1);
    student.publicBaseline = publicBaseline(student, expected);
    const lineage = (parent: any, phase: string) => ({
      artifactName: `actual-main-public-${version}-${phase}`,
      publicReceiptSha256: parent.publicBaselineSha256,
      publicationArchiveSha256: parent.receipt.publication.archiveSha256,
      files: structuredClone(parent.receipt.publication.files),
      transferred: ["student-publication", "full-publication"],
      privateStateTransferred: false,
    });
    full.receipt.baseline = lineage(student, "student-release");
    full.publicBaseline = publicBaseline(full, expected, {
      value: student.publicBaseline,
      sha256: student.publicBaselineSha256,
    });
    const late: any = {
      ...structuredClone(legacyLate),
      receiptSha256: h(450 + channel),
      manifestSha256: h(460 + channel),
    };
    late.receipt.baseline = lineage(full, "full-release");
    result.push(student, full, late);
  }
  return result;
}
let count = 0;
function check(value: unknown, label: string) {
  if (!value) throw new Error(`MAIN_SPLIT_GUARD: ${label}`);
}
function refuses(label: string, mutate: (items: any[]) => void) {
  const items = fixture();
  mutate(items);
  let error: unknown;
  try {
    aggregateSplitActualMain(items, expected);
  } catch (e) {
    error = e;
  }
  check(error instanceof Error, `accepted ${label}`);
  count++;
}
check(
  aggregateSplitActualMain(fixture(), expected).totalNativeCases === 6,
  "required six labels",
);
count++;
refuses("missing original job", (x) => x.pop());
refuses("duplicate original job", (x) => x[5] = structuredClone(x[2]));
refuses(
  "old compound phase is not a split matrix",
  (x) => x[0].phase = "releases",
);
refuses("failed actual phase", (x) => x[0].receipt.status = "failure");
refuses("source bytes forged consistently", (x) => {
  for (const e of x) {
    e.receipt.templateSource.files["index.qmd"] = h(900);
    e.manifest.templateSource.files["index.qmd"] = h(900);
  }
});
refuses(
  "current provider ref changed",
  (x) => x[0].manifest.companionSources[0].commit = "0".repeat(40),
);
refuses("member install missing", (x) => x[0].manifest.installations.pop());
refuses(
  "single phase executes duplicate labels",
  (x) => x[0].receipt.labels.push("actual-main-full"),
);
refuses(
  "full does not import genuine student tree",
  (x) => x[1].observations[0].previous.student["index.html"] = h(901),
);
refuses(
  "public full lineage receipt changed",
  (x) => x[1].publicBaseline.parent.publicReceiptSha256 = h(902),
);
refuses(
  "public manifest has permission handle",
  (x) => x[0].publicBaseline.manifest.preparedOwner = {},
);
refuses(
  "public baseline has private index",
  (x) => x[0].publicBaseline.ownerIndexes = {},
);
refuses(
  "public nested source has permission payload",
  (x) => x[0].publicBaseline.manifest.templateSource.session = {},
);
refuses(
  "public package carries permission metadata",
  (x) => x[0].publicBaseline.manifest.packages[0].capture = {},
);
refuses(
  "public map carries private owner dir",
  (x) =>
    x[0].publicBaseline.published.files
      .student[".course-owner/preparation.json"] = h(903),
);
refuses(
  "public baseline differs from actual native receipt",
  (x) => x[0].publicBaseline.nativeReceiptSha256 = h(904),
);
refuses(
  "missing raw baseline receipt digest",
  (x) => delete x[0].publicBaselineSha256,
);
refuses(
  "wrong imported channel",
  (x) =>
    x[1].receipt.baseline.artifactName =
      "actual-main-public-1.11.5-student-release",
);
refuses(
  "full imported private state",
  (x) => x[1].receipt.baseline.privateStateTransferred = true,
);
refuses(
  "late imports old native artifact instead public",
  (x) =>
    x[2].receipt.baseline.artifactName =
      "actual-main-native-1.10.18-full-release",
);
refuses(
  "late starts different genuine maps",
  (x) => x[2].observations[0].previous.full["index.html"] = h(905),
);
refuses(
  "unrelated late nonzero",
  (x) => x[2].observations[0].refusal.code = "UNRELATED",
);
refuses(
  "late reused current owner index",
  (x) =>
    x[2].observations[0].ownerIndexes.book.indexHash =
      x[0].observations[0].ownerIndexes.book.indexHash,
);
refuses(
  "late mutated before child finish",
  (x) =>
    x[2].observations[0].pipeline = [
      "qrc-finished",
      "pdf-address-mutated",
      "child-owners-finished",
    ],
);
refuses(
  "late changed prior publication",
  (x) => x[2].observations[0].current.student["index.html"] = h(906),
);
refuses(
  "temporary public late events",
  (x) => x[2].observations[0].publicEvents.push({ kind: "create" }),
);
refuses(
  "unknown alternate completed labels",
  (x) => x[1].publicBaseline.completed.labels[0] = "main-five-student",
);
refuses(
  "positive attempts reused",
  (x) =>
    x[1].publicBaseline.completed.attempts.full =
      x[1].publicBaseline.completed.attempts.student,
);
refuses(
  "wrong actual native input coverage",
  (x) => x[1].manifest.sourceInputs.student.essay.pop(),
);
refuses(
  "private state transfer fields added",
  (x) => x[2].receipt.baseline.privateProof = {},
);
refuses(
  "completed public PDF omitted",
  (x) =>
    delete x[0].publicBaseline.published.files
      .student["handouts/contracts.pdf"],
);
const base = fixture()[0],
  maps = Object.fromEntries(
    base.manifest.packages.map((p: any) => [p.name, p.files]),
  );
verifyPublicBaseline(
  base.publicBaseline,
  "student-release",
  base.version,
  expected,
  maps,
);
count++;
console.log(
  `PASS actual-main six-job/public-only guards:${count}; synthetic transport only`,
);
