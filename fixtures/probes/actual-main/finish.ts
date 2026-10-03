// This adapter is configured AFTER QRC, using the ordinary finalize callback.
import {
  finishOwner,
  validateOwnerResources,
} from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/owner.ts";
import { finishNavigationOwner } from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/navigation.ts";
import { sealNavigationPublicationResources } from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/publication-resources.ts";
import { verifyOriginalCourse } from "./verification.ts";
import {
  assert,
  hash,
  join,
  load,
  nativeMembers,
  observe,
  save,
} from "./state.ts";
export default {
  async finalize(ctx: any) {
    const state = await load(ctx);
    // QRC's configured predecessor has awaited its actual stage rewrite.
    assert(
      (await Deno.stat(join(ctx.stage, "reference-catalog.json"))).isFile,
      "current QRC stage absent",
    );
    await observe(ctx, "qrc-finished");
    const members = nativeMembers(ctx, state);
    const addresses = members.map(({ path, mount, format, output }: any) => ({
      path,
      mount,
      format,
      output,
    }));
    const ownerIndexes: Record<string, unknown> = {};
    for (const name of ["book", "essay"]) {
      const result = await finishOwner(state.owners[name], {
        publicationAddresses: { output: ctx.stage, members: addresses },
      });
      assert(
        result.exitCode === 0,
        `current ${name} finish failed: ${JSON.stringify(result)}`,
      );
      const index = await validateOwnerResources(state.owners[name]);
      // Transport only hashes. Never export a prepared handle or permission index.
      ownerIndexes[name] = { indexHash: index.indexHash };
    }
    const checked = await verifyOriginalCourse(ctx.stage, ctx.profiles[0]);
    const pdf = {
      path: "handouts/contracts.pdf",
      sha256: await hash(join(ctx.stage, "handouts/contracts.pdf")),
    };
    state.ownerIndexes = ownerIndexes;
    state.checked = checked;
    state.pdf = pdf;
    await save(ctx, state);
    await observe(ctx, "child-owners-finished", { ownerIndexes, checked, pdf });
    if (
      Deno.env.get("ACTUAL_MAIN_MODE") === "actual-main-late-current-address"
    ) {
      const path = join(ctx.stage, pdf.path);
      await Deno.writeTextFile(
        path,
        "\nactual-main private current-address drift\n",
        { append: true },
      );
      await observe(ctx, "pdf-address-mutated", {
        mutation: {
          kind: "mounted-pdf-byte-drift",
          path: pdf.path,
          beforeSha256: pdf.sha256,
          afterSha256: await hash(path),
          point: "after-child-finish-before-navigation-finish",
        },
      });
    }
    const finished = await finishNavigationOwner(state.navigation, {
      output: ctx.stage,
    });
    assert(
      finished.exitCode === 0,
      `current navigation finish failed: ${JSON.stringify(finished)}`,
    );
    state.publicationResources = await sealNavigationPublicationResources(
      state.navigation,
      { output: ctx.stage, members },
    );
    await save(ctx, state);
  },
};
