import { css, html, LitElement, nothing } from "lit";
import { cache } from "lit/directives/cache.js";
import {
  activeCard,
  type EditorChannel,
  notifyEditors,
  registerEditor,
  type SelectOrigin,
} from "../broker";
import {
  type BadgeItem,
  CARD_TYPE,
  type ElementConfig,
  type ElementItem,
  type HeadingConfig,
  hasHeading,
  normalizeConfig,
  type PictureStudioConfig,
  storedConfig,
} from "../config";
import type { Anchor, Position } from "../position";
import { localizeOwn } from "../strings";
import type { BadgeConfig, HomeAssistant, VisibilityCondition } from "../types";
import { stubBadgeConfig } from "./badge-catalog";
import { badgeIsBroken } from "./badge-existence";
import { stubElementConfig } from "./element-catalog";
import {
  backgroundData,
  backgroundSchema,
  entitySchema,
  filtersSchema,
  formHelper,
  mergeBackground,
  PICTURE_ENTITY,
} from "./form-schemas";
import { type FormSchema, formLabel, sectionData, sectionMerge } from "./form-section";
import { headerAdornments } from "./header-adornments";
import {
  addItem,
  itemsSeverity,
  moveItem,
  removeItem,
  replaceConfig,
  setAnchor,
  setVisibility,
} from "./items";
import { dialogScroller, formScroller, scrollIntoNearest, scrollToStart } from "./scroll";
import "./badge-form";
import "./badge-list";
import "./element-form";
import "./heading-section";
import "./section-panel";

/**
 * Home Assistant's own expansion transition, in milliseconds. It is not read
 * from anywhere — `ha-expansion-panel` hardcodes 300 in its CSS *and* a second
 * time in a `setTimeout` inside `willUpdate`, for the same reason we do: the
 * `transitionend` it would otherwise wait on is not available to it either.
 * Verified at frontend build 20260729.6. If upstream changes it, the scroll
 * lands early or late — visibly, never silently.
 */
const EXPAND_MS = 300;

/**
 * The ceiling on `_holdScroll`, in frames — a safety net, not the mechanism.
 * The hold normally ends when the rebuilt preview registers itself; this only
 * bounds the case where no rebuild ever comes, because Home Assistant declined
 * the config or the card is not the one in the dialog. About a second.
 */
const HOLD_MAX_FRAMES = 60;

/**
 * How many consecutive frames the scroll container's height must stay put
 * before `_holdScroll` lets go. Registration is not the end of the story: the
 * rebuilt card registers within a frame, then its image lays out and moves the
 * document a second time — measured, and that second move is what was landing
 * the reader elsewhere with the hold already over.
 */
const STABLE_FRAMES = 5;

export class PictureStudioEditor extends LitElement implements EditorChannel {
  static properties = {
    hass: { attribute: false },
    lovelace: { attribute: false },
    _config: { state: true },
    _editingIndex: { state: true },
  };

