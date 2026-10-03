// Seal publication addresses only after QRC has written current final HTML/search.
import { finishNavigationOwner } from "../../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/navigation.ts";
import { sealNavigationPublicationResources } from "../../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/publication-resources.ts";
import {
  finishOwner,
  validateOwnerResources,
} from "../../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/owner.ts";
import { assert, event } from "./common.ts";
import { load, save } from "./owner.ts";
export default {
  async finalize(ctx: any) {
    const attempt = await load(ctx);
    // Child completion may write current producer service state. Freeze that state
    // in the root index only after every optional child owner has finished.
    let taskIndex;
    if (attempt.taskOwner) {
      const result = await finishOwner(attempt.taskOwner);
      assert(result.exitCode === 0, `tasks finish: ${JSON.stringify(result)}`);
      taskIndex = await validateOwnerResources(attempt.taskOwner);
    }
    const navigation = await finishNavigationOwner(attempt.navigation, {
      output: ctx.stage,
    });
    assert(
      navigation.exitCode === 0,
      `navigation finish: ${JSON.stringify(navigation)}`,
    );
    const navigationIndex = await validateOwnerResources(attempt.navigation);
    attempt.navigationIndex = navigationIndex;
    attempt.taskIndex = taskIndex;
    const members = ctx.members.map((member: any) => {
      const actual = attempt.nativeMembers[member.namespace];
      assert(
        actual && actual.format === member.format,
        `missing actual native member output ${member.namespace}`,
      );
      return {
        path: member.path,
        mount: member.mount,
        format: member.format,
        output: actual.output,
        ...(member.namespace === "tasks" ? { owner: attempt.taskOwner } : {}),
      };
    });
    attempt.publicationResources = await sealNavigationPublicationResources(
      attempt.navigation,
      { output: ctx.stage, members },
    );
    await save(ctx, attempt);
    await event(ctx, "finished", {
      navigation,
      navigationIndex,
      taskIndex,
      publicationResources: attempt.publicationResources,
    });
  },
};
