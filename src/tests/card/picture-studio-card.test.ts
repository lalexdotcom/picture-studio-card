import { describe, expect, it } from "@rstest/core";
import { background, badges, CONFIG_3, mountCard } from "./harness";

describe("mounting", () => {
  it("configures the background once and builds one element per badge", async () => {
    const card = await mountCard(CONFIG_3);

    expect(background(card)).not.toBeNull();
    expect(background(card).setConfigCalls).toBe(1);

    expect(badges(card)).toHaveLength(3);
    // Badges receive their config through createBadgeElement, so nothing
    // configures them afterwards.
    expect(badges(card).map((b) => b.setConfigCalls)).toEqual([0, 0, 0]);

    card.remove();
  });
});
