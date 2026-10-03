// Existing original-course semantic assertions, applied to current mounted stage.
// This checks HTML/PDF/ZIP/QRC output; Core decides resource ownership/visibility.
import { resolve } from "stdlib/path";
import { assert, dirname, join } from "./state.ts";
async function files(root: string): Promise<string[]> {
  const result: string[] = [];
  for await (const entry of Deno.readDir(root)) {
    assert(!entry.isSymlink, "native publication contains symlink");
    const path = join(root, entry.name);
    if (entry.isDirectory) result.push(...await files(path));
    else if (entry.isFile) result.push(path);
  }
  return result;
}
function zipNames(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    names = [];
  let offset = 0;
  while (
    offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50
  ) {
    const length = view.getUint16(offset + 26, true),
      extra = view.getUint16(offset + 28, true),
      size = view.getUint32(offset + 18, true);
    names.push(
      new TextDecoder().decode(
        bytes.subarray(offset + 30, offset + 30 + length),
      ),
    );
    offset += 30 + length + extra + size;
  }
  return names;
}
export async function verifyOriginalCourse(output: string, profile: string) {
  const paths = await files(output),
    archives = paths.filter((p) => p.endsWith(".zip"));
  const pdf = await Deno.readFile(join(output, "handouts/contracts.pdf"));
  assert(
    new TextDecoder().decode(pdf.subarray(0, 5)) === "%PDF-",
    "actual handout is not PDF",
  );
  assert(
    !paths.some((p) => /handouts\/.*\.html$/.test(p)),
    "PDF handout rendered extra HTML",
  );
  assert(
    archives.length === (profile === "full" ? 6 : 2),
    "original archive count changed",
  );
  for (const path of archives) {
    const names = zipNames(await Deno.readFile(path));
    if (path.endsWith("observations.zip")) {
      assert(
        names.includes("observations.csv") && names.includes("README.md"),
        "independent observations resource missing",
      );
      continue;
    }
    assert(
      names.includes("build.gradle") && names.includes("settings.gradle") &&
        names.some((p) => p.endsWith(".java")),
      "original starter project lost",
    );
    assert(
      names.every((p) =>
        !/(^|\/)(reference|tests|build|\.gradle)(\/|$)/.test(p)
      ),
      "closed/generated project files in starter archive",
    );
  }
  const catalog = JSON.parse(
    await Deno.readTextFile(join(output, "reference-catalog.json")),
  );
  assert(
    catalog.schema === "quarto-reference-catalog",
    "current QRC schema lost",
  );
  const targets = [
    "book:sec-contracts",
    "book:sec-contract-demo",
    "essay:sec-essays",
    "essay:sec-utf8-policies",
    "site:sec-course",
  ];
  assert(
    JSON.stringify(Object.keys(catalog.targets).sort()) ===
      JSON.stringify(targets.sort()),
    "original explicit exports/root navigation target changed",
  );
  const lecture = await Deno.readTextFile(
    join(output, "lectures/01/contracts.html"),
  );
  const practice = await Deno.readTextFile(
    join(output, "practice/01/clamp.html"),
  );
  const demo = await Deno.readTextFile(
    join(output, "book/topics/contracts/demonstration.html"),
  );
  const essay = await Deno.readTextFile(
    join(output, "essay/text/decoding/index.html"),
  );
  const root = await Deno.readTextFile(join(output, "index.html")),
    book = await Deno.readTextFile(join(output, "book/index.html"));
  assert(
    lecture.includes("course-answer-solution fragment") &&
      lecture.includes('data-course-role="prediction"'),
    "original lecture prediction/reveal changed",
  );
  assert(
    practice.includes("<details><summary>") &&
      !practice.includes("course-answer-solution fragment"),
    "original practice disclosure changed",
  );
  assert(
    demo.includes("course-answer-solution callout") &&
      demo.includes('data-course-role="demonstration"'),
    "original demonstration role changed",
  );
  assert(
    [root, book].some((text) =>
      text.includes("qrc-external") && text.includes('rel="external"') &&
      text.includes("Операционные системы") &&
      text.includes("https://example.edu/os/memory.html#sec-memory")
    ),
    "original external-reference address/style/source lost",
  );
  assert(
    essay.includes('id="exr-utf8-implementation"') === (profile === "full"),
    "original nested assessment visibility changed",
  );
  assert(
    essay.includes("course-meta-difficulty") && essay.includes("Средний"),
    "original inherited difficulty lost",
  );
  assert(
    await Deno.stat(join(output, "book/assets/contract.svg")),
    "original linked book resource missing",
  );
  for (const mount of ["book", "lectures", "practice", "essay", "handouts"]) {
    assert(
      root.includes(`${mount}/`),
      `actual root does not link original ${mount}`,
    );
  }
  assert(
    /href="\.\.\/index\.html(?:#sec-course)?"/.test(book),
    "authored book/root portal navigation backlink absent",
  );
  const search = JSON.parse(
    await Deno.readTextFile(join(output, "search.json")),
  );
  assert(
    Array.isArray(search) &&
      search.some((p) =>
        p.href === "index.html" || p.href?.startsWith("index.html#")
      ),
    "root native search entry missing",
  );
  for (const mount of ["book", "lectures", "practice", "essay"]) {
    assert(
      search.some((p) => p.href?.startsWith(`${mount}/`)),
      `native search omitted ${mount}`,
    );
  }
  let links = 0;
  for (const path of paths) {
    assert(
      !/\.(qmd|java|gradle|tsv|csv)$/.test(path) &&
        !path.includes("/_extensions/"),
      "original raw-source isolation changed",
    );
    if (!path.endsWith(".html") && !path.endsWith("search.json")) continue;
    const text = await Deno.readTextFile(path);
    if (profile === "student") {
      for (
        const marker of [
          "exr-clamp-instructor",
          "Контроль для преподавателя",
          "Комментарий преподавателю",
          "grading-notes",
          "exr-utf8-implementation",
          "exr-utf8-test-design",
          "exr-utf8-experiment",
        ]
      ) {
        assert(
          !text.includes(marker),
          `closed original assessment marker ${marker}`,
        );
      }
    }
    if (!path.endsWith(".html")) continue;
    for (const m of text.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const raw = m[1];
      if (/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/|#)/.test(raw)) continue;
      const url = decodeURIComponent(raw.split(/[?#]/)[0]);
      if (!url) continue;
      const target = url.startsWith("/")
        ? join(output, url.slice(1))
        : resolve(dirname(path), url);
      assert(
        target === output || target.startsWith(output + "/"),
        "native local link escapes current output",
      );
      await Deno.stat(target);
      links++;
    }
  }
  console.log(
    `PASS original course current stage:all5/PDF,QRC/search/backlinks,roles/visibility/archives,${links}local links`,
  );
  // The outer runner adds sourceConfigPreserved only after direct config-map equality.
  return { rolesArchives: true, qrcSearchLinks: true, allFive: true };
}
