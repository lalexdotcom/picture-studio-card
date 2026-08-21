import { afterEach, describe, expect, it } from "@rstest/core";
import {
  EDITOR_TAG,
  HEADING_SECTION_TAG,
  LIST_TAG,
  type PictureStudioConfig,
  SECTION_TAG,
} from "../../../config";
import { PictureStudioBadgeList } from "../../../editor/badge-list";
import { PictureStudioHeadingSection } from "../../../editor/heading-section";
import { PictureStudioEditor } from "../../../editor/picture-studio-editor";
import { PictureStudioSection } from "../../../editor/section-panel";

/**
 * Its own file, and not a describe inside `picture-studio-editor.test.ts`, for a
 * reason worth knowing before merging the two back together.
 *
 * That file's describes each end by setting `window.loadCardHelpers` back to
 * `undefined`. Nothing there notices, because the last renders they schedule
 * never get a turn before the file ends. This test holds a promise open and so
 * gives them one — and `probeBadgeType` reads that global straight from a
 * render, so it throws outside any test. The result is a file that fails while
 * every test in it passes, which is a confusing thing to hand the next reader.
 *
 * A fresh file has none of that history. Fixing the teardown in the other file
 * is the real remedy; it is a separate change, on tests this one did not touch.
 */

if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, PictureStudioEditor);
if (!customElements.get(SECTION_TAG)) customElements.define(SECTION_TAG, PictureStudioSection);
if (!customElements.get(HEADING_SECTION_TAG))
  customElements.define(HEADING_SECTION_TAG, PictureStudioHeadingSection);
if (!customElements.get(LIST_TAG)) customElements.define(LIST_TAG, PictureStudioBadgeList);

const CONFIG = {
  type: "custom:picture-studio",
  image: "/local/plan.png",
  items: [
    { type: "badge", position: { top: "10%", left: "10%" }, config: { type: "entity" } },
    { type: "badge", position: { top: "20%", left: "20%" }, config: { type: "entity" } },
  ],
} as unknown as PictureStudioConfig;

const mount = async (): Promise<PictureStudioEditor> => {
  const el = document.createElement(EDITOR_TAG) as PictureStudioEditor;
  el.setConfig(CONFIG);
  el.hass = { localize: () => "", states: {} } as never;
  document.body.append(el);
  await el.updateComplete;
  el.scrollIntoView = () => undefined;
  return el;
};

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * Adding a badge suspends: its stub comes from the badge's own class, which for
 * a native type has to be loaded first. Anything the user does in that window —
 * a drag landing, a delete, a second Add — has already written a new config by
 * the time the stub arrives.
 */
describe("adding a badge does not undo what landed while its stub loaded", () => {
  /**
   * Holds `loadCardHelpers` open so the test decides when `_addItem` resumes.
   * The helpers answer with an error badge, which is what ends `resolveBadgeClass`
   * right there — one suspension point to control, not three.
   */
  const gateHelpers = (): (() => void) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    window.loadCardHelpers = (async () => {
      await gate;
      return { createBadgeElement: () => document.createElement("hui-error-badge") };
    }) as never;
    return release;
  };

  const addBadge = (el: PictureStudioEditor): void => {
    el.shadowRoot
      ?.querySelector(LIST_TAG)
      ?.dispatchEvent(new CustomEvent("item-add", { detail: { family: "badge", type: "entity" } }));
  };

  it("commits against the config current at resume, not the one captured before", async () => {
    // Before the mount: the list probes its rows as it renders, and that probe
    // goes through the same global.
    const release = gateHelpers();
    const el = await mount();

    const commits: PictureStudioConfig[] = [];
    el.addEventListener("config-changed", (ev) => {
      commits.push((ev as CustomEvent<{ config: PictureStudioConfig }>).detail.config);
    });

    addBadge(el);

    // Home Assistant pushes a third item down while the stub is still loading:
    // the shape a drag commit or a second editor write leaves behind.
    el.setConfig({
      ...CONFIG,
      items: [
        ...CONFIG.items,
        { type: "badge", position: { top: "30%", left: "30%" }, config: { type: "entity" } },
      ],
    } as unknown as PictureStudioConfig);

    release();
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Four, not three: the item added on top of what was there at resume. Three
    // would mean the pre-await snapshot won and the third item was dropped.
    expect(commits).toHaveLength(1);
    expect(commits[0]?.items).toHaveLength(4);
  });
});
