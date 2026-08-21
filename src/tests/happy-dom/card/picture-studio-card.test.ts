import { afterEach, describe, expect, it, rstest } from "@rstest/core";
import type { EditorChannel } from "../../../broker";
import { notifyEditors, registerEditor } from "../../../broker";
import { PictureStudioCard } from "../../../card/picture-studio-card";
import { CARD_TAG, CARD_TYPE, ICON_TAG, LABEL_TAG, PROBE_TAG, PROBE_TYPE } from "../../../config";

import type { HomeAssistant } from "../../../types";
import {
  background,
  badges,
  CONFIG_3,
  cssRules,
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

/**
 * What the card actually put on the picture for an item — the element inside its
 * wrapper. Asserting on this rather than on a spy is what distinguishes the badge
 * Home Assistant handed back from the one the card built to replace it.
 */
const drawn = (card: PictureStudioCard, index = 0) =>
  wrappers(card)[index]?.firstElementChild as (HTMLElement & { config?: unknown }) | null;

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

describe("element tag routing", () => {
  it("mounts the label tag for a state-label item", async () => {
    const card = await mountCard({
      type: CARD_TYPE,
      image: "/local/plan.png",
      items: [{ type: "element", config: { type: "state-label", entity: "sensor.a" } }],
    });
    expect(root(card).querySelector(".item")?.firstElementChild?.tagName.toLowerCase()).toBe(
      LABEL_TAG,
    );
  });

  it("still mounts the icon tag for a state-icon item", async () => {
    const card = await mountCard({
      type: CARD_TYPE,
      image: "/local/plan.png",
      items: [{ type: "element", config: { type: "state-icon", entity: "light.b" } }],
    });
    expect(root(card).querySelector(".item")?.firstElementChild?.tagName.toLowerCase()).toBe(
      ICON_TAG,
    );
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

  it("marks only the conditional item, and only in preview", async () => {
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

describe("a panel view's card tokens", () => {
  it("reflects isPanel, the signal hui-card assigns from the view's layout", async () => {
    const card = await mountCard(CONFIG_3);
    expect(card.hasAttribute("ispanel")).toBe(false);

    card.isPanel = true;
    await card.updateComplete;

    expect(card.hasAttribute("ispanel")).toBe(true);
  });

  it("restores the three tokens the panel view zeroes, on the items", () => {
    const items = cssRules(PictureStudioCard.styles).get(":host([ispanel]) .item");
    expect(items).toContain("--ha-card-border-radius: var(--restore-card-border-radius);");
    expect(items).toContain("--ha-card-border-width: var(--restore-card-border-width);");
    expect(items).toContain("--ha-card-box-shadow: var(--restore-card-box-shadow);");
  });

  it("leaves the host itself zeroed, so the card still touches the view's edges", () => {
    expect(cssRules(PictureStudioCard.styles).get(":host([ispanel])")).toBeUndefined();
  });
});

describe("editing flag on element rebuild", () => {
  const LABEL_CONFIG = {
    type: CARD_TYPE,
    image: "/local/plan.png",
    items: [{ type: "element", config: { type: "state-label", entity: "sensor.a" } }],
  };

  const labelEl = (card: PictureStudioCard): HTMLElement & { editing?: boolean } =>
    root(card).querySelector(LABEL_TAG) as HTMLElement & { editing?: boolean };

  it("carries editing=true onto a rebuilt label element after a config change", async () => {
    const card = await mountCard(LABEL_CONFIG);

    // Enter editing mode: preview=true plus a registered editor, matching the
    // pattern used elsewhere in this suite.
    card.preview = true;
    releaseEditor = registerEditor({
      patchPosition: () => {},
      patchAnchor: () => {},
      select: () => {},
      selectedIndex: () => undefined,
    });
    await flush();

    expect((card as unknown as { editing: boolean }).editing).toBe(true);
    expect(labelEl(card)?.editing).toBe(true);

    // Force a DOM rebuild by changing the item's shape (adding visibility).
    card.setConfig({
      ...LABEL_CONFIG,
      items: [
        {
          type: "element",
          config: { type: "state-label", entity: "sensor.a" },
          visibility: [{ condition: "screen" }],
        },
      ],
    });
    await card.updateComplete;
    await flush();

    // The rebuilt label element must receive editing=true, not default to false.
    expect(labelEl(card)?.editing).toBe(true);
  });
});

describe("an unknown item does not shift the items after it", () => {
  it("gives the second element its own config, not the first one's", async () => {
    const card = await mountCard({
      items: [
        {
          type: "element",
          position: { top: "10%", left: "10%" },
          config: { type: "state-icon", entity: "light.a" },
        },
        { type: "badgee" },
        {
          type: "element",
          position: { top: "20%", left: "20%" },
          config: { type: "state-icon", entity: "light.b" },
        },
      ],
    });
    const icons = [...card.shadowRoot!.querySelectorAll(ICON_TAG)] as {
      _config?: { entity?: string };
    }[];
    expect(icons).toHaveLength(2);
    // The whole point: without the hole, icons[1] receives items[1]'s config —
    // which is the unknown item — and the third item is never reached.
    expect(icons[0]?._config?.entity).toBe("light.a");
    expect(icons[1]?._config?.entity).toBe("light.b");
  });

  it("builds no wrapper and no probe for it", async () => {
    const card = await mountCard({
      items: [
        { type: "badgee", visibility: [{ condition: "user", users: [] }] },
        {
          type: "element",
          position: { top: "20%", left: "20%" },
          config: { type: "state-icon", entity: "light.b" },
        },
      ],
    });
    expect(card.shadowRoot!.querySelectorAll(".item")).toHaveLength(1);
    expect(card.shadowRoot!.querySelectorAll(PROBE_TAG)).toHaveLength(0);
  });

  it("propagates a config update to the correct element on the sameShape path", async () => {
    // The sameShape else branch reads children by index: _elements[index].
    // A skip would leave _elements = [iconA, iconB] (length 2 against 3 items),
    // so _elements[2] is undefined and the third item's config update is dropped.
    // A hole leaves _elements = [iconA, undefined, iconB], so _elements[2]
    // is the right element and receives the updated config.
    const baseItems = [
      {
        type: "element",
        position: { top: "10%", left: "10%" },
        config: { type: "state-icon", entity: "light.a" },
      },
      { type: "badgee" },
      {
        type: "element",
        position: { top: "20%", left: "20%" },
        config: { type: "state-icon", entity: "light.b" },
      },
    ];
    const card = await mountCard({ items: baseItems });

    // Same item types → _renderedTypes matches → sameShape=true → else branch runs.
    card.setConfig({
      items: [
        baseItems[0],
        baseItems[1],
        {
          type: "element",
          position: { top: "20%", left: "20%" },
          config: { type: "state-icon", entity: "light.c" },
        },
      ],
    });
    await flush();

    const icons = [...card.shadowRoot!.querySelectorAll(ICON_TAG)] as {
      _config?: { entity?: string };
    }[];
    expect(icons).toHaveLength(2);
    expect(icons[0]?._config?.entity).toBe("light.a");
    // With a skip: _elements[2] is undefined, config update is dropped → still "light.b".
    // With a hole: _elements[2] is iconB, config update lands → "light.c".
    expect(icons[1]?._config?.entity).toBe("light.c");
  });
});

describe("hui-error-badge display in editing mode", () => {
  // Failure text recorded before retargeting (F01):
  // "expected 'none' to be '' // Object.is equality"
  // entty is now caught by isSupportedBadgeType before createBadgeElement is
  // called, so the display-clearing code (for HA's grace-period timer) was
  // never reached. The test now uses a custom: type which goes through the
  // existing path: createBadgeElement(item.config) → hui-error-badge → clear.
  const ERROR_BADGE_CONFIG = {
    type: CARD_TYPE,
    image: "/local/plan.png",
    items: [
      {
        type: "badge",
        position: { top: "10%", left: "10%" },
        config: { type: "custom:entty" },
      },
    ],
  };

  const makeErrorBadge = (): HTMLElement => {
    // Simulate HA's badge factory: returns hui-error-badge with display hidden.
    const el = document.createElement("hui-error-badge");
    el.style.display = "None";
    return el;
  };

  const mountWithErrorBadge = async (editing: boolean): Promise<HTMLElement> => {
    installHelpers(); // ensure CARD_TAG is registered before overriding loadCardHelpers
    (window as unknown as { loadCardHelpers: unknown }).loadCardHelpers = async () => ({
      createHuiElement: () => document.createElement(FAKE_TAG),
      createBadgeElement: makeErrorBadge,
    });
    const card = document.createElement(CARD_TAG) as PictureStudioCard;
    card.setConfig(ERROR_BADGE_CONFIG);
    if (editing) {
      card.preview = true;
      releaseEditor = registerEditor({
        patchPosition: () => {},
        patchAnchor: () => {},
        select: () => {},
        selectedIndex: () => undefined,
      });
    }
    document.body.append(card);
    await card.updateComplete;
    await flush();
    return root(card).querySelector("hui-error-badge") as HTMLElement;
  };

  afterEach(() => installHelpers());

  it("clears the inline display of hui-error-badge while editing", async () => {
    const badge = await mountWithErrorBadge(true);
    expect(badge.style.display).toBe("");
  });

  it("leaves the inline display of hui-error-badge untouched outside editing", async () => {
    const badge = await mountWithErrorBadge(false);
    expect(badge.style.display).toBe("none");
  });
});

describe("cold-start guard: hui-error-badge not yet registered", () => {
  // happy-dom defines no Home Assistant element unless a test stubs one, so the
  // undefined case is the natural state here — no stub needed. The defined case
  // is what the last test in this block arranges; subsequent describe blocks then
  // inherit that state and test the working path.
  afterEach(() => {
    document.body.replaceChildren();
    installHelpers();
  });

  const makeHelpersForColdStart = () => {
    const helpers = {
      createHuiElement: (c: unknown) => {
        const el = document.createElement(FAKE_TAG);
        (el as { config?: unknown }).config = c;
        return el;
      },
      createBadgeElement: (c: unknown) => {
        const el = document.createElement(FAKE_TAG);
        (el as { config?: unknown }).config = c;
        return el;
      },
    };
    (window as unknown as { loadCardHelpers: unknown }).loadCardHelpers = async () => helpers;
    return helpers;
  };

  const mountWithUnsupportedBadge = async (): Promise<{
    card: PictureStudioCard;
    helpers: ReturnType<typeof makeHelpersForColdStart>;
  }> => {
    if (!customElements.get(CARD_TAG)) installHelpers();
    const helpers = makeHelpersForColdStart();
    const card = document.createElement(CARD_TAG) as PictureStudioCard;
    card.setConfig({
      type: CARD_TYPE,
      image: "/local/plan.png",
      items: [
        { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "state-label" } },
      ],
    });
    document.body.append(card);
    await card.updateComplete;
    await flush();
    return { card, helpers };
  };

  // Failure text recorded before fix (runner F01):
  // "expected [ …(1) ] to have a length of +0 but got 1"
  it("renders nothing for an unsupported badge when hui-error-badge is not registered", async () => {
    const { card } = await mountWithUnsupportedBadge();
    // No wrapper is added to the layer when _createChild returns undefined.
    expect(wrappers(card)).toHaveLength(0);
  });

  // Failure text recorded before fix (runner F02):
  // "expected [ …(1) ] to have a length of +0 but got 1" (wrappers assertion;
  // the "not called with error" assertion is never reached under the current code)
  it("makes a priming call whose result is discarded, not what gets rendered", async () => {
    const { helpers } = await mountWithUnsupportedBadge();
    const spy = rstest.spyOn(helpers, "createBadgeElement");
    // Re-trigger a fresh mount so the spy is in place before the call.
    const card2 = document.createElement(CARD_TAG) as PictureStudioCard;
    card2.setConfig({
      type: CARD_TYPE,
      image: "/local/plan.png",
      items: [
        { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "state-label" } },
      ],
    });
    document.body.append(card2);
    await card2.updateComplete;
    await flush();
    // The priming call was made (to route through the guarded path and trigger the
    // dynamic import of hui-error-badge). Its result was discarded, not rendered.
    // The type is asserted literally: Home Assistant logs it to the console, so
    // this string is what tells a user which card caused the error line.
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: "picture-studio-priming" }));
    expect(wrappers(card2)).toHaveLength(0);
    // The call was NOT our error config — that badge is exactly what we refused.
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });

  // Home Assistant logs every factory call it cannot satisfy, and always in the
  // same shape: console.error(kind, config.type, error). This stub reproduces it,
  // and emits a second, unrelated line inside the same call so the filter has
  // something to let through.
  const mountWithLoggingHelpers = async (): Promise<{
    card: PictureStudioCard;
    seen: unknown[][];
    installed: (...args: unknown[]) => void;
    after: unknown;
  }> => {
    if (!customElements.get(CARD_TAG)) installHelpers();
    const helpers = {
      createHuiElement: (c: unknown) => {
        const el = document.createElement(FAKE_TAG);
        (el as { config?: unknown }).config = c;
        return el;
      },
      createBadgeElement: (c: unknown) => {
        if ((c as Record<string, unknown>).type === "picture-studio-priming") {
          console.error("badge", "unrelated", new Error("Unknown type encountered: unrelated"));
          console.error(
            "badge",
            "picture-studio-priming",
            new Error("Unknown type encountered: picture-studio-priming"),
          );
        }
        const el = document.createElement(FAKE_TAG);
        (el as { config?: unknown }).config = c;
        return el;
      },
    };
    (window as unknown as { loadCardHelpers: unknown }).loadCardHelpers = async () => helpers;

    const seen: unknown[][] = [];
    const original = console.error;
    const installed = (...args: unknown[]) => {
      seen.push(args);
    };
    console.error = installed;
    try {
      const card = document.createElement(CARD_TAG) as PictureStudioCard;
      card.setConfig({
        type: CARD_TYPE,
        image: "/local/plan.png",
        items: [
          { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "state-label" } },
        ],
      });
      document.body.append(card);
      await card.updateComplete;
      await flush();
      // Read inside the try: the finally below is the test harness putting the
      // console back, and it would mask whether the card had already done so.
      return { card, seen, installed, after: console.error };
    } finally {
      console.error = original;
    }
  };

  // Failure text recorded against the verdict reported beside the guard rather
  // than beside the drawn badge (runner F18): "expected [ [ 'badge',
  // 'state-label', …(1) ] ] to have a length of +0 but got 1" — the priming pass
  // wrote the line too.
  it("drops the priming line and stays quiet until the badge can be drawn", async () => {
    const { seen } = await mountWithLoggingHelpers();
    // The class never lands in this stub, so the badge is never drawn and there is
    // nothing to report yet.
    expect(seen.filter((args) => args[1] === "state-label")).toHaveLength(0);
    // And Home Assistant's line about our own sentinel never reaches the console.
    expect(seen.some((args) => args[1] === "picture-studio-priming")).toBe(false);
  });

  // Guards the opposite defect of the test above — a filter wide enough to eat
  // lines that are not ours. Failure text recorded against a wrapper that drops
  // everything (runner F16): "expected [] to have a length of 1 but got +0"
  it("lets every other line through untouched", async () => {
    const { seen } = await mountWithLoggingHelpers();
    const others = seen.filter((args) => args[1] === "unrelated");
    expect(others).toHaveLength(1);
    expect((others[0]?.[2] as Error | undefined)?.message).toBe(
      "Unknown type encountered: unrelated",
    );
  });

  // Failure text recorded against a swap with no restore (runner F16):
  // "expected false to be true // Object.is equality"
  it("puts console.error back once the priming call returns", async () => {
    const { installed, after } = await mountWithLoggingHelpers();
    expect(after === installed).toBe(true);
  });

  // Run last in this block: customElements.define is permanent, so subsequent
  // describe blocks (which test the "class available" path) inherit the definition.
  //
  // Failure text recorded before fix (runner F14):
  // "expected [] to have a length of 1 but got +0" — the item stayed a hole forever.
  // The test this replaced asserted requestUpdate had been called, which it had:
  // green, and guarding nothing, because neither `updated`'s config gate nor
  // `_syncItems`'s shape check lets a bare re-render reach the hole.
  // Two properties in one test, and not by preference: customElements.define is
  // permanent and happens here, so the moment the class lands can only be observed
  // once. What lands must therefore be watched by every card that cares about it —
  // the one still in the document, and the one taken out of it.
  it("draws the refused badge once available, and leaves a removed card alone", async () => {
    if (!customElements.get(CARD_TAG)) installHelpers();
    makeHelpersForColdStart();

    // entity-filter, not state-label: every earlier test in this block left a card
    // holding a whenDefined subscription, and the define below wakes all of them.
    // A type of its own is what lets the count assertion see only this card.
    const seen: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      seen.push(args);
    };
    try {
      const card = document.createElement(CARD_TAG) as PictureStudioCard;
      card.setConfig({
        type: CARD_TYPE,
        image: "/local/plan.png",
        items: [
          {
            type: "badge",
            position: { top: "10%", left: "10%" },
            config: { type: "entity-filter" },
          },
        ],
      });
      document.body.append(card);
      await card.updateComplete;
      await flush();
      expect(wrappers(card)).toHaveLength(0);
      // Nothing reported yet: this pass refused and primed, it drew nothing.
      expect(seen.filter((args) => args[1] === "entity-filter")).toHaveLength(0);

      // A second card, primed exactly like the first and then taken out of the
      // document before the class lands. Its own type again, so its silence is
      // its own and not inherited from a card another test left behind.
      const removed = document.createElement(CARD_TAG) as PictureStudioCard;
      removed.setConfig({
        type: CARD_TYPE,
        image: "/local/plan.png",
        items: [
          {
            type: "badge",
            position: { top: "10%", left: "10%" },
            config: { type: "power-total" },
          },
        ],
      });
      document.body.append(removed);
      await removed.updateComplete;
      await flush();
      removed.remove();

      // Simulate the class landing — the dynamic import the priming call
      // triggered, or another badge on the same dashboard having loaded the
      // module. setConfig is part of the stub on purpose: the card builds its own
      // error badge and calls it directly, so a bare HTMLElement would send every
      // test in and after this block down the catch and assert nothing.
      customElements.define(
        "hui-error-badge",
        class extends HTMLElement {
          config?: unknown;
          setConfig(config: unknown) {
            this.config = config;
          }
        },
      );
      await flush();

      expect(wrappers(card)).toHaveLength(1);
      expect(drawn(card)?.config).toEqual(
        expect.objectContaining({ type: "error", error: "Unsupported badge type: entity-filter" }),
      );
      // One line for one badge, across both passes of a cold load. _createChild
      // runs twice for this item — once to refuse and prime, once after the class
      // lands — and only the pass that draws reports.
      //
      // Failure text recorded against the verdict reported beside the guard
      // (runner F18) — the assertion above it fires first: "expected [ [ 'badge',
      // 'entity-filter', …(1) ] ] to have a length of +0 but got 1"
      expect(seen.filter((args) => args[1] === "entity-filter")).toHaveLength(1);

      // And the card that left the document did nothing at all. Its renderRoot
      // outlives the removal, so without the isConnected guard the callback would
      // rebuild it and report a badge nobody can see.
      //
      // Failure text recorded against the callback with no isConnected guard
      // (runner F19): "expected [ [ 'badge', 'power-total', …(1) ] ] to have a
      // length of +0 but got 1"
      expect(seen.filter((args) => args[1] === "power-total")).toHaveLength(0);
      expect(wrappers(removed)).toHaveLength(0);
    } finally {
      console.error = original;
    }
  });
});

