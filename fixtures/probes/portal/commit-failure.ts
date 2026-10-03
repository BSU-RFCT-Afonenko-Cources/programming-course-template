// Test-only I/O injection at the installed Publisher's final promotion seam.
// renderMembers still runs the actual native portal and all native members.
import { workspace } from "../../_extensions/Afonenko-Course-Tools/project-publish/infrastructure/config.ts";
import { renderMembers } from "../../_extensions/Afonenko-Course-Tools/project-publish/infrastructure/render.ts";
import { publish } from "../../_extensions/Afonenko-Course-Tools/project-publish/infrastructure/publish.ts";
import { runtime } from "../../_extensions/Afonenko-Course-Tools/project-publish/infrastructure/runtime.ts";
const w = await workspace(Deno.cwd());
await runtime().clearState(w);
const state = await renderMembers(w);
try {
  await publish(w, state, async (from, to) => {
    if (from.endsWith(`publish-${state.id}`)) {
      throw new Error("INJECTED_COMMIT_FAILURE");
    }
    await Deno.rename(from, to);
  });
  throw new Error("Commit fault did not execute");
} finally {
  await runtime().cleanup(w, state, true);
}
