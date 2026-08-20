import { css, html, LitElement, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { hasVisibility, type PictureItem } from "../config";
import { localizeOwn } from "../strings";
import type { CustomBadgeEntry, HomeAssistant, LocalizeFunc } from "../types";
import { type BadgeChoice, badgeCatalog, choiceLabel } from "./badge-catalog";
import { badgeVerdict, probeBadgeType } from "./badge-existence";
import { elementCatalog, elementLabel } from "./element-catalog";
import { itemIcon } from "./icons";
import { rowLabel } from "./items";

export interface AddChoice {
  value: string;
  label: string;
  icon: string;
}

/**
 * The human name of an item's kind, for the tooltip on its row icon. The add
 * menu shows the same name behind a family prefix, which is where the pairing
 * between glyph and kind is learned; here the prefix would only repeat what the
 * icon beside it already says.
 */
export const kindLabel = (
  item: PictureItem,
  localize: LocalizeFunc,
  // Required, not defaulted: the caller builds it once per render, and a
  // default would advertise "you may omit this" while quietly rebuilding the
  // whole catalogue on every call — once per row, on every hass tick.
  catalog: BadgeChoice[],
): string => {
  if (item.type === "unknown") return item.token ?? "";
  const type = String(item.config.type ?? "");
  if (item.type === "element") return elementLabel(localize, type);
  const choice = catalog.find((c) => c.type === type);
  return choice ? choiceLabel(localize, choice) : type;
};

/**
 * One list, two families. The plural labels are Home Assistant's own, which is
 * why the prefix costs no string of ours; the separator is ": " in every
 * language, since the thin space French typography wants before a colon would
 * need a per-locale format string — the string this choice avoids.
 */
export const addChoices = (localize: LocalizeFunc, custom?: CustomBadgeEntry[]): AddChoice[] => {
  const badges = localize("ui.panel.lovelace.editor.badges.name") || "Badges";
  const elements =
    localize("ui.panel.lovelace.editor.card.picture-elements.elements") || "Elements";
  return [
    ...elementCatalog().map((c) => ({
      value: `element:${c.type}`,
      label: `${elements}: ${elementLabel(localize, c.type)}`,
      icon: itemIcon("element", c.type),
    })),
    ...badgeCatalog(custom).map((c) => ({
      value: `badge:${c.type}`,
      label: `${badges}: ${choiceLabel(localize, c)}`,
      icon: itemIcon("badge", c.type),
    })),
  ];
};

/** Split on the FIRST colon: a badge type may hold one, as `custom:` does. */
export const splitChoiceValue = (
  value: string,
): { family: "badge" | "element"; type: string } | undefined => {
  const at = value.indexOf(":");
  if (at < 0) return undefined;
  const family = value.slice(0, at);
  if (family !== "badge" && family !== "element") return undefined;
  return { family, type: value.slice(at + 1) };
};

/** A label with an empty `show` draws nothing on the dashboard — say so here. */
const showsNothing = (item: PictureItem): boolean =>
  item.type === "element" &&
  item.config.type === "state-label" &&
  Array.isArray((item.config as { show?: unknown[] }).show) &&
  (item.config as { show: unknown[] }).show.length === 0;

/**
 * The worst state among the items, for the section header's glyph — error beats
 * warning, and neither draws anything.
 *
 * Deliberately built from the very predicates the rows use. Two places deciding
 * "is this item broken" would drift, and the row is the one that has to stay
 * right.
 */
export const itemsSeverity = (items: readonly PictureItem[]): "error" | "warning" | undefined => {
  let warning = false;
  for (const item of items) {
    if (item.type === "unknown") return "error";
    if (item.type === "badge") {
      const type = String((item.config as Record<string, unknown>).type ?? "");
      if (type && badgeVerdict(type) === "missing") return "error";
    }
    if (hasUnreadableVisibility(item) || showsNothing(item)) warning = true;
  }
  return warning ? "warning" : undefined;
};

/** An item whose `visibility` key is present but not a list — renders, but
    always shows, because the card cannot parse the conditions. Orange, not
    red: unlike an unreadable item it is still drawn and editable. Aligns
    with `hasVisibility` in config.ts, which is the "usable" gate: if
    `hasVisibility` is false but visibility is defined, this is true. */
const hasUnreadableVisibility = (item: PictureItem): boolean =>
  item.type !== "unknown" && item.visibility !== undefined && !Array.isArray(item.visibility);

export class PictureStudioBadgeList extends LitElement {
  static properties = {
    hass: { attribute: false },
    items: { attribute: false },
    selectedIndex: { attribute: false },
  };

  declare hass?: HomeAssistant;
  declare items: PictureItem[];
  declare selectedIndex: number | undefined;

  constructor() {
    super();
    this.items = [];
  }

  /**
   * The list reads top-down, the array stores bottom-up — so the first row is
   * the item painted last, the one the eye sees on top of the picture. Layer
   * lists have worked this way since Photoshop, and the array keeps the meaning
   * it has always had: the last item wins, which is what `z-index`-free DOM
   * order gives us and what every config already written says.
   *
   * The flip is its own inverse, so one function serves both directions. It
   * stops here, at the component boundary: every event this element fires
   * carries an array index, so the editor, `items.ts` and the card never learn
   * that a display order exists. That matters most for `item-edit`, whose index
   * becomes `_editingIndex` and travels all the way to the card to mark the
   * selected item — a display index escaping through there would highlight the
   * wrong item on the picture.
   */
  private _flip(index: number): number {
    return this.items.length - 1 - index;
  }

  private _fire(type: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  /** ha-dropdown reports the chosen entry on wa-select, not on the trigger. */
  private _add(ev: CustomEvent<{ item?: { value?: string } }>): void {
    const value = ev.detail?.item?.value;
    const choice = value ? splitChoiceValue(value) : undefined;
    if (choice) this._fire("item-add", choice);
  }

  /**
   * The add menu. `placement="bottom-end"` is how Home Assistant opens its own
   * dropdowns from a right-hand trigger — the menu hangs under the button and
   * aligns on its right edge rather than running off the dialog. An unsupported
   * placement would only fall back to the default position, so the guard the
   * project asks for elsewhere is not needed: nothing disappears.
   */
  private _addMenu(localize: LocalizeFunc) {
    return html`
      <ha-dropdown class="add" placement="bottom-end" @wa-select=${this._add}>
        <ha-button slot="trigger" appearance="filled" size="s">
          <ha-icon icon="mdi:plus" slot="start"></ha-icon>
          ${localize("ui.common.add") || "Add"}
        </ha-button>
        ${addChoices(localize, window.customBadges).map(
          (c) => html`<ha-dropdown-item .value=${c.value}
            ><ha-icon slot="icon" .icon=${c.icon}></ha-icon>${c.label}</ha-dropdown-item
          >`,
        )}
      </ha-dropdown>
    `;
  }

  protected render() {
    // Rendered before hass lands on the first paint; degrade to the raw key, as HA does.
    const localize: LocalizeFunc = this.hass?.localize ?? (() => "");
    // Built once per render: the whole badge catalogue would otherwise be rebuilt
    // once per row, on every hass tick.
    const catalog = badgeCatalog(window.customBadges);
    // Top-down: the first row is the item drawn last, hence on top. A copy —
    // reverse() mutates, and `items` belongs to the editor. Everything below is
    // built from `rows`, so a row's index is a display index throughout, and
    // _flip is applied exactly where one leaves this element.
    const rows = [...this.items].reverse();
    // Resolved once per render rather than once per row.
    const labels = rows.map((item) => {
      if (item.type !== "badge") return rowLabel(item, this.hass);
      const type = String(item.config.type ?? "");
      const choice = catalog.find((c) => c.type === type);
      return rowLabel(item, this.hass, choice ? choiceLabel(localize, choice) : undefined);
    });
    const kinds = rows.map((item) => kindLabel(item, localize, catalog));
    // Two independent sources put a row into the error state, and they render
    // identically: the model, for an item we could not read, and the probe, for
    // a badge type this Home Assistant does not have.
    const broken = rows.map((item) => {
      if (item.type === "unknown") return true;
      if (item.type !== "badge") return false;
      const type = String(item.config.type ?? "");
      // A badge with no type at all is legal and means `entity` — the factory's
      // last argument is the default type. Nothing to probe.
      if (!type) return false;
      probeBadgeType(type, () => this.requestUpdate());
      return badgeVerdict(type) === "missing";
    });
    // The glyph says which family the problem is in, whenever we know the family.
    const glyphs = rows.map((item, i) => {
      if (!broken[i]) return undefined;
      if (item.type !== "unknown") return "mdi:alert-box"; // probe verdict "missing" = badge family
      if (item.reason === "config-missing" && item.token === "badge") return "mdi:alert-box";
      return "mdi:alert-circle";
    });
    const secondary = rows.map((item, i) =>
      item.type !== "unknown" && broken[i]
        ? `${localizeOwn(this.hass, "unknown_badge_type")}: ${String(item.config.type ?? "")}`
        : labels[i]?.secondary,
    );
    // Display position of the selected array index; -1 when nothing is selected
    // so it can never accidentally match a real row.
    const selectedDisplay = this.selectedIndex !== undefined ? this._flip(this.selectedIndex) : -1;

    return html`
      <div class="header">
        <p class="hint">${localizeOwn(this.hass, "stacking_hint")}</p>
      </div>
      <ha-sortable
          handle-selector=".handle"
          draggable-selector=".item"
          @item-moved=${(ev: CustomEvent<{ oldIndex: number; newIndex: number }>) => {
            ev.stopPropagation();
            // ha-sortable reports the positions of the rows it can see, which are
            // display positions. Flipping both is equivalent to reversing the
            // array, moving, and reversing back — the splice is symmetric under
            // reversal — and it keeps one mechanism in the file rather than two.
            this._fire("item-moved", {
              oldIndex: this._flip(ev.detail.oldIndex),
              newIndex: this._flip(ev.detail.newIndex),
            });
          }}
        >
        <div class="rows">
          ${repeat(
            rows,
            // Keyed by the ARRAY index, not the row's own. `repeat` reuses a row
            // whose key did not move, and an item is added to the end of the
            // array — which is the top of the list. Keyed by display position,
            // every row's key would shift on every insertion, so every row would
            // be re-rendered and, worse, each DOM row would come to serve a
            // different item: the focus a keyboard user is holding stays on the
            // node and follows the position, not the item it was on.
            (_item, index) => this._flip(index),
            (item, index) => html`
              <div class="item ${index === selectedDisplay ? "selected" : ""}">
                <ha-icon class="handle" icon="mdi:drag-horizontal-variant"></ha-icon>
                <ha-icon
                  class="kind ${broken[index] ? "error" : ""}"
                  .icon=${
                    broken[index]
                      ? glyphs[index]
                      : itemIcon(
                          item.type as "badge" | "element",
                          String((item as { config?: { type?: unknown } }).config?.type ?? ""),
                        )
                  }
                  title=${kinds[index]}
                ></ha-icon>
                <div class="label">
                  <span class="primary">${labels[index]?.primary}</span>
                  ${
                    secondary[index]
                      ? html`<span class="secondary ${broken[index] ? "error" : ""}">${secondary[index]}</span>`
                      : nothing
                  }
                </div>
                ${
                  // A bare icon rather than a pill: .conditional wears one
                  // because it borrows ha-label's geometry, and a warning is not
                  // a label. Before the eye, so the row reads left to right from
                  // the most surprising fact.
                  !broken[index] && showsNothing(item)
                    ? html`<ha-icon
                        class="empty"
                        icon="mdi:alert-outline"
                        title=${localizeOwn(this.hass, "label_empty_hint")}
                      ></ha-icon>`
                    : nothing
                }
                ${
                  // An item whose visibility key is present but not a list
                  // renders fine, but its conditions are ignored. Show an
                  // orange marker so the problem is visible without opening
                  // Edit — the same shortcut showsNothing provides.
                  !broken[index] && hasUnreadableVisibility(item)
                    ? html`<ha-icon
                        class="empty"
                        icon="mdi:alert-outline"
                        title=${localizeOwn(this.hass, "visibility_unreadable")}
                      ></ha-icon>`
                    : nothing
                }
                ${
                  // States that the row carries visibility conditions. Not a
                  // control: no target, no ripple, no hover — and the same eye
                  // the form's own section is headed by, so the two read as one
                  // idea rather than two.
                  !broken[index] && hasVisibility(item)
                    ? html`<span
                        class="conditional"
                        title=${
                          localize("ui.panel.lovelace.editor.edit_card.tab_visibility") ||
                          localizeOwn(this.hass, "visibility")
                        }
                      ><ha-icon icon="mdi:eye"></ha-icon></span>`
                    : nothing
                }
                <ha-icon-button
                  .label=${localize("ui.common.edit") || "Edit"}
                  .disabled=${broken[index]}
                  @click=${() => this._fire("item-edit", { index: this._flip(index) })}
                  ><ha-icon icon="mdi:pencil"></ha-icon></ha-icon-button>
                <ha-icon-button
                  .label=${localize("ui.common.delete") || "Delete"}
                  @click=${() => this._fire("item-removed", { index: this._flip(index) })}
                  ><ha-icon icon="mdi:close"></ha-icon></ha-icon-button>
              </div>
            `,
          )}
        </div>
      </ha-sortable>
      ${this._addMenu(localize)}
    `;
  }

  protected updated(changedProperties: Map<string, unknown>): void {
    if (!changedProperties.has("selectedIndex") || this.selectedIndex === undefined) return;
    // selectedIndex is an array index; the list renders top-down, so flip it to
    // a display position before querying the DOM.
    const displayIndex = this._flip(this.selectedIndex);
    const itemRows = this.shadowRoot?.querySelectorAll(".item");
    const row = itemRows?.[displayIndex] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }

  static styles = css`
    /* The stacking hint, sitting off the first row by the same gap the rows keep
       between themselves. */
    .header {
      display: flex;
      gap: var(--ha-space-2, 8px);
      margin-bottom: var(--ha-space-2, 8px);
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      /* No margin of its own: the header row below carries the whole gap, and a
         second one here would also push the button off the caption's baseline. */
      margin: 0;
    }
    /* The geometry of Home Assistant's own entity list — the one the Entities,
       Distribution and History Graph editors all draw through hui-entity-editor:
       bordered rows of 48px, 8px apart, 12px of leading space and 4px of
       trailing, and no gap at all between the two actions.
       Rebuilt here rather than mounted as ha-md-list / ha-md-list-item: those
       ship in chunks this dialog is not guaranteed to load, and an undefined
       custom element renders nothing at all, silently — the whole list would
       vanish rather than degrade. */
    .rows {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2, 8px);
    }
    .rows:has(> *) {
      margin-bottom: var(--ha-space-2, 8px);
    }
    .item {
      display: flex;
      align-items: center;
      min-height: 48px;
      box-sizing: border-box;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-md, 8px);
      padding-inline-start: 12px;
      padding-inline-end: 4px;
    }
    .handle {
      cursor: move; /* fallback where grab is unsupported */
      cursor: grab;
      display: flex;
      flex: none;
      color: var(--secondary-text-color);
      margin-inline-end: 12px;
    }
    /* Says which family the row belongs to. Secondary colour and no target: it
       is a legend, not a control, and the tooltip carries the name. */
    .kind {
      display: flex;
      flex: none;
      color: var(--secondary-text-color);
      margin-inline-end: 12px;
    }
    /* The glyph replaces the kind rather than joining it: there is no kind to
       show. Home Assistant's own error vocabulary — the same "error" state that
       ha-alert and ha-visibility-status use — so the list and the form's
       Visibility header read as one language. No row tint: one bad item among
       twelve, and a full-width band buries the list. */
    .kind.error {
      color: var(--error-color);
    }
    .item .label .secondary.error {
      color: var(--error-color);
    }
    /* Selection ring for a broken item. --error-color, not --primary-color: this
       mark is only visible when the form was refused, so a primary ring would
       say something untrue. Drawn inside the border edge (outline-offset: -2px)
       so the left side is not clipped by the list's zero left padding.
       Twin lives in picture-studio-card.ts under .editing .item.selected
       (--primary-color, for items that can open a form). */
    .item.selected {
      outline: 2px solid var(--error-color);
      outline-offset: -2px;
    }
    .label {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .label > * {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .secondary {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    /* The same pill as the count in an item form's Visibility header:
       ha-label's dense geometry and its background formula. Drawn here rather
       than mounted, because ha-label pads its container to 12px a side — right
       beside a number, far too wide around a lone icon. */
    .conditional {
      display: inline-flex;
      align-items: center;
      flex: none;
      height: 20px;
      padding: 0 6px;
      border-radius: var(--ha-border-radius-md, 8px);
      background-color: rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.15);
      color: var(--secondary-text-color);
      margin-inline-end: var(--ha-space-2, 8px);
    }
    .conditional ha-icon {
      display: flex;
      --mdc-icon-size: 14px;
    }
    /* 16px, not the eye's 14: the eye can afford 14 because its pill gives it
       body, and a bare glyph has only its stroke. mdi:alert-outline rather than
       an eye-off, because two eyes side by side — one "has conditions", one
       "shows nothing" — would contradict each other half a centimetre apart. */
    .empty {
      display: flex;
      flex: none;
      color: var(--warning-color);
      --mdc-icon-size: 16px;
      margin-inline-end: var(--ha-space-2, 8px);
    }
    /* ha-icon-button pads itself out to a 48px touch target, which leaves a
       wide band of nothing between the two actions and before them. 36px is
       still a comfortable pointer target in a dialog and gives the row back its
       horizontal space — the label is what the eye should land on. */
    /* --ha-icon-button-size is the token ha-icon-button actually reads; the
       36px is the value every Home Assistant row editor sets, which is what
       closes the empty band between the two actions. */
    ha-icon-button {
      --ha-icon-button-size: 36px;
      color: var(--secondary-text-color);
      flex: none;
    }
    /* The trigger sizes itself; only the spacing is ours. */
    .add {
      display: block;
      margin-top: var(--ha-space-2, 8px);
    }
  `;
}
