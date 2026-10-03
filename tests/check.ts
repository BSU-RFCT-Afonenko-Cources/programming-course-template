import { dirname, fromFileUrl, join, resolve } from "stdlib/path";
import { inventory } from "./features.ts";
const root = dirname(dirname(fromFileUrl(import.meta.url)));
const quarto = Deno.env.get("QUARTO") || "quarto";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function files(directory: string): Promise<string[]> {
  const result: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    const path = join(directory, entry.name);
    if (entry.isDirectory) result.push(...await files(path));
    else if (entry.isFile) result.push(path);
  }
  return result;
}
// Возможности извлекаются из настоящих примеров.
const features = await inventory(root);
assert(features.size > 0, "Не найдены демонстрации возможностей курса");
if (!Deno.args.includes("--skip-render")) {
  for (const profile of ["full", "student"]) {
    const result = await new Deno.Command(quarto, {
      args: ["render", "--profile", profile, "--fail-if-warnings"],
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
    }).output();
    assert(result.success, `Не удалось собрать профиль ${profile}`);
    for (const example of ["cloud", "prairielearn"]) {
      const optional = await new Deno.Command(quarto, {
        args: [
          "render",
          `examples/${example}`,
          "--profile",
          profile,
          "--fail-if-warnings",
        ],
        cwd: root,
        stdout: "inherit",
        stderr: "inherit",
      }).output();
      assert(
        optional.success,
        `Не удалось собрать самостоятельный пример ${example}/${profile}`,
      );
    }
  }
}
function zipNames(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    names: string[] = [];
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
let links = 0;
for (const profile of ["student", "full"]) {
  const output = join(root, `_site-${profile}`), paths = await files(output);
  const archives = paths.filter((path) => path.endsWith(".zip"));
  const pdf = await Deno.readFile(join(output, "handouts/contracts.pdf"));
  assert(
    new TextDecoder().decode(pdf.subarray(0, 5)) === "%PDF-",
    "Раздатка не собрана в PDF",
  );
  assert(
    !paths.some((path) => /handouts\/.*\.html$/.test(path)),
    "PDF-раздатка дополнительно отрендерилась в HTML",
  );
  assert(
    archives.length === (profile === "full" ? 6 : 2),
    `${profile}: неверное число архивов (${archives.length})`,
  );
  for (const archive of archives) {
    const names = zipNames(await Deno.readFile(archive));
    if (archive.endsWith("observations.zip")) {
      assert(
        names.includes("observations.csv") && names.includes("README.md"),
        `Не собран ресурс, независимый от задания: ${archive}`,
      );
      continue;
    }
    assert(
      names.includes("build.gradle") && names.includes("settings.gradle") &&
        names.some((name) => name.endsWith(".java")),
      `Нет самостоятельного стартового проекта: ${archive}`,
    );
    assert(
      names.every((name) =>
        !/(^|\/)(reference|tests|build|\.gradle)(\/|$)/.test(name)
      ),
      `В архив попали закрытые или сгенерированные файлы: ${archive}`,
    );
  }
  const catalog = JSON.parse(
    await Deno.readTextFile(join(output, "reference-catalog.json")),
  );
  assert(
    catalog.schema === "quarto-reference-catalog",
    "Каталог использует устаревшую схему",
  );
  const exports = [
    "site:sec-course",
    "book:sec-contracts",
    "book:sec-contract-demo",
    "essay:sec-essays",
    "essay:sec-utf8-policies",
  ];
  assert(
    JSON.stringify(Object.keys(catalog.targets).sort()) ===
      JSON.stringify(exports.sort()),
    "Нарушен выбор публичных глав или повторно экспортирован импорт",
  );
  const lecture = await Deno.readTextFile(
    join(output, "lectures/01/contracts.html"),
  );
  const practice = await Deno.readTextFile(
    join(output, "practice/01/clamp.html"),
  );
  const demonstration = await Deno.readTextFile(
    join(output, "book/topics/contracts/demonstration.html"),
  );
  const home = await Deno.readTextFile(join(output, "book/index.html"));
  const portal = await Deno.readTextFile(join(output, "index.html"));
  for (const mount of ["book", "lectures", "practice", "essay", "handouts"]) {
    assert(
      portal.includes(`${mount}/`),
      `Навигация не связана с частью ${mount}`,
    );
  }
  assert(
    /href="\.\.\/index\.html(?:#sec-course)?"/.test(home),
    "Нет перехода книги к навигации курса",
  );
  assert(
    (await Deno.stat(join(output, "book/assets/contract.svg"))).isFile,
    "Потерян ресурс исходной книги",
  );
  const essay = await Deno.readTextFile(
    join(output, "essay/text/decoding/index.html"),
  );
  assert(
    lecture.includes("course-answer-solution fragment") &&
      lecture.includes('data-course-role="prediction"'),
    "Потеряны прогноз или раскрытие ответа при переходе вперёд",
  );
  assert(
    practice.includes("<details><summary>") &&
      !practice.includes("course-answer-solution fragment"),
    "Потерян режим самостоятельного раскрытия ответа",
  );
  assert(
    demonstration.includes("course-answer-solution callout") &&
      demonstration.includes('data-course-role="demonstration"'),
    "Потеряна роль демонстрации",
  );
  assert(
    home.includes("qrc-external") && home.includes('rel="external"') &&
      home.includes("Операционные системы") &&
      home.includes("https://example.edu/os/memory.html#sec-memory"),
    "Внешняя ссылка потеряла адрес, источник или специальный стиль",
  );
  assert(
    essay.includes('id="exr-utf8-implementation"') === (profile === "full"),
    "Нарушена видимость вложенного контроля",
  );
  assert(
    essay.includes("course-meta-difficulty") && essay.includes("Средний"),
    "Сложность не унаследована из метаданных документа",
  );
  for (const path of paths) {
    assert(
      !/\.(qmd|java|gradle|tsv|csv)$/.test(path) &&
        !path.includes("/_extensions/"),
      `Опубликован исходный или служебный файл: ${path}`,
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
          `В студенческой публикации найден закрытый материал ${marker}: ${path}`,
        );
      }
    }
    if (!path.endsWith(".html")) continue;
    for (const match of text.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const raw = match[1];
      if (/^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/|#)/.test(raw)) continue;
      const url = decodeURIComponent(raw.split(/[?#]/)[0]);
      if (!url) continue;
      const target = url.startsWith("/")
        ? join(output, url.slice(1))
        : resolve(dirname(path), url);
      try {
        await Deno.stat(target);
      } catch {
        throw new Error(`Неработающая локальная ссылка ${raw}: ${path}`);
      }
      links++;
    }
  }
}
console.log(
  `Проверка пройдена: оба профиля, пять подпроектов и отдельные адаптеры, внешний импорт и явный экспорт, архивы, изоляция контроля; ${links} локальных ссылок, ${features.size} демонстрируемых возможностей`,
);
