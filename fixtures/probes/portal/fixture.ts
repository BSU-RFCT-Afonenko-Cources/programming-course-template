import { write } from "./common.ts";
export const compositionMembers = [
  "theory",
  "tasks",
  "practice",
  "lectures",
  "handbook",
];
export const mainMembers = [
  "book",
  "lectures",
  "practice",
  "essay",
  "handouts",
];
/** Small native corpora. The main fixture preserves the product's five namespaces. */
export async function fixture(root: string, composition: boolean) {
  const names = composition ? compositionMembers : mainMembers;
  const format = (name: string) =>
    name === "handouts"
      ? "pdf"
      : ["lectures", "practice"].includes(name)
      ? "revealjs"
      : "html";
  const projects = names.map((name) =>
    `    ${name}: {path: ${name}, format: ${format(name)}}`
  ).join("\n");
  const exports = names.filter((name) => name !== "handouts").map((name) =>
    `    ${name}: [sec-${name}]`
  ).join("\n");
  const links = names.map((name) =>
    name === "handouts"
      ? "- [PDF handout](handouts/index.pdf)"
      : `- @${name}:sec-${name}`
  ).join("\n");
  await write(
    root,
    "_quarto.yml",
    `project:
  type: website
  output-dir: .project-publish/native
  render: []
  resources: [./configured.txt, "!_probe/**", "!_portal-evidence/**"${
      names.map((name) => `, "!${name}/**"`).join("")
    }]
  pre-render:
    - _extensions/Afonenko-Course-Tools/project-publish/entrypoints/pre.ts
    - _extensions/Afonenko-Course-Tools/course-core/entrypoints/owner-freeze.ts
  post-render: _extensions/Afonenko-Course-Tools/project-publish/entrypoints/post.ts
format: html
filters: [course-core, reference-catalog]
course:
  id: supported-navigation-fixture
website:
  title: Navigation only
  search: true
profile:
  default: student
  group: [[student, full]]
reference-catalog:
  namespace: site
  exports:
    site: [sec-portal]
${exports}
project-publish:
  portal: index.qmd
  output-dir: _site
  projects:
${projects}
  integrations:
    - _probe/portal/owner.ts
    - _probe/portal/faults.ts
    - _extensions/Afonenko-Course-Tools/reference-catalog/entrypoints/publication.ts
    - _probe/portal/finish.ts
    - _probe/portal/verify.ts
`,
  );
  await write(
    root,
    "index.qmd",
    `# Navigation only {#sec-portal}\n\n${links}\n\n[Linked public](linked.txt)\n`,
  );
  await write(root, "linked.txt", "LINKED_PUBLIC_CURRENT\n");
  await write(root, "configured.txt", "CONFIGURED_PUBLIC_CURRENT\n");
  for (const profile of ["student", "full"]) {
    await write(
      root,
      `_quarto-${profile}.yml`,
      `project-publish:\n  output-dir: _site-${profile}\ncourse:\n  view: ${profile}\n`,
    );
    await write(
      root,
      `_site-${profile}/index.html`,
      `${profile} populated previous publication\n`,
    );
    await write(
      root,
      `_site-${profile}/old/deep/resource.txt`,
      `${profile} previous resource\n`,
    );
    await write(root, `_site-${profile}/.nojekyll`, "");
  }
  for (const name of names) {
    const owner = composition && name === "tasks";
    await write(
      root,
      `${name}/_quarto.yml`,
      `project:
  type: ${format(name) === "html" ? "book" : "default"}
  output-dir: _output
${
        owner
          ? `  pre-render: _extensions/Afonenko-Course-Tools/course-core/entrypoints/owner-freeze.ts\n  resources: [./public-starter.txt, "!closed.txt"]\n`
          : ""
      }${
        format(name) !== "html" ? "  render: [index.qmd]\n" : `book:
  title: ${name}
  chapters: [index.qmd]
`
      }format:${
        name === "handouts"
          ? "\n  pdf:\n    output-file: index.pdf\n    pdf-engine: xelatex"
          : !composition && format(name) === "revealjs"
          ? "\n  revealjs:\n    revealjs-plugins: [course-navigation]"
          : " " + format(name)
      }
${
        owner
          ? "course:\n  id: supported-tasks-fixture\nfilters: [course-core]\n"
          : !composition && name !== "handouts"
          ? `filters: [course-presentation]\ncourse-presentation:\n  mode: ${
            name === "lectures" ? "lecture" : "study"
          }\n`
          : ""
      }`,
    );
    await write(
      root,
      `${name}/index.qmd`,
      `# ${name} {#sec-${name}}\n\n${
        name === "handouts" ? "CURRENT_NATIVE_PDF_HANDOUT" : "@site:sec-portal"
      }\n${
        owner
          ? '\n[Public starter](public-starter.txt)\n\n::: {.when-full}\n[Closed-only](closed.txt)\n\n## Closed target {#sec-closed}\n:::\n\n::: {#exr-known target="manual" difficulty="introductory" work-mode="individual"}\nSupported fixture question.\n:::\n'
          : ""
      }`,
    );
    for (const profile of ["student", "full"]) {
      await write(
        root,
        `${name}/_quarto-${profile}.yml`,
        `project:\n  output-dir: _output/${profile}\n${
          owner ? `course:\n  view: ${profile}\n` : ""
        }`,
      );
    }
    if (owner) {
      await write(
        root,
        "tasks/public-starter.txt",
        "TASKS_PUBLIC_STARTER_CURRENT\n",
      );
      await write(root, "tasks/closed.txt", "TASKS_CLOSED_ONLY_PAYLOAD\n");
    }
    if (!composition && name === "book") {
      const path = `${name}/_quarto.yml`;
      await write(
        root,
        path,
        (await Deno.readTextFile(`${root}/${path}`)) +
          `course:\n  id: plain-native-main-book\nproject-download:\n  resources:\n    starter: {path: materials/student}\n`,
      );
      // Preserve the native book hooks and exercise documented producer ownership.
      await write(
        root,
        path,
        (await Deno.readTextFile(`${root}/${path}`)).replace(
          "  output-dir: _output\n",
          '  output-dir: _output\n  pre-render: [_extensions/Afonenko-Course-Tools/course-core/entrypoints/pre.ts, _extensions/Afonenko-Course-Tools/project-download/entrypoints/pre.ts]\n  post-render: [_extensions/Afonenko-Course-Tools/course-core/entrypoints/post.ts, _extensions/Afonenko-Course-Tools/project-download/entrypoints/post.ts]\n  resources: ["!materials/**"]\n',
        ).replace(
          "filters: [course-presentation]",
          "filters: [project-download, course-core, course-presentation]",
        ),
      );
      for (const profile of ["student", "full"]) {
        const profilePath = `${name}/_quarto-${profile}.yml`;
        await write(
          root,
          profilePath,
          (await Deno.readTextFile(`${root}/${profilePath}`)) +
            `course:\n  view: ${profile}\n`,
        );
      }
      await write(
        root,
        `${name}/index.qmd`,
        (await Deno.readTextFile(`${root}/${name}/index.qmd`)) +
          "\n{{< project-download starter >}}\n",
      );
      await write(
        root,
        `${name}/materials/student/README.txt`,
        "CURRENT_NATIVE_DOWNLOAD_STARTER\n",
      );
    }
  }
  if (!composition) {
    for (
      const path of [
        "examples/cloud",
        "examples/prairielearn",
        "fixtures/probes/five-parts",
      ]
    ) {
      await write(
        root,
        `${path}/_quarto.yml`,
        "project:\n  type: default\n  output-dir: _output\n  render: [index.qmd]\nformat: html\n",
      );
      await write(
        root,
        `${path}/index.qmd`,
        `# Dormant independent native project\n\n::: {#exr-dormant}\nDORMANT_UNPUBLISHED_SOURCE_${path}\n:::\n`,
      );
      for (const profile of ["student", "full"]) {
        await write(root, `${path}/_quarto-${profile}.yml`, "metadata: {}\n");
      }
    }
  }
}
