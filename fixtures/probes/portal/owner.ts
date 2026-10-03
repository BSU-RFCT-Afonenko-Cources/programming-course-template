// The actual root is certified by Core's navigation provider, never by a fixture policy.
import {
  activateNavigationOwner,
  prepareNavigationOwner,
} from "../../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/navigation.ts";
import {
  activateOwner,
  prepareOwner,
} from "../../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/owner.ts";
import { assert, event, hash, join } from "./common.ts";
const attemptPath = (ctx: any) =>
  join(ctx.root, ".project-publish/builds", ctx.attemptId, "consumer.json");
export async function load(ctx: any) {
  const attempt = JSON.parse(await Deno.readTextFile(attemptPath(ctx)));
  assert(
    attempt.attemptId === ctx.attemptId &&
      attempt.navigation.root === ctx.sourceRoot &&
      attempt.navigation.profile === ctx.profiles[0],
    "invalid current navigation attempt",
  );
  return attempt;
}
export async function save(ctx: any, attempt: unknown) {
  await Deno.writeTextFile(attemptPath(ctx), JSON.stringify(attempt));
}
export default {
  async beforeRender(ctx: any) {
    assert(
      ctx.portal && ctx.profiles.length === 1 &&
        ["student", "full"].includes(ctx.profiles[0]),
      "unsupported navigation context",
    );
    const tasks = ctx.members.find((member: any) =>
      member.namespace === "tasks"
    );
    const taskOwner = tasks
      ? await prepareOwner(tasks.path, {
        attemptId: ctx.attemptId,
        profile: ctx.profiles[0],
        extension: "_extensions/Afonenko-Course-Tools/course-core",
      })
      : undefined;
    const navigation = await prepareNavigationOwner(ctx.sourceRoot, {
      attemptId: ctx.attemptId,
      profile: ctx.profiles[0],
      extension: "_extensions/Afonenko-Course-Tools/course-core",
      portal: ctx.portal,
      members: ctx.members,
    });
    await save(ctx, {
      attemptId: ctx.attemptId,
      navigation,
      taskOwner,
      nativeMembers: {},
    });
    await event(ctx, "prepared", {
      portal: ctx.portal,
      profiles: ctx.profiles,
      members: ctx.members,
      inputSha256: await hash(ctx.portal.input),
    });
  },
  async metadata(ctx: any) {
    const attempt = await load(ctx);
    if (ctx.namespace === undefined) {
      assert(
        ctx.output === ctx.portal.output && ctx.format === "html",
        "wrong actual portal metadata context",
      );
      await event(ctx, "navigation-activated", {
        output: ctx.output,
        namespace: ctx.namespace,
      });
      return await activateNavigationOwner(attempt.navigation);
    }
    const member = ctx.members.find((member: any) =>
      member.namespace === ctx.namespace
    );
    assert(
      member && member.format === ctx.format &&
        !attempt.nativeMembers[ctx.namespace],
      "invalid/repeated actual member metadata",
    );
    attempt.nativeMembers[ctx.namespace] = {
      output: ctx.output,
      format: ctx.format,
    };
    await save(ctx, attempt);
    await event(ctx, "native-member-output", {
      namespace: ctx.namespace,
      output: ctx.output,
      format: ctx.format,
    });
    if (ctx.namespace === "tasks") {
      assert(
        attempt.taskOwner && ctx.format === "html",
        "unsupported task owner context",
      );
      await event(ctx, "tasks-activated", {
        namespace: ctx.namespace,
        output: ctx.output,
      });
      return await activateOwner(attempt.taskOwner, { output: ctx.output });
    }
    return {};
  },
};
