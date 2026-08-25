import { afterEach, describe, expect, it } from "@rstest/core";
import { ELEMENT_FORM_TAG, type ImageElementConfig } from "../../../config";
import { PictureStudioElementForm } from "../../../editor/element-form";
import { imageForm, KEEP_RATIO } from "../../../editor/image-form";
import type { HomeAssistant } from "../../../types";

if (!customElements.get(ELEMENT_FORM_TAG)) {
  customElements.define(ELEMENT_FORM_TAG, PictureStudioElementForm);
}

const hass = {
  states: {},
  themes: { darkMode: false },
  language: "en",
  localize: () => "",
} as unknown as HomeAssistant;

/**
 * The height written when keep-ratio is cleared must be measured AT THAT MOMENT,
 * never earlier.
 *
 * Found on 2026-08-25, in the browser, with the whole feature already reviewed
 * and green. Home Assistant's number field emits a `value-changed` on **every
 * keystroke**, so typing `40` into the width commits `4` first and `40` second.
 * The card re-rendered at 4%, the editor measured 4, and the form kept that
 * number until the user cleared the checkbox — writing a height of 4 for a width
 * of 40. Every reported symptom was the first digit typed: 60 gave 6, 15 and 17
 * both gave 1.
 *
 * A value captured at render time is a value that can go stale. A function
 * cannot: it answers when it is asked.
 */
describe("the freed height is measured at the moment keep-ratio is cleared", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  const element: ImageElementConfig = { type: "image", image: "/plan.png", width: 40 };

  const mount = async (measure: () => number | undefined) => {
    const form = document.createElement(ELEMENT_FORM_TAG) as PictureStudioElementForm;
    form.hass = hass;
    form.element = element;
    form.measureImageHeight = measure;
    document.body.append(form);
    await form.updateComplete;
    return form;
  };

  const untick = (form: PictureStudioElementForm): ImageElementConfig => {
    const events: Event[] = [];
    form.addEventListener("element-changed", (ev) => events.push(ev));
    // The box form is the "Size and position" panel's ha-form. Firing on the
    // element itself is enough: the listener is bound in the kind's template and
    // the event bubbles.
    const forms = form.shadowRoot?.querySelectorAll("ha-form") ?? [];
    const box = forms[forms.length - 1];
    box?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: { ...imageForm.toFormData(element), [KEEP_RATIO]: false } },
        bubbles: true,
      }),
    );
    expect(events).toHaveLength(1);
    return (events[0] as CustomEvent<{ element: ImageElementConfig }>).detail.element;
  };

  it("asks the card when the box is freed, not when the form last rendered", async () => {
    // The three numbers are deliberately all different, so no accident can make
    // this pass: 4 is the stale answer from mid-keystroke, 94 is the truth once
    // the width has settled, and 40 is `config.width` — the fallback. Asserting
    // 94 rules out both the stale value AND the fallback, which is what an
    // earlier draft of this test failed to do: it expected 40, which the
    // fallback satisfies, so it passed against the very code it was meant to
    // fail against.
    let answer = 4;
    const form = await mount(() => answer);
    await form.updateComplete;
    answer = 94;

    expect(untick(form).height).toBe(94);
  });

  it("falls back to the width when no preview can answer", async () => {
    const form = await mount(() => undefined);
    expect(untick(form).height).toBe(element.width);
  });
});

/**
 * An image element with no picture draws nothing at all — unlike a state-icon,
 * which gets Home Assistant's own missing-entity marker. The section that sets
 * one is therefore the section a freshly added item always needs, and it is
 * opened for the same reason the card's own Background section is.
 */
describe("the picture section opens by default", () => {
  it("carries `open` on the first panel and on no other", async () => {
    const form = document.createElement(ELEMENT_FORM_TAG) as PictureStudioElementForm;
    form.hass = hass;
    form.element = { type: "image", width: 20 };
    document.body.append(form);
    await form.updateComplete;

    const panels = [
      ...(form.shadowRoot?.querySelectorAll("ha-expansion-panel") ?? []),
    ] as (Element & { expanded?: boolean })[];
    expect(panels.length).toBeGreaterThan(1);
    // `expanded` is the property ha-expansion-panel actually renders from —
    // verified against frontend build 20260729.6. An earlier version of this
    // test asserted an `open` attribute, which the component never reads: the
    // panel stayed shut in the browser and the test stayed green, because it
    // was checking our markup rather than the thing Home Assistant acts on.
    expect(panels[0]?.expanded).toBe(true);
    // Opening more than one would defeat the point: the reader would have to
    // scroll past everything to reach the field they came for.
    expect(panels.slice(1).some((p) => p.expanded === true)).toBe(false);
  });
});

