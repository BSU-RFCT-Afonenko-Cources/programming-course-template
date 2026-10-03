// Configured Publisher callbacks; all ownership semantics are installed public Core APIs.
import {
  activateNavigationOwner,
  prepareNavigationOwner,
} from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/navigation.ts";
import {
  activateOwner,
  prepareOwner,
} from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/owner.ts";
import {
  assert,
  load,
  observe,
  relative,
  retainFailureDiagnostics,
  save,
} from "./state.ts";
export default {
  async onFailure(ctx: any) {
    await retainFailureDiagnostics(ctx);
  },
  async beforeRender(ctx: any) {
    assert(
      ctx.portal && ctx.profiles.length === 1 &&
        ["student", "full"].includes(ctx.profiles[0]),
      "actual managed portal audience required",
    );
    // The parent context is prepared first; it need not be activated/finished yet.
    const navigation = await prepareNavigationOwner(ctx.sourceRoot, {
      attemptId: ctx.attemptId,
      profile: ctx.profiles[0],
      extension: "_extensions/Afonenko-Course-Tools/course-core",
      portal: ctx.portal,
      members: ctx.members,
    });
    const owners: Record<string, unknown> = {};
    for (const name of ["book", "essay"]) {
      const member = ctx.members.find((m: any) => m.namespace === name);
      assert(member?.format === "html", `unsupported original owner ${name}`);
      owners[name] = await prepareOwner(member.path, {
        attemptId: ctx.attemptId,
        profile: ctx.profiles[0],
        extension: "_extensions/Afonenko-Course-Tools/course-core",
        publicationAddresses: { navigation },
      });
    }
    await save(ctx, {
      attemptId: ctx.attemptId,
      sourceRoot: ctx.sourceRoot,
      navigation,
      owners,
      nativeMembers: {},
    });
    await observe(ctx, "prepared", {
      portal: ctx.portal,
      members: ctx.members.map((m: any) => ({
        namespace: m.namespace,
        mount: m.mount,
        format: m.format,
      })),
    });
  },
  async metadata(ctx: any) {
    const state = await load(ctx);
    if (ctx.namespace === undefined) {
      assert(
        ctx.output === ctx.portal.output && ctx.format === "html",
        "actual namespace-less root context required",
      );
      return await activateNavigationOwner(state.navigation);
    }
    const member = ctx.members.find((m: any) => m.namespace === ctx.namespace);
    assert(
      member && member.format === ctx.format &&
        !state.nativeMembers[ctx.namespace],
      "invalid/repeated native metadata",
    );
    state.nativeMembers[ctx.namespace] = {
      output: ctx.output,
      format: ctx.format,
    };
    await save(ctx, state);
    await observe(ctx, "native-member", {
      namespace: ctx.namespace,
      path: relative(ctx.sourceRoot, member.path),
      mount: member.mount,
      format: member.format,
      output: ctx.output,
    });
    return state.owners[ctx.namespace]
      ? await activateOwner(state.owners[ctx.namespace], { output: ctx.output })
      : {};
  },
};
