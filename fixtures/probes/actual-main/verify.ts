import { validateNavigationPublicationResources } from "../_extensions/Afonenko-Course-Tools/course-core/owner-preflight/publication-resources.ts";
import { load, observe } from "./state.ts";
export default {
  async finalize(ctx: any) {
    const state = await load(ctx);
    await validateNavigationPublicationResources(state.navigation);
    await observe(ctx, "publication-verified");
  },
};
