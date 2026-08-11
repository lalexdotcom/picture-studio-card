import type { Position } from "./position";

/** The single card → editor hop. Everything coming back goes through Home Assistant. */
export interface EditorChannel {
  patchPosition(index: number, position: Position): void;
}

const editors = new Set<EditorChannel>();

export const registerEditor = (channel: EditorChannel): (() => void) => {
  editors.add(channel);
  return () => {
    editors.delete(channel);
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
