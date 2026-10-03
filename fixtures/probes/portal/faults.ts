// Explicit failure injection in a native installed attempt; never an author policy.
import { event, join } from "./common.ts";
import { toFileUrl } from "stdlib/path";
export default {
  async beforeRender(ctx: any) {
    const mode = Deno.env.get("PORTAL_CONSUMER_CASE");
    if (mode === "before-failure") throw new Error("INJECTED_BEFORE_FAILURE");
    if (mode === "source-drift") {
      await Deno.writeTextFile(
        ctx.portal.input,
        "# Changed after certification\n",
      );
    }
    if (mode === "control-drift") {
      await Deno.writeTextFile(ctx.portal.control, "{}\n");
    }
    if (mode === "dormant-boundary-drift") {
      await Deno.writeTextFile(
        join(ctx.sourceRoot, "examples/cloud/_quarto.yml"),
        "project:\n  type: default\n  render: []\nformat: html\n",
      );
    }
  },
  metadata(ctx: any) {
    if (
      ctx.namespace === undefined &&
      Deno.env.get("PORTAL_CONSUMER_CASE") === "child-failure"
    ) return { filters: ["absent-portal-filter.lua"] };
    return {};
  },
  async finalize(ctx: any) {
    const mode = Deno.env.get("PORTAL_CONSUMER_CASE");
    if (mode === "finalizer-failure") {
      throw new Error("INJECTED_FINALIZER_FAILURE");
    }
    if (mode === "late-closed-qrc") {
      const path = join(ctx.stage, "index.html");
      await Deno.writeTextFile(
        path,
        (await Deno.readTextFile(path)).replace(
          "</main>",
          '<a href="#qrc-unresolved" class="qrc-link" data-qrc-ref="tasks:sec-closed" data-qrc-style="default" data-qrc-custom="false">Late closed target</a></main>',
        ),
      );
    }
    if (mode === "late-control-copy") {
      await Deno.copyFile(
        ctx.portal.control,
        join(ctx.stage, "exported-control.txt"),
      );
    }
    if (mode === "late-core-copy") {
      await Deno.copyFile(
        join(
          ctx.sourceRoot,
          "_extensions/Afonenko-Course-Tools/course-core/filter.lua",
        ),
        join(ctx.stage, "renamed-provider.txt"),
      );
    }
    if (mode === "late-child-public-rename") {
      await Deno.copyFile(
        join(ctx.sourceRoot, "tasks/public-starter.txt"),
        join(ctx.stage, "renamed-starter.txt"),
      );
    }
    if (mode === "late-runtime-rename") {
      await Deno.copyFile(
        join(
          ctx.sourceRoot,
          "lectures/_extensions/Afonenko-Course-Tools/course-presentation/presentation.css",
        ),
        join(ctx.stage, "renamed-runtime.css"),
      );
    }
    if (mode === "late-dormant-copy") {
      await Deno.copyFile(
        join(ctx.sourceRoot, "examples/cloud/index.qmd"),
        join(ctx.stage, "renamed-dormant.txt"),
      );
    }
    if (mode === "late-download-state-copy") {
      const book = join(ctx.sourceRoot, "book");
      const { inspectOwnedRequests } = await import(
        toFileUrl(
          join(
            book,
            "_extensions/Afonenko-Course-Tools/project-download/ownership.ts",
          ),
        ).href
      );
      const state = await inspectOwnedRequests(book, ["index.qmd"]);
      if (!state.files.length) {
        throw new Error("Native Download requests missing");
      }
      await Deno.copyFile(
        state.files[0].path,
        join(ctx.stage, "renamed-download-request.txt"),
      );
    }
    await event(ctx, "before-qrc", { mode: mode ?? "success" });
  },
};
