import type { Position } from "./position";

/**
 * The single card → editor hop. Everything that changes the *config* comes back
 * through Home Assistant; only the selection, which is editor state and never
 * reaches the config, is read straight off the channel.
 */
export interface EditorChannel {
  patchPosition(index: number, position: Position): void;
  /**
   * Open a badge's own form, the same way the pencil in the list does, or clear
   * the selection with undefined and fall back to the card's own form.
   */
  select(index: number | undefined): void;
  /** The badge whose form is open, if any. */
  selectedIndex(): number | undefined;
}

const editors = new Set<EditorChannel>();
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
