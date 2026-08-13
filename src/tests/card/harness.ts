import { PictureStudioCard } from "../../card/picture-studio-card";
import { CARD_TAG } from "../../config";

/**
 * Stands in for a badge or the background element. It counts what the CARD
 * does to it after creation — the creation helpers below deliberately do not
 * call setConfig, mirroring createBadgeElement(config), which carries the
 * config in. So a clean mount leaves exactly one setConfig call, on the
 * background, which the card configures explicitly.
 */
export class FakeChild extends HTMLElement {
  setConfigCalls = 0;
  hassAssignments = 0;
  config: unknown;
  #hass: unknown;

  setConfig(config: unknown): void {
    this.setConfigCalls++;
    this.config = config;
  }

  set hass(value: unknown) {
    this.hassAssignments++;
    this.#hass = value;
  }

  get hass(): unknown {
    return this.#hass;
  }
}

const FAKE_TAG = "fake-child";

const define = (tag: string, ctor: CustomElementConstructor): void => {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
};

const makeChild = (config: unknown): FakeChild => {
  const el = document.createElement(FAKE_TAG) as FakeChild;
  el.config = config;
  return el;
};

export const installHelpers = (): void => {
  define(FAKE_TAG, FakeChild);
  define(CARD_TAG, PictureStudioCard);
  (window as unknown as { loadCardHelpers: unknown }).loadCardHelpers = async () => ({
    createHuiElement: makeChild,
    createBadgeElement: makeChild,
  });
};

/** Settles Lit's update queue and the sync methods' awaits. */
export const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

export const mountCard = async (config: unknown): Promise<PictureStudioCard> => {
  installHelpers();
  const card = document.createElement(CARD_TAG) as PictureStudioCard;
  card.setConfig(config);
  document.body.append(card);
  await card.updateComplete;
  await flush();
  return card;
};

const root = (card: PictureStudioCard): ParentNode => card.renderRoot as unknown as ParentNode;

export const background = (card: PictureStudioCard): FakeChild =>
  root(card).querySelector(".background") as FakeChild;

export const badges = (card: PictureStudioCard): FakeChild[] =>
  Array.from(root(card).querySelectorAll(`.item > ${FAKE_TAG}`)) as FakeChild[];

export const wrappers = (card: PictureStudioCard): HTMLElement[] =>
  Array.from(root(card).querySelectorAll(".item")) as HTMLElement[];

export const CONFIG_3 = {
  type: "custom:picture-studio",
  image: "/local/plan.png",
  items: [
    {
      type: "badge",
      position: { top: "10%", left: "10%" },
      config: { type: "entity", entity: "light.a" },
    },
    {
      type: "badge",
      position: { top: "20%", left: "20%" },
      config: { type: "entity", entity: "light.b" },
    },
    {
      type: "badge",
      position: { top: "30%", left: "30%" },
      config: { type: "entity", entity: "light.c" },
    },
  ],
};
