import type { ToolId } from "./card/tools/tool";
import type { ImageBox } from "./image-box";
import type { Anchor, Position } from "./position";

/**
 * Which surface a selection was made on.
 *
 * - `list` — a row was clicked, or Add, or Back, or the ✕, or a row was dragged
 *   to a new position. All of those are gestures in the editor's own list.
 * - `picture` — the preview was tapped, on an item or on its background.
 *
 * The distinction is already material at the source — the card reaches the
 * editor through this channel, the list through a DOM event — so it is declared
 * rather than inferred.
 *
 * It decides one thing and one only: whether the **dialog's** scroll container
 * follows a form that is opening. A list origin means the reader asked to be
 * taken to that form, so it does; a picture origin means they are looking at the
 * picture, which must not move. Every other trigger — including a deletion or a
 * reorder, which carry a list origin because that is where they happen — opens
 * no form, and there the dialog never follows whatever the origin says.
 */
export type SelectOrigin = "list" | "picture";

/**
 * The single card → editor hop. Everything that changes the *config* comes back
 * through Home Assistant; only the selection, which is editor state and never
 * reaches the config, is read straight off the channel.
 */
export interface EditorChannel {
  patchPosition(index: number, position: Position): void;
  /**
   * An image element's box, and — when the gesture moved it — its position, in
   * **one** write. `patchAnchor`'s comment says why two would not do: they would
   * render the new box against the old coordinates for a frame.
   *
   * `box` carries `height` by its presence. Omitting the key is what keep-ratio
   * *is*, so this must never write `height: undefined`.
   */
  patchBox(index: number, box: ImageBox, position?: Position): void;
  patchAnchor(index: number, anchor: Anchor): void;
  /**
   * Open a badge's own form, the same way the pencil in the list does, or clear
   * the selection with undefined and fall back to the card's own form.
   */
  select(index: number | undefined, origin: SelectOrigin): void;
  /** The badge whose form is open, if any. */
  selectedIndex(): number | undefined;
  /**
   * The active tool, and where it lives.
   *
   * It is editor state, beside the selection, for the same reason: Home
   * Assistant rebuilds the card element on every config change, so a tool
   * remembered on the card would be lost after every resize and every move —
   * exactly when it is in use.
   */
  tool(): ToolId;
  setTool(tool: ToolId): void;
}

/**
 * The editor → card hop, and the only one. Nothing a card remembers survives a
 * commit made from the editor, so anything the editor needs from the live
 * preview has to be asked for *before* it writes.
 *
 * **The rebuild is conditional, and the condition is `preview`** — read out of
 * `hui-card` on frontend build `20260729.6` and measured against a live
 * dashboard. Its `update()` reduces to:
 *
 * ```js
 * this.config?.type !== previous?.type || this.preview
 *   ? this._loadElement(this.config)    // createCardElement: a new element
 *   : this._updateElement(this.config); // setConfig on the existing one
 * ```
 *
 * So a card on a **dashboard** keeps its element across a config change of the
 * same type — measured: same node before and after, replaced only when the type
 * changes. A card in the **edit dialog's preview** is rebuilt every time, which
 * is the only place this channel is ever used, so the rule above holds wherever
 * it is applied. Earlier comments on this line stated the rebuild
 * unconditionally; that was the preview generalised too far, and it is why the
 * editing flicker never showed up on a dashboard.
 */
export interface CardChannel {
  /**
   * The item's coordinates re-expressed under `anchor`, so that changing the
   * anchor does not move it. Only the card knows pixels. Undefined when it
   * cannot measure — the item is gone, or the card has not laid out yet — and
   * the caller then keeps the coordinates it has.
   */
  reanchor(index: number, anchor: Anchor): Position | undefined;
  /**
   * The preview's top edge in viewport coordinates, or undefined while it
   * cannot be measured.
   *
   * The editor holds the reader's framing across a commit by keeping this
   * anchor at the same place on screen. Undefined is not a failure: Home
   * Assistant destroys the card element and builds another on every config
   * change, and during that gap there is no preview at all. Its absence is
   * precisely the signal that the layout is not ready — an earlier attempt
   * anchored on the editor, which *does* survive the rebuild, and got a number
   * that was wrong by 838px.
   */
  viewportTop(): number | undefined;
  /**
   * The item's wrapper height as a percentage of the layer's height, rounded
   * to two decimal places. Undefined when it cannot measure — no wrapper, or a
   * zero-height layer — exactly as `reanchor` and `viewportTop` do.
   */
  measureImageHeight(index: number): number | undefined;
  /**
   * The item's coordinates re-expressed so that `box` does not move its
   * top-left, for an edit that changed the drawn box without asking for that
   * size — see `mustHoldTopLeft`. Undefined when it cannot measure, exactly as
   * `reanchor` and `measureImageHeight` answer, and the caller then keeps the
   * coordinates it has.
   *
   * The box is the **effective** one, what `effectiveBox` draws rather than
   * what the config stores: a live camera's height is dropped for rendering
   * only, which is precisely the case this exists for.
   */
  refit(index: number, box: ImageBox): Position | undefined;
}

const editors = new Set<EditorChannel>();
const cards = new Set<CardChannel>();
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

/**
 * Announce that something a card derives from the editor changed — today, the
 * selection. Registration already notifies; this is the same signal raised for a
 * state change rather than a membership change, so cards need only one
 * subscription.
 */
export const notifyEditors = notify;

export const registerEditor = (channel: EditorChannel): (() => void) => {
  editors.add(channel);
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    editors.delete(channel);
    notify();
  };
};

/**
 * Observe registry changes.
 *
 * Cards derive their editing state from `activeEditor()`, but the registry
 * changes when an editor mounts or unmounts — events outside any card's own
 * update cycle. Without this, a card computed its state only when it happened
 * to render for some other reason: it could miss the editor appearing (drag
 * never armed, badges still firing their actions) or disappearing (drag left
 * armed on a dashboard card).
 *
 * The listener fires once on subscription as well, so a subscriber that arrives
 * after the editor registered is not left holding a stale initial state — that
 * would merely move the race rather than close it.
 */
export const subscribeEditors = (listener: () => void): (() => void) => {
  listeners.add(listener);
  listener();
  return () => {
    listeners.delete(listener);
  };
};

/**
 * The active editor, if exactly one is mounted.
 *
 * This also discriminates the card-picker gallery from the edit dialog: Home
 * Assistant sets `preview` in both, but only the dialog mounts an editor, so the
 * drag layer stays inert in the gallery with no extra signal.
 */
export const activeEditor = (): EditorChannel | undefined =>
  editors.size === 1 ? [...editors][0] : undefined;

/**
 * Cards register only while they are editing, which is the same discriminator
 * `editing` itself is derived from. A dashboard's own cards are never in that
 * state, so exactly one card is registered while an edit dialog is open — the
 * preview. No notification goes with this registry: nothing derives state from
 * it, it is only ever read at the moment of a question.
 */
export const registerCard = (channel: CardChannel): (() => void) => {
  cards.add(channel);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    cards.delete(channel);
  };
};

export const activeCard = (): CardChannel | undefined =>
  cards.size === 1 ? [...cards][0] : undefined;