describe("a native badge type outside CORE_BADGES", () => {
  afterEach(() => {
    document.body.replaceChildren();
    installHelpers(); // restore the default loadCardHelpers stub
  });

  // The spy must target the exact helpers object the card will receive — not a
  // separate call, since the default stub returns a new object each time.
  // Set up a stable reference and point loadCardHelpers at it, then spy.
  const makeTrackedHelpers = () => {
    const helpers = {
      createHuiElement: (c: unknown) => {
        const el = document.createElement(FAKE_TAG);
        (el as { config?: unknown }).config = c;
        return el;
      },
      createBadgeElement: (c: unknown) => {
        const el = document.createElement(FAKE_TAG);
        (el as { config?: unknown }).config = c;
        return el;
      },
    };
    (window as unknown as { loadCardHelpers: unknown }).loadCardHelpers = async () => helpers;
    return helpers;
  };

  // Failure text recorded against the previous construction (through
  // helpers.createBadgeElement, runner F15):
  // "expected 'fake-child' to be 'hui-error-badge' // Object.is equality"
  it("replaces state-label with our error badge with no probe seeded (regression)", async () => {
    // The defect: the card relied on a verdict from the editor's probe, which
    // only the editor's badge list ever starts. On a real dashboard, with no
    // editor open, no probe ran and the badge drew normally.
    // This test never seeds a probe verdict — the card must refuse on its own.
    if (!customElements.get(CARD_TAG)) installHelpers();
    makeTrackedHelpers();
    const card = document.createElement(CARD_TAG) as PictureStudioCard;
    card.setConfig({
      type: CARD_TYPE,
      image: "/local/plan.png",
      items: [
        { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "state-label" } },
      ],
    });
    document.body.append(card);
    await card.updateComplete;
    await flush();
    expect(drawn(card)?.tagName.toLowerCase()).toBe("hui-error-badge");
    expect(drawn(card)?.config).toEqual(
      expect.objectContaining({ type: "error", error: "Unsupported badge type: state-label" }),
    );
  });

  // Failure text recorded against the previous construction (runner F15):
  // "expected \"createBadgeElement\" to not be called with arguments:
  //  [ ObjectContaining {\"type\": \"error\"} ] … Number of calls: 2"
  it("builds the error badge itself rather than asking the factory for one", async () => {
    // state-label is the triggering case: also an element kind, so writing
    // type: badge was a silent way to get the wrong thing on the picture.
    if (!customElements.get(CARD_TAG)) installHelpers();
    const helpers = makeTrackedHelpers();
    const spy = rstest.spyOn(helpers, "createBadgeElement");
    const card = document.createElement(CARD_TAG) as PictureStudioCard;
    card.setConfig({
      type: CARD_TYPE,
      image: "/local/plan.png",
      items: [
        { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "state-label" } },
      ],
    });
    document.body.append(card);
    await card.updateComplete;
    await flush();
    // The badge on the picture carries our verdict, not the item's own config.
    // origConfig carries that config so the error badge's detail dialog can show
    // it — the same affordance Lovelace gives everywhere else.
    expect(drawn(card)?.config).toEqual({
      type: "error",
      error: "Unsupported badge type: state-label",
      origConfig: { type: "state-label" },
    });
    // And it was never asked of the factory: `error` is an always-loaded type,
    // whose branch in create-element-base is the one that fails on a cold
    // dashboard, returning HA's internal message in place of ours.
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });

  // The decoupling this guards: the console line used to be emitted from
  // _primeErrorBadge, which only runs while hui-error-badge is unregistered. On a
  // warm frontend — and on every frontend once upstream ships its fix — the card
  // then reported nothing at all, silently losing the channel.
  //
  // Failure text recorded against the log living in _primeErrorBadge (runner F17):
  // "expected undefined to be an instance of Error"
  it("reports the verdict to the console even when no priming is needed", async () => {
    if (!customElements.get(CARD_TAG)) installHelpers();
    makeTrackedHelpers();
    // Registered by the cold-start block above, so _createChild takes the direct
    // path and _primeErrorBadge never runs.
    expect(customElements.get("hui-error-badge")).toBeDefined();

    const seen: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      seen.push(args);
    };
    try {
      const card = document.createElement(CARD_TAG) as PictureStudioCard;
      card.setConfig({
        type: CARD_TYPE,
        image: "/local/plan.png",
        items: [
          { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "state-label" } },
        ],
      });
      document.body.append(card);
      await card.updateComplete;
      await flush();
    } finally {
      console.error = original;
    }

    const ours = seen.find((args) => args[0] === "badge" && args[1] === "state-label");
    const reported = ours?.[2] as Error | undefined;
    expect(reported).toBeInstanceOf(Error);
    expect(reported?.message).toBe("Unsupported badge type: state-label");
  });

  it("does not intercept a supported badge type", async () => {
    if (!customElements.get(CARD_TAG)) installHelpers();
    const helpers = makeTrackedHelpers();
    const spy = rstest.spyOn(helpers, "createBadgeElement");
    const card = document.createElement(CARD_TAG) as PictureStudioCard;
    card.setConfig({
      type: CARD_TYPE,
      image: "/local/plan.png",
      items: [
        {
          type: "badge",
          position: { top: "10%", left: "10%" },
          config: { type: "entity", entity: "light.a" },
        },
      ],
    });
    document.body.append(card);
    await card.updateComplete;
    await flush();
    // The card passed the item's own config through, unmodified.
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: "entity" }));
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });

  it("does not intercept a badge type Home Assistant cannot build (regression: entty)", async () => {
    // HA's badge factory returns hui-error-badge for unknown types like "entty".
    // The card must keep that — HA's message names the real problem better than
    // our generic "Unsupported badge type" would.
    if (!customElements.get(CARD_TAG)) installHelpers();
    // Helper that simulates HA: "entty" is unknown to HA, so its badge factory
    // returns hui-error-badge — the same element the probe checks against.
    const helpers = {
      createHuiElement: (c: unknown) => {
        const el = document.createElement(FAKE_TAG);
        (el as { config?: unknown }).config = c;
        return el;
      },
      createBadgeElement: (c: unknown) => {
        if ((c as Record<string, unknown>).type === "entty")
          return document.createElement("hui-error-badge");
        const el = document.createElement(FAKE_TAG);
        (el as { config?: unknown }).config = c;
        return el;
      },
    };
    (window as unknown as { loadCardHelpers: unknown }).loadCardHelpers = async () => helpers;
    const spy = rstest.spyOn(helpers, "createBadgeElement");
    const card = document.createElement(CARD_TAG) as PictureStudioCard;
    card.setConfig({
      type: CARD_TYPE,
      image: "/local/plan.png",
      items: [{ type: "badge", position: { top: "10%", left: "10%" }, config: { type: "entty" } }],
    });
    document.body.append(card);
    await card.updateComplete;
    await flush();
    // The card must NOT have substituted its own error badge — HA's message
    // "Unknown type encountered: entty" is more informative than ours. Both
    // candidates are a hui-error-badge, so the tag cannot tell them apart: the
    // discriminator is setConfig, which only our own construction calls.
    expect(drawn(card)?.tagName.toLowerCase()).toBe("hui-error-badge");
    expect(drawn(card)?.config).toBeUndefined();
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });

  it("does not intercept a custom: type whose resource never loaded (regression: custom:nodash)", async () => {
    // isSupportedBadgeType returns true for any custom:-prefixed type, so the
    // card never intercepts them — HA's own error badge (or hide-then-reveal
    // timer for a resource still loading) is untouched.
    if (!customElements.get(CARD_TAG)) installHelpers();
    const helpers = makeTrackedHelpers();
    const spy = rstest.spyOn(helpers, "createBadgeElement");
    const card = document.createElement(CARD_TAG) as PictureStudioCard;
    card.setConfig({
      type: CARD_TYPE,
      image: "/local/plan.png",
      items: [
        {
          type: "badge",
          position: { top: "10%", left: "10%" },
          config: { type: "custom:nodash" },
        },
      ],
    });
    document.body.append(card);
    await card.updateComplete;
    await flush();
    // The card must NOT have substituted its own error badge.
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });
});

describe("the header", () => {
  it("is absent when the heading holds nothing", async () => {
    const card = await mountCard({ type: CARD_TYPE, items: [] });
    expect(card.shadowRoot?.querySelector("picture-studio-heading")).toBeNull();
  });

  it("appears for an icon alone, with no title", async () => {
    const card = await mountCard({ type: CARD_TYPE, heading: { icon: "mdi:desk" }, items: [] });
    expect(card.shadowRoot?.querySelector("picture-studio-heading")).not.toBeNull();
  });

  it("appears for a badge alone", async () => {
    const card = await mountCard({
      type: CARD_TYPE,
      heading: { badges: [{ type: "entity", entity: "sensor.a" }] },
      items: [],
    });
    expect(card.shadowRoot?.querySelector("picture-studio-heading")).not.toBeNull();
  });

  it("no longer uses ha-card's own header", async () => {
    const card = await mountCard({ type: CARD_TYPE, heading: { title: "Office" }, items: [] });
    const haCard = card.shadowRoot?.querySelector("ha-card") as { header?: string } | null;
    expect(haCard?.header).toBeUndefined();
  });
});