  static styles = [
    headerAdornments,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-4);
      }
      .severity {
        --mdc-icon-size: 20px;
        margin-inline-start: var(--ha-space-2, 8px);
      }
      .severity.error {
        color: var(--error-color);
      }
      .severity.warning {
        color: var(--warning-color);
      }
    `,
  ];

  declare hass?: HomeAssistant;
  declare lovelace?: unknown;
  declare _config?: PictureStudioConfig;
  declare _editingIndex: number | undefined;

  private _unregister?: () => void;
  /** Guards against a native child's config-changed echoing our own push. */
  private _applying = false;
  /** Where the last selection came from. See `updated`, which scrolls on it. */
  private _selectOrigin: SelectOrigin = "list";
  constructor() {
    super();
    this._editingIndex = undefined;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._unregister = registerEditor(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unregister?.();
    this._unregister = undefined;
  }

  setConfig(config: unknown): void {
    this._config = normalizeConfig(config);
  }

  /** The single card → editor entry point. */
  patchPosition(index: number, position: Position): void {
    const config = this._config;
    if (!config) return;
    const items = config.items.map((item, i) => {
      if (i !== index) return item;
      // Unreachable today: an unknown item has no layer in the card, so a drag
      // can never produce its index. Guard for consistency with setAnchor and
      // setVisibility, and to keep storedConfig's raw-passthrough the only path
      // for unknown items regardless of future callers.
      if (item.type === "unknown") return item;
      return { ...item, position };
    });
    this._commit({ ...config, items });
  }

  patchAnchor(index: number, anchor: Anchor): void {
    const config = this._config;
    if (!config) return;
    // Ask the preview *before* writing. Only the card knows pixels, and only it
    // can still see where the item sits under its current anchor — Home
    // Assistant rebuilds the card element on every config change, so after the
    // commit there is no "before" left anywhere to measure against.
    // Anchor and position then travel in one write: two commits would render the
    // new anchor against the old coordinates for a frame, which is the jump this
    // whole exchange exists to avoid.
    const position = activeCard()?.reanchor(index, anchor);
    this._commit({ ...config, items: setAnchor(config.items, index, anchor, position) });
  }

  /** Convergence point: drag, dialogs and forms all end here. */
  protected _commit(next: PictureStudioConfig): void {
    this._holdScroll();
    this._config = next;
    this._reemit(next);
  }

  /**
   * The scroll container the dialog owns, several shadow roots above us.
   * `parentNode` alone would stop at the first shadow boundary, so the walk
   * hops through hosts. Only a container that can actually move counts: an
   * `overflow: auto` that fits its content has no position to lose.
   */
  /**
   * The flattened-tree ancestors, which is what layout — and therefore
   * scrolling — actually follows. `parentNode` alone walks the *logical* tree:
   * this editor is distributed into a slot by Home Assistant's dialog, so its
   * light-DOM parent is not the box that contains it on screen. Following
   * `assignedSlot` first is what crosses that hop; the host jump then crosses
   * the shadow boundary. Measured the hard way — a walk without it found only
   * `html`, which never moved while the view plainly did.
   */
  /**
   * Blink keeps the scroll position when content above the viewport is replaced
   * — CSS scroll anchoring — and WebKit implements none of it. Home Assistant
   * rebuilds the card element on every config change, measured by marking the
   * instance and finding it gone, so on an iPhone every committed drag drops the
   * reader back at the top of the dialog. This is that anchoring, by hand.
   *
   * Held until the rebuild actually happens rather than for a fixed number of
   * frames: the preview announces itself to the broker, so the old instance
   * unregistering and a new one taking its place *is* the event. One further
   * frame lets the newcomer lay out before the hold lets go — after that the
   * position belongs to the user again, and holding it longer would fight a
   * deliberate scroll. `HOLD_MAX_FRAMES` only bounds the case where no rebuild
   * ever comes.
   *
   * It gets out of the way of a selection change, which is the one case where
   * moving the view is the point — see `updated`, which scrolls a newly opened
   * form to its own top. That is the whole rule: a commit must not move the
   * view, a selection may.
   */
  private _holdScroll(): void {
    const scroller = dialogScroller(this);
    if (!scroller) return;
    const top = scroller.scrollTop;
    const selection = this._editingIndex;
    const before = activeCard();
    let frames = 0;
    let rebuilt = false;
    let stable = 0;
    let lastHeight = scroller.scrollHeight;
    const hold = (): void => {
      if (this._editingIndex !== selection) {
        return;
      }
      // Absolute, deliberately. Restoring the *framing* rather than the offset
      // is the better idea in principle and was measured doing active harm on a
      // real iPhone: the rebuild is detected on the first frame, while the old
      // card is gone and the new one has not laid out, so the drift computed
      // then is meaningless — +838px, landing the reader at 995 instead of 157.
      // It would only ever matter if the preview's height changed, which a
      // position commit does not: same card, same image, same box.
      if (scroller.scrollTop !== top) scroller.scrollTop = top;
      const height = scroller.scrollHeight;
      if (height !== lastHeight) {
        lastHeight = height;
        stable = 0;
      } else {
        stable += 1;
      }

      if (!rebuilt) {
        const now = activeCard();
        rebuilt = now !== undefined && now !== before;
      }
      // Both conditions, and the height one is the load-bearing half: the card
      // registers within a frame, then lays out and moves the document again.
      if (rebuilt && stable >= STABLE_FRAMES) {
        return;
      }
      if (++frames < HOLD_MAX_FRAMES) requestAnimationFrame(hold);
    };
    requestAnimationFrame(hold);
  }

  /** Sole exit toward Home Assistant. */
  private _reemit(config: PictureStudioConfig): void {
    if (this._applying) return;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        // The one exit to HA, so the one place that serializes positions.
        detail: { config: { ...storedConfig(config), type: CARD_TYPE } },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * The only writer of `_editingIndex`. Cards mirror the selection to mark the
   * badge and have no other way to learn it, since it never reaches the config —
   * so every change has to be announced, and routing them all through here is
   * what keeps that true.
   */
  select(index: number | undefined, origin: SelectOrigin): void {
    if (this._editingIndex === index) return;
    this._selectOrigin = origin;
    this._editingIndex = index;
    notifyEditors();
  }

  /**
   * The item that should have a form open, or `undefined` when none should.
   * Two readers share this decision: render() (to choose list vs form) and
   * updated() (to know whether to scroll the editor to its top). Extracting it
   * here keeps both in sync automatically.
   */
  private _formTarget(): BadgeItem | ElementItem | undefined {
    if (this._editingIndex === undefined || !this._config) return undefined;
    const raw = this._config.items[this._editingIndex];
    if (!raw || raw.type === "unknown") return undefined;
    if (raw.type === "badge") {
      const type = String(raw.config.type ?? "");
      if (type && badgeIsBroken(type)) return undefined;
    }
    return raw;
  }

  selectedIndex(): number | undefined {
    return this._editingIndex;
  }

  private _backgroundChanged = (ev: CustomEvent<{ value: Record<string, unknown> }>): void => {
    ev.stopPropagation();
    if (!this._config || this._applying) return;
    this._commit(mergeBackground(this._config, ev.detail.value));
  };

  /**
   * One handler shape for the sections that are only fields. Bound per schema so
   * the merge touches exactly the keys that section rendered — a key another
   * section owns, or one this schema left out, is never written and never
   * dropped.
   */
  private _sectionChanged =
    (schema: FormSchema) =>
    (ev: CustomEvent<{ value: Record<string, unknown> }>): void => {
      ev.stopPropagation();
      if (!this._config || this._applying) return;
      this._commit(sectionMerge(schema, this._config, ev.detail.value));
    };

  private _headingChanged = (ev: CustomEvent<{ heading: HeadingConfig }>): void => {
    ev.stopPropagation();
    if (!this._config || this._applying) return;
    const heading = ev.detail.heading;
    const { heading: _drop, ...rest } = this._config;
    // The empty heading is dropped rather than written, for the same reason
    // storedConfig never writes a default chrome: a key that holds nothing.
    this._commit({
      ...(rest as PictureStudioConfig),
      ...(hasHeading(heading) ? { heading } : {}),
    });
  };

  private _onItemsExpandedChanged = (ev: CustomEvent<{ expanded: boolean }>): void => {
    // React only when the section is collapsed, never when it opens.
    // Our code never collapses a section — it only calls expand() — so a
    // detail.expanded of false can only have come from the user clicking the
    // header. Reacting to true as well would introduce a latent hazard: if
    // Home Assistant ever moved the fireEvent call from _toggleContainer into
    // willUpdate, our own "expand because an item was selected" would
    // immediately deselect that item and the feature would silently stop working.
    if (!ev.detail.expanded) this.select(undefined, "list");
  };

  private _addItem = async (
    ev: CustomEvent<{ family: "badge" | "element"; type: string }>,
  ): Promise<void> => {
    if (!this.hass) return;
    const item =
      ev.detail.family === "badge"
        ? ({ type: "badge", config: await stubBadgeConfig(ev.detail.type, this.hass) } as const)
        : ({ type: "element", config: stubElementConfig(ev.detail.type) } as const);
    // Read the config *after* the await, never before: stubBadgeConfig loads a
    // chunk, and anything the user does meanwhile — a drag commit, a delete, a
    // second Add — has already written a new one. Committing the pre-await
    // snapshot would silently undo it.
    const config = this._config;
    if (!config) return;
    this._commit({ ...config, items: addItem(config.items, item) });
    // Open the new item's form straight away: a stub is rarely usable as-is —
    // an element's has no entity at all — and this is what the native picker does.
    this.select(config.items.length, "list");
  };

  private _editBadge = (ev: CustomEvent<{ index: number }>): void => {
    this.select(ev.detail.index, "list");
  };

  private _badgeChanged = (ev: CustomEvent<{ badge: BadgeConfig }>): void => {
    ev.stopPropagation();
    const config = this._config;
    if (!config || this._editingIndex === undefined) return;
    this._commit({
      ...config,
      items: replaceConfig(config.items, this._editingIndex, ev.detail.badge),
    });
  };

  private _elementChanged = (ev: CustomEvent<{ element: ElementConfig }>): void => {
    ev.stopPropagation();
    const config = this._config;
    if (!config || this._editingIndex === undefined) return;
    this._commit({
      ...config,
      items: replaceConfig(config.items, this._editingIndex, ev.detail.element),
    });
  };

  private _anchorChanged = (ev: CustomEvent<{ anchor: Anchor }>): void => {
    ev.stopPropagation();
    if (this._editingIndex === undefined) return;
    this.patchAnchor(this._editingIndex, ev.detail.anchor);
  };

  private _visibilityChanged = (ev: CustomEvent<{ visibility?: VisibilityCondition[] }>): void => {
    ev.stopPropagation();
    const config = this._config;
    if (!config || this._editingIndex === undefined) return;
    this._commit({
      ...config,
      items: setVisibility(config.items, this._editingIndex, ev.detail.visibility),
    });
  };

  private _moveBadge = (ev: CustomEvent<{ oldIndex: number; newIndex: number }>): void => {
    const config = this._config;
    if (!config) return;
    const { oldIndex: from, newIndex: to } = ev.detail;
    this._commit({
      ...config,
      items: moveItem(config.items, from, to),
    });
    // Remap the selection through the same move so the mark follows the item.
    // Clearing it on a drag would remove the one visual that helps the user
    // find a broken item they just moved.
    const sel = this._editingIndex;
    if (sel === undefined) return;
    if (sel === from) {
      this.select(to, "list");
    } else if (from < sel && sel <= to) {
      this.select(sel - 1, "list"); // the moved item shifted everything between down
    } else if (to <= sel && sel < from) {
      this.select(sel + 1, "list"); // the moved item shifted everything between up
    }
    // Otherwise the selected item is outside the moved range — unchanged.
  };

  private _removeBadge = (ev: CustomEvent<{ index: number }>): void => {
    const config = this._config;
    if (!config) return;
    this._commit({ ...config, items: removeItem(config.items, ev.detail.index) });
    this.select(undefined, "list");
  };

  /**
   * A form opens at the top of itself, not at the scroll position of whatever
   * was showing before. Which container that means is not ours to guess: below
   * 1000px the dialog carries the scroll and the form's own container is inert,
   * above 1000px it is the other way round — so both are written and exactly one
   * of them answers. See `scroll.ts`.
   *
   * The one container that is *not* always written is the dialog's, and the
   * origin is what decides: a selection made on the picture must leave the
   * picture where it is, which is the whole reason `select` carries an origin.
   *
   * Guarded on the transition rather than on the value: an item's form
   * re-renders on every keystroke and every hass tick, and scrolling on each of
   * them would fight the user's own scrolling.
   */
  protected updated(changed: Map<string, unknown>): void {
    if (!changed.has("_editingIndex")) return;
    const prev = changed.get("_editingIndex") as number | undefined;
    const curr = this._editingIndex;
    // Three mutually exclusive branches of one decision. The form's container is
    // written in all three, unconditionally: below 1000px the write is inert, and
    // above it that container is the only one that moves.
    if (curr !== undefined && this._formTarget()) {
      const form = formScroller(this);
      if (form) scrollToStart(form, this);
      // The one place the origin is consulted, and the only trigger on which the
      // dialog's container moves at all: the reader clicked a row and asked to be
      // taken to its form. A picture origin means they are looking at the
      // picture, which must not be thrown off the screen to show them a form.
      if (this._selectOrigin === "list") {
        const dialog = dialogScroller(this);
        if (dialog) scrollToStart(dialog, this);
      }
    } else if (curr !== undefined) {
      // An item was selected but no form opened (unreadable item, or a badge
      // whose type is missing): expand the Items section and show the row.
      void this._showListAt(curr);
    } else if (prev !== undefined) {
      // The reader came back from a form, or deleted an item: expand the Items
      // section and bring the row into view.
      void this._showListAt(prev);
    }
  }

  private async _showListAt(index: number): Promise<void> {
    const section = this.shadowRoot?.querySelector("#items-section") as
      | (HTMLElement & { expand(): Promise<boolean> })
      | null;
    const opened = (await section?.expand()) ?? false;
    // Wait out the transition only when expand() actually started one and the
    // browser understands interpolate-size — otherwise there is nothing to wait
    // for. transitionend is refused on purpose: the container lives in the
    // panel's shadow root, and happy-dom never fires transition events, so a
    // scroll gated on it would never run in the suite and could not be tested.
    const supportsInterpolateSize =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("interpolate-size", "allow-keywords");
    if (opened && supportsInterpolateSize) {
      await new Promise<void>((resolve) => setTimeout(resolve, EXPAND_MS));
    }
    const list = this.shadowRoot?.querySelector("picture-studio-badge-list") as
      | (HTMLElement & { rowFor(i: number): HTMLElement | undefined })
      | null;
    const row = list?.rowFor(index);
    if (!row) return;
    // The form's container, and no other. `scrollIntoView` stood here and could
    // not make that distinction: it scrolls *every* ancestor container, so
    // showing the row in the list always dragged the picture along with it.
    // Below 1000px this write is inert and the picture stays put; above 1000px
    // it is the pane the reader is looking at and the picture never moves anyway.
    const form = formScroller(this);
    if (form) scrollIntoNearest(form, row);
  }

  protected render() {
    const config = this._config;
    const hass = this.hass;
    if (!config || !hass) return nothing;

    const editing = this._formTarget();

    if (editing) {
      return cache(
        editing.type === "badge"
          ? html`
              <picture-studio-badge-form
                .hass=${hass}
                .badge=${editing.config}
                .anchor=${editing.anchor}
                .visibility=${editing.visibility}
                @badge-changed=${this._badgeChanged}
                @anchor-changed=${this._anchorChanged}
                @visibility-changed=${this._visibilityChanged}
                @go-back=${() => this.select(undefined, "list")}
              ></picture-studio-badge-form>
            `
          : html`
              <picture-studio-element-form
                .hass=${hass}
                .element=${editing.config}
                .anchor=${editing.anchor}
                .visibility=${editing.visibility}
                @element-changed=${this._elementChanged}
                @anchor-changed=${this._anchorChanged}
                @visibility-changed=${this._visibilityChanged}
                @go-back=${() => this.select(undefined, "list")}
              ></picture-studio-element-form>
            `,
      );
    }

    const localize = hass.localize;
    const background = backgroundSchema(localize, config);
    const filters = filtersSchema(localize);
    const entity = entitySchema(localize);
    const label = (s: { name: string }) =>
      s.name === PICTURE_ENTITY ? localizeOwn(hass, "picture_entity") : formLabel(localize, s.name);
    const helper = (s: { name: string }) => formHelper(hass, s.name);

    return cache(html`
      <picture-studio-section open .label=${localizeOwn(hass, "section_background")} icon="mdi:image">
        <ha-form
          .hass=${hass}
          .data=${backgroundData(config)}
          .schema=${background}
          .computeLabel=${label}
          .computeHelper=${helper}
          @value-changed=${this._backgroundChanged}
        ></ha-form>
      </picture-studio-section>

      <picture-studio-section
        id="items-section"
        .label=${localizeOwn(hass, "items")}
        icon="mdi:format-list-bulleted"
        @expanded-changed=${this._onItemsExpandedChanged}
      >
        ${
          // The strongest state wins: one glyph, never two. Same vocabulary as
          // visibility-section.ts, and the same asymmetry — the normal case gets
          // no ink at all. Glyph first: it sits nearest the title.
          (() => {
            const severity = itemsSeverity(config.items);
            if (!severity) return nothing;
            return html`<ha-icon
              slot="event"
              class="severity ${severity}"
              icon=${severity === "error" ? "mdi:alert-circle" : "mdi:alert-outline"}
              title=${localizeOwn(hass, severity === "error" ? "items_error" : "items_warning")}
            ></ha-icon>`;
          })()
        }
        ${
          config.items.length
            ? html`<span class="count" slot="event">${config.items.length}</span>`
            : nothing
        }
        <picture-studio-badge-list
          .hass=${hass}
          .items=${config.items}
          .selectedIndex=${this._editingIndex}
          @item-add=${this._addItem}
          @item-edit=${this._editBadge}
          @item-moved=${this._moveBadge}
          @item-removed=${this._removeBadge}
        ></picture-studio-badge-list>
      </picture-studio-section>

      <picture-studio-section
        .label=${hass.localize("ui.panel.lovelace.editor.card.heading.name")}
        icon="mdi:format-title"
      >
        <picture-studio-heading-section
          .hass=${hass}
          .heading=${config.heading}
          @heading-changed=${this._headingChanged}
        ></picture-studio-heading-section>
      </picture-studio-section>

      <picture-studio-section .label=${localizeOwn(hass, "section_filters")} icon="mdi:image-filter-black-white">
        <ha-form
          .hass=${hass}
          .data=${sectionData(filters, config)}
          .schema=${filters}
          .computeLabel=${label}
          @value-changed=${this._sectionChanged(filters)}
        ></ha-form>
      </picture-studio-section>

      <picture-studio-section .label=${localizeOwn(hass, "section_entity")} icon="mdi:image-auto-adjust">
        <ha-form
          .hass=${hass}
          .data=${sectionData(entity, config)}
          .schema=${entity}
          .computeLabel=${label}
          @value-changed=${this._sectionChanged(entity)}
        ></ha-form>
      </picture-studio-section>
    `);
  }
}
