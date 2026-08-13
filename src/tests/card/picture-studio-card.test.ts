import { afterEach, describe, expect, it } from "@rstest/core";
import type { EditorChannel } from "../../broker";
import { notifyEditors, registerEditor } from "../../broker";
import { CARD_TYPE, ICON_TAG } from "../../config";
import type { HomeAssistant } from "../../types";
import {
  background,
  badges,
  CONFIG_3,
  FAKE_TAG,
  flush,
  mountCard,
  root,
  wrappers,
} from "./harness";

// Tracks an editor registered mid-test so afterEach can release it even when
// an assertion throws before the test reaches its own release() call.
let releaseEditor: (() => void) | undefined;

// Remove every card the test mounted so broker subscriptions added in
// connectedCallback don't bleed into the next test — even when a previous
// assertion throws before reaching a manual card.remove().
afterEach(() => {
  releaseEditor?.();
  releaseEditor = undefined;
  for (const el of Array.from(document.body.children)) el.remove();
});

describe("mounting", () => {
  it("configures the background once and builds one element per badge", async () => {
    const card = await mountCard(CONFIG_3);

    expect(background(card)).not.toBeNull();
    expect(background(card).setConfigCalls).toBe(1);

    expect(badges(card)).toHaveLength(3);
    // Badges receive their config through createBadgeElement, so nothing
    // configures them afterwards.
    expect(badges(card).map((b) => b.setConfigCalls)).toEqual([0, 0, 0]);
  });
});

// One cast, in one place: the card only ever forwards hass, so a fixture
// carrying a single state is enough to tell one tick from the next.
const tick = (n: number): HomeAssistant =>
  ({ states: { "light.a": { state: String(n) } } }) as unknown as HomeAssistant;

describe("a hass tick", () => {
  it("neither reconfigures anything nor pushes hass twice", async () => {
    const card = await mountCard(CONFIG_3);

    const setConfigTotal = () =>
      background(card).setConfigCalls + badges(card).reduce((sum, b) => sum + b.setConfigCalls, 0);
    const hassTotal = () =>
      background(card).hassAssignments +
      badges(card).reduce((sum, b) => sum + b.hassAssignments, 0);

    // Mount configures the background once and no badge. Nothing has pushed
    // hass yet, because mountCard never assigns it.
    expect(setConfigTotal()).toBe(1);
    expect(hassTotal()).toBe(0);

    for (let i = 0; i < 10; i++) {
      card.hass = tick(i);
      await flush();
    }

    // Four elements, ten ticks, one push each: 40. Not 80.
    expect(hassTotal()).toBe(40);
    // Nothing reconfigured: still the single mount call. Not 41.
    expect(setConfigTotal()).toBe(1);
  });
});

describe("a real change", () => {
  it("still reconfigures the badges when the config changes", async () => {
    const card = await mountCard(CONFIG_3);
    expect(badges(card)[0]?.setConfigCalls).toBe(0);

    card.setConfig({
      ...CONFIG_3,
      items: CONFIG_3.items.map((item) => ({
        ...item,
        config: { ...item.config, name: "renamed" },
      })),
    });
    await flush();

    expect(badges(card).map((b) => b.setConfigCalls)).toEqual([1, 1, 1]);
    expect((badges(card)[0]!.config as { name?: string }).name).toBe("renamed");
  });

  it("marks the selected badge without reconfiguring anything", async () => {
    const card = await mountCard(CONFIG_3);

    let selected: number | undefined = 1;
    const editor: EditorChannel = {
      patchPosition: () => {},
      patchAnchor: () => {},
      select: () => {},
      selectedIndex: () => selected,
    };
    card.preview = true;
    releaseEditor = registerEditor(editor);
    await flush();

    expect(wrappers(card)[1]?.classList.contains("selected")).toBe(true);

    const before =
      background(card).setConfigCalls + badges(card).reduce((sum, b) => sum + b.setConfigCalls, 0);

    selected = 2;
    notifyEditors();
    await flush();

    expect(wrappers(card)[1]?.classList.contains("selected")).toBe(false);
    expect(wrappers(card)[2]?.classList.contains("selected")).toBe(true);
    expect(
      background(card).setConfigCalls + badges(card).reduce((sum, b) => sum + b.setConfigCalls, 0),
    ).toBe(before);
  });
});

const MIXED = {
  type: CARD_TYPE,
  image: "/local/plan.png",
  items: [
    { type: "badge", config: { type: "entity", entity: "light.a" } },
    { type: "element", config: { type: "state-icon", entity: "light.b" } },
  ],
};

describe("mixed item families", () => {
  it("creates a badge through the helpers and an icon through our own tag", async () => {
    const card = await mountCard(MIXED);
    const items = Array.from(root(card).querySelectorAll(".item"));
    expect(items[0]?.firstElementChild?.tagName.toLowerCase()).toBe(FAKE_TAG);
    expect(items[1]?.firstElementChild?.tagName.toLowerCase()).toBe(ICON_TAG);
  });

  it("still configures only the background on mount", async () => {
    const card = await mountCard(MIXED);
    expect(background(card)?.setConfigCalls).toBe(1);
  });

  it("pushes hass to every child, whatever its family", async () => {
    const card = await mountCard(MIXED);
    card.hass = { states: {} } as never;
    const icon = root(card).querySelector(ICON_TAG) as { hass?: unknown };
    expect(icon.hass).toBeDefined();
    expect(badges(card)[0]?.hassAssignments).toBeGreaterThan(0);
  });

  it("rebuilds when a kind changes, not when another key does", async () => {
    const card = await mountCard(MIXED);
    const before = root(card).querySelector(ICON_TAG);

    card.setConfig({
      ...MIXED,
      items: [
        MIXED.items[0],
        { type: "element", config: { type: "state-icon", entity: "light.c" } },
      ],
    });
    await card.updateComplete;
    await flush();
    expect(root(card).querySelector(ICON_TAG)).toBe(before);
  });
});
