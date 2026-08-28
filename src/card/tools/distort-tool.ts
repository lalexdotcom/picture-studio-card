import type { Tool } from "./tool";

/**
 * The distortion, which is not here yet.
 *
 * Four methods that do nothing, and that is the design rather than a stub: in
 * this mode the corners belong to a gesture sub-project 4 will write, so nothing
 * is drawn and nothing claims to act. Everything downstream is inert without a
 * single special case — no handles, so no pointer target, so no gesture, so no
 * commit. The item still moves, because moving is not a tool.
 */
export const createDistortTool = (): Tool => ({
  id: "distort",
  render() {},
  attach() {},
  detach() {},
  hit: () => undefined,
  gestureIndex: () => undefined,
});