/**
 * A live camera keeps its own proportions whatever the config asks for.
 *
 * Not a choice: `hui-image` holds its `.ratio` container for a stream, because
 * no `<img>` ever loads to settle `_lastImageHeight`, and that container gives
 * `height: 100%` children nothing to resolve against. Measured on frontend
 * 20260729.6 against a real camera — in a box asked to be 196×49, the container
 * came out 196×110.3 and `ha-camera-stream` 196×0.
 *
 * So the checkbox reads as ticked and disabled, the warning says why at the
 * field that caused it, and **the height the user typed is never touched** —
 * `storedConfig` rewrites the whole config on every commit, so writing here
 * would delete a value from their YAML that leaving Live should give back.
 */
describe("a live camera forces the ratio", () => {
  const live: ImageElementConfig = {
    type: "image",
    camera_image: "camera.hall",
    camera_view: "live",
    width: 40,
    height: 20,
  };

  const mountWith = async (element: ImageElementConfig) => {
    const form = document.createElement(ELEMENT_FORM_TAG) as PictureStudioElementForm;
    form.hass = hass;
    form.element = element;
    document.body.append(form);
    await form.updateComplete;
    return form;
  };

  /**
   * Found by what it contains, not by its position. An earlier version took the
   * last `ha-form`, which is Interactions — the box form is the one before it,
   * and an index is exactly the kind of thing a new section silently breaks.
   */
  const boxForm = (form: PictureStudioElementForm) =>
    [...(form.shadowRoot?.querySelectorAll("ha-form") ?? [])].find((f) =>
      ((f as Element & { schema?: { name: string }[] }).schema ?? []).some(
        (field) => field.name === KEEP_RATIO,
      ),
    ) as (Element & { schema?: { name: string }[] }) | undefined;

  const boxSchema = (form: PictureStudioElementForm) => boxForm(form)?.schema ?? [];

  it("shows the checkbox ticked and disabled, and hides the height field", async () => {
    const form = await mountWith(live);
    const entry = boxSchema(form).find((f) => f.name === KEEP_RATIO) as
      | { disabled?: boolean }
      | undefined;
    expect(entry?.disabled).toBe(true);
    expect(boxSchema(form).some((f) => f.name === "height")).toBe(false);
  });

  it("warns at the field that caused it, not somewhere else", async () => {
    const form = await mountWith(live);
    const forms = form.shadowRoot?.querySelectorAll("ha-form") ?? [];
    const content = forms[0] as (Element & { warning?: Record<string, string> }) | undefined;
    expect(content?.warning?.camera_view).toBeTruthy();

    const auto = await mountWith({ ...live, camera_view: "auto" });
    const autoContent = (auto.shadowRoot?.querySelectorAll("ha-form") ?? [])[0] as
      | (Element & { warning?: Record<string, string> })
      | undefined;
    expect(autoContent?.warning).toBeUndefined();
  });

  it("never writes the height while the ratio is forced", async () => {
    const form = await mountWith(live);
    const events: Event[] = [];
    form.addEventListener("element-changed", (ev) => events.push(ev));
    // Nudging the width emits the whole record, keep_ratio included — which is
    // exactly how a forced tick would have deleted the height.
    boxForm(form)?.dispatchEvent(
      new CustomEvent("value-changed", {
        detail: { value: { ...imageForm.toFormData(live), [KEEP_RATIO]: true, width: 55 } },
        bubbles: true,
      }),
    );
    const next = (events[0] as CustomEvent<{ element: ImageElementConfig }>).detail.element;
    expect(next.width).toBe(55);
    expect(next.height).toBe(20);
  });
});

/**
 * `default_action` is what the selector DISPLAYS when the config carries
 * nothing. The icon can honestly show more-info, because an absent action there
 * really does behave as more-info. An image with no action does nothing at all.
 *
 * Reported after clicking an image and watching nothing happen: the form
 * promised more-info, the element was inert, and neither was wrong on its own.
 */
describe("an image promises no action it will not perform", () => {
  it("defaults tap_action to none, unlike the icon", async () => {
    const form = document.createElement(ELEMENT_FORM_TAG) as PictureStudioElementForm;
    form.hass = hass;
    form.element = { type: "image", width: 20 };
    document.body.append(form);
    await form.updateComplete;

    const interactions = [...(form.shadowRoot?.querySelectorAll("ha-form") ?? [])]
      .map((f) => (f as Element & { schema?: { name?: string }[] }).schema ?? [])
      .find((schema) => schema.some((field) => field.name === "interactions"));
    expect(interactions).toBeTruthy();

    const inner = (interactions?.[0] as { schema?: { name?: string; selector?: unknown }[] })
      ?.schema;
    const tap = inner?.find((f) => f.name === "tap_action") as
      | { selector?: { ui_action?: { default_action?: string } } }
      | undefined;
    expect(tap?.selector?.ui_action?.default_action).toBe("none");
  });
});
