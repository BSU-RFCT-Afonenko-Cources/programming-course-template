// Current publication composition is checked by the installed provider-owned composer.
import { validateOwnerResources } from "../../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/owner.ts";
import { validateNavigationPublicationResources } from "../../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/publication-resources.ts";
import { load } from "./owner.ts";
import { assert, event, files, hash, join, relative } from "./common.ts";
export default {
  async finalize(ctx: any) {
    const attempt = await load(ctx);
    const indices = [await validateOwnerResources(attempt.navigation)];
    if (attempt.taskOwner) {
      indices.push(await validateOwnerResources(attempt.taskOwner));
    }
    const publicationResources = await validateNavigationPublicationResources(
      attempt.navigation,
    );
    if (ctx.members.some((member: any) => member.namespace === "handouts")) {
      for (
        const path of [
          "examples/cloud/index.qmd",
          "examples/prairielearn/index.qmd",
          "fixtures/probes/five-parts/index.qmd",
        ]
      ) {
        assert(
          indices[0].policy.files.some((file: any) =>
            file.path === path && !file.allowed
          ),
          `dormant native project source not denied: ${path}`,
        );
      }
    }
    const root = await Deno.readTextFile(join(ctx.stage, "index.html"));
    assert(
      !root.includes("qrc-unresolved"),
      "unresolved actual root QRC reference",
    );
    const catalog = JSON.parse(
      await Deno.readTextFile(join(ctx.stage, "reference-catalog.json")),
    );
    assert(
      catalog.targets["site:sec-portal"]?.page === "index.html",
      "root configured namespace/placement lost",
    );
    assert(
      !Object.keys(catalog.targets).some((key) =>
        key.startsWith("undefined:") || key.startsWith("portal:")
      ),
      "invented root namespace",
    );
    for (
      const member of ctx.members.filter((member: any) =>
        member.format !== "pdf"
      )
    ) {
      assert(
        root.includes(
          `href="${member.mount}/index.html#${
            member.format === "revealjs" ? "/" : ""
          }sec-${member.namespace}"`,
        ),
        `root to ${member.namespace} link absent`,
      );
      assert(
        (await Deno.readTextFile(join(ctx.stage, member.mount, "index.html")))
          .includes('href="../index.html#sec-portal"'),
        `${member.namespace} to root link absent`,
      );
    }
    for (const name of ["linked.txt", "configured.txt"]) {
      assert(
        await hash(join(ctx.stage, name)) ===
          await hash(join(ctx.sourceRoot, name)),
        `current root resource missing/changed: ${name}`,
      );
    }
    const searches = (await files(ctx.stage)).filter((path) =>
      path.endsWith("search.json")
    );
    assert(
      searches.includes(join(ctx.stage, "search.json")),
      "actual root native search missing",
    );
    for (const path of searches) {
      const text = await Deno.readTextFile(path);
      assert(
        !text.includes("qrc-unresolved") && !text.includes("site:sec-portal"),
        `search not updated from final linked HTML: ${path}`,
      );
    }
    await event(ctx, "verified", {
      publicationResources,
      catalogTargets: Object.keys(catalog.targets),
      searchFiles: searches.map((path) => relative(ctx.stage, path)),
      stageFiles: (await files(ctx.stage)).map((path) =>
        relative(ctx.stage, path)
      ),
    });
  },
};
