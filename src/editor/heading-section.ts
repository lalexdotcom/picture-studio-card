import { css, html, LitElement, nothing } from "lit";
import type { HeadingConfig } from "../config";
import type { HomeAssistant } from "../types";
import { headingSchema } from "./form-schemas";
import { formLabel, sectionData, sectionMerge } from "./form-section";

/** Home Assistant's whole badge list: rows, drag handle, add menu, stubs. */
const HA_BADGES_EDITOR = "hui-heading-badges-editor";
/** The class whose static getConfigElement pulls that editor's chunk in. */
const HA_HEADING_CARD = "hui-heading-card";
interface HeadingCardClass {
  getConfigElement?: () => Promise<HTMLElement>;
}

/**
 * The Heading panel: the card's title and icon, then Home Assistant's own
 * heading-badge list.
 *
 * The badges are **not** a nested section — a panel inside a panel reads as a
 * level of structure that is not there. A rule and a caption separate them.
 *
 * `hui-heading-badges-editor` lives in a chunk requested from exactly one place
 * in the whole bundle: `HuiHeadingCard.getConfigElement()`. Calling that static
 * is what pulls it in; the element it returns is discarded. `hui-heading-card`
 * itself is guaranteed defined — it ships in the Lovelace panel's own chunk
 * group — but the editor is not, so the render is guarded: an undefined custom
 * element renders nothing at all, silently.
 */
export class PictureStudioHeadingSection extends LitElement {
  static properties = {
    hass: { attribute: false },
    heading: { attribute: false },
    _ready: { state: true },
  };

  declare hass?: HomeAssistant;
  declare heading?: HeadingConfig;
  declare _ready: boolean;

  constructor() {
    super();
    this._ready = !!customElements.get(HA_BADGES_EDITOR);
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this._load();
  }

  private async _load(): Promise<void> {
    if (this._ready) return;
    const heading = customElements.get(HA_HEADING_CARD) as unknown as HeadingCardClass | undefined;
    try {
      await heading?.getConfigElement?.();
    } catch {
      // A frontend that cannot build the heading card's editor leaves the badge
      // list undefined; the guarded render below is the whole fallback.
    }
    this._ready = !!customElements.get(HA_BADGES_EDITOR);
  }

  private _emit(heading: HeadingConfig): void {
    this.dispatchEvent(
      new CustomEvent("heading-changed", {
        detail: { heading },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _fieldsChanged = (ev: CustomEvent<{ value: Record<string, unknown> }>): void => {
    ev.stopPropagation();
    const schema = headingSchema(this.hass?.localize ?? (() => ""));
    const merged = sectionMerge(
      schema,
      { ...(this.heading ?? {}) } as Record<string, unknown>,
      ev.detail.value,
    );
    this._emit(merged as HeadingConfig);
  };

  private _badgesChanged = (ev: CustomEvent<{ badges: unknown[] }>): void => {
    ev.stopPropagation();
    this._emit({ ...(this.heading ?? {}), badges: ev.detail.badges });
  };

  private _editBadge = (ev: CustomEvent<{ index: number }>): void => {
    ev.stopPropagation();
    const index = ev.detail.index;
    const badges = this.heading?.badges ?? [];
    this.dispatchEvent(
      new CustomEvent("edit-sub-element", {
        detail: {
          config: badges[index],
          type: "heading-badge",
          // hui-element-editor holds this callback for the life of the
          // sub-editor, so it must read the list at call time rather than close
          // over the array it saw when the event was fired.
          saveConfig: (config: unknown) => {
            const next = [...(this.heading?.badges ?? [])];
            next[index] = config;
            this._emit({ ...(this.heading ?? {}), badges: next });
          },
        },
        bubbles: true,
        composed: true,
      }),
    );
  };

  protected render() {
    const hass = this.hass;
    if (!hass) return nothing;
    const schema = headingSchema(hass.localize);

    return html`
      <ha-form
        .hass=${hass}
        .data=${sectionData(schema, (this.heading ?? {}) as Record<string, unknown>)}
        .schema=${schema}
        .computeLabel=${(s: { name: string }) => formLabel(hass.localize, s.name)}
        @value-changed=${this._fieldsChanged}
      ></ha-form>
      <hr />
      <div class="badges-header">
        <span class="badges-title"
          >${hass.localize("ui.panel.lovelace.editor.card.heading.badges")}</span
        >
      </div>
      ${
        this._ready
          ? html`
              <hui-heading-badges-editor
                .hass=${hass}
                .badges=${this.heading?.badges ?? []}
                @heading-badges-changed=${this._badgesChanged}
                @edit-heading-badge=${this._editBadge}
              ></hui-heading-badges-editor>
            `
          : nothing
      }
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    hr {
      border: none;
      border-top: 1px solid var(--divider-color);
      margin: var(--ha-space-4) 0 var(--ha-space-3);
    }
    .badges-header {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      margin-bottom: var(--ha-space-2);
    }
    .badges-title {
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
    }
  `;
}
