import { afterEach, describe, expect, it } from "@rstest/core";
import type { EditorChannel } from "../../broker";
import { notifyEditors, registerEditor } from "../../broker";
import type { PictureStudioCard } from "../../card/picture-studio-card";
import { CARD_TAG, CARD_TYPE, ICON_TAG, PROBE_TYPE } from "../../config";
import type { HomeAssistant } from "../../types";
import {
  background,
  badges,
  CONFIG_3,
  FAKE_TAG,
  flush,
  installHelpers,
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

  it("gives each wrapper the family class", async () => {
    const card = await mountCard(MIXED);
    const items = Array.from(root(card).querySelectorAll(".item"));
    expect(items[0]?.classList.contains("badge")).toBe(true);
    expect(items[1]?.classList.contains("element")).toBe(true);
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

describe("visibility probes", () => {
  const CONFIG = {
    type: "custom:picture-studio",
    image: "/local/plan.png",
    items: [
      {
        type: "badge",
        position: { top: "10%", left: "10%" },
        visibility: [{ condition: "state", entity: "light.a", state: "on" }],
        config: { type: "entity", entity: "light.a" },
      },
      {
        type: "badge",
        position: { top: "20%", left: "20%" },
        config: { type: "entity", entity: "light.b" },
      },
    ],
  };

  const probes = (card: PictureStudioCard): HTMLElement[] =>
    Array.from(root(card).querySelectorAll(".probe")) as HTMLElement[];

  const EDITOR_STUB: EditorChannel = {
    patchPosition: () => {},
    patchAnchor: () => {},
    select: () => {},
    selectedIndex: () => undefined,
  };

  it("creates one probe, for the conditional item only", async () => {
    const card = await mountCard(CONFIG);
    expect(probes(card).length).toBe(1);
  });

  it("puts the probe immediately before its own item", async () => {
    const card = await mountCard(CONFIG);
    expect(probes(card)[0]?.nextElementSibling).toBe(wrappers(card)[0]);
  });

  it("hands the probe the item's conditions and the phantom type", async () => {
    const card = await mountCard(CONFIG);
    const probe = probes(card)[0] as HTMLElement & { config?: Record<string, unknown> };
    expect(probe.config?.type).toBe(PROBE_TYPE);
    expect(probe.config?.visibility).toEqual(CONFIG.items[0]?.visibility);
  });

  it("pushes hass to the probes", async () => {
    const card = await mountCard(CONFIG);
    const probe = probes(card)[0] as HTMLElement & { hass?: unknown };
    const hass = { states: {}, themes: { darkMode: false }, language: "en", localize: () => "" };
    card.hass = hass as never;
    expect(probe.hass).toBe(hass);
  });

  it("creates none when the editor is already there at the first sync", async () => {
    releaseEditor = registerEditor(EDITOR_STUB);
    installHelpers();
    const card = document.createElement(CARD_TAG) as PictureStudioCard;
    card.preview = true;
    card.setConfig(CONFIG);
    document.body.append(card);
    await card.updateComplete;
    await flush();
    expect(probes(card).length).toBe(0);
  });

  it("forces a probe visible when preview arrives after it was built", async () => {
    // The false→true transition at mount: the preview can render before the
    // editor announces itself. The probe then exists, and `preview` is what
    // keeps it from hiding anything.
    const card = await mountCard(CONFIG);
    const probe = probes(card)[0] as HTMLElement & { preview?: boolean };
    expect(probe.preview).toBe(false);
    card.preview = true;
    await card.updateComplete;
    expect(probe.preview).toBe(true);
  });

  it("rebuilds when conditions appear on an item that had none", async () => {
    const card = await mountCard(CONFIG);
    expect(probes(card).length).toBe(1);
    card.setConfig({
      ...CONFIG,
      items: [CONFIG.items[0], { ...CONFIG.items[1], visibility: [{ condition: "screen" }] }],
    });
    await card.updateComplete;
    await flush();
    expect(probes(card).length).toBe(2);
  });

  it("rebuilds when conditions disappear", async () => {
    const card = await mountCard(CONFIG);
    card.setConfig({
      ...CONFIG,
      items: [{ ...CONFIG.items[0], visibility: undefined }, CONFIG.items[1]],
    });
    await card.updateComplete;
    await flush();
    expect(probes(card).length).toBe(0);
  });

  it("updates the probe's conditions when they change without the item gaining or losing them", async () => {
    const card = await mountCard(CONFIG);
    const probe = probes(card)[0] as HTMLElement & { config?: Record<string, unknown> };
    const newConditions = [{ condition: "state", entity: "light.b", state: "off" }];
    card.setConfig({
      ...CONFIG,
      items: [{ ...CONFIG.items[0], visibility: newConditions }, CONFIG.items[1]],
    });
    await card.updateComplete;
    await flush();
    expect(probe.config?.visibility).toEqual(newConditions);
  });
});

describe("the condition marker", () => {
  const CONFIG = {
    type: "custom:picture-studio",
    image: "/local/plan.png",
    items: [
      {
        type: "badge",
        position: { top: "40%", left: "80%" },
        visibility: [
          { condition: "state", entity: "light.a", state: "on" },
          { condition: "screen" },
        ],
        config: { type: "entity", entity: "light.a" },
      },
      {
        type: "badge",
        position: { top: "20%", left: "20%" },
        config: { type: "entity", entity: "light.b" },
      },
    ],
  };

  // editing is derived, never assigned: it comes from `preview` plus a
  // registered editor. releaseEditor and its afterEach already live at the top
  // of this file.
  const edit = async (card: PictureStudioCard): Promise<void> => {
    card.preview = true;
    releaseEditor = registerEditor({
      patchPosition: () => {},
      patchAnchor: () => {},
      select: () => {},
      selectedIndex: () => undefined,
    });
    await flush();
  };

  it("marks only the conditional item, and only while editing", async () => {
    const card = await mountCard(CONFIG);
    expect(wrappers(card)[0]?.classList.contains("conditional")).toBe(false);
    await edit(card);
    expect(wrappers(card)[0]?.classList.contains("conditional")).toBe(true);
    expect(wrappers(card)[1]?.classList.contains("conditional")).toBe(false);
  });

  it("marks on a dashboard in edit mode, where no editor is mounted", async () => {
    // Home Assistant sets preview on every card of a view in edit mode, and
    // that is exactly what holds conditional items on screen. The mark has to
    // follow the same signal, or an editing user sees items a viewing user
    // will not with nothing saying which.
    const card = await mountCard(CONFIG);
    card.preview = true;
    await card.updateComplete;
    expect((card as unknown as { editing: boolean }).editing).toBe(false);
    expect(wrappers(card)[0]?.classList.contains("conditional")).toBe(true);
    expect(wrappers(card)[1]?.classList.contains("conditional")).toBe(false);
  });

  it("points the marker towards the inside of the picture", async () => {
    const card = await mountCard(CONFIG);
    await edit(card);
    expect(wrappers(card)[0]?.classList.contains("marker-top-left")).toBe(true);
    expect(wrappers(card)[0]?.classList.contains("marker-top-right")).toBe(false);
  });

  it("clears the mark when the conditions go", async () => {
    const card = await mountCard(CONFIG);
    await edit(card);
    card.setConfig({
      ...CONFIG,
      items: [{ ...CONFIG.items[0], visibility: undefined }, CONFIG.items[1]],
    });
    await card.updateComplete;
    await flush();
    expect(wrappers(card)[0]?.classList.contains("conditional")).toBe(false);
    expect(wrappers(card)[0]?.classList.contains("marker-top-left")).toBe(false);
  });
});
