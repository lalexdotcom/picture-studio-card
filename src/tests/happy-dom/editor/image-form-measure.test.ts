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
