import type { LocalizeFunc } from "../types";

export interface FormField {
  name: string;
  selector?: unknown;
}

export type FormSchema = readonly FormField[];

/**
 * A section's data record, built from the schema that was actually rendered.
 *
 * Three lists govern a section: the schema, the data handed to `ha-form`, and
 * the set of keys dropped when the form leaves them empty. In the pre-1.5 editor
 * all three were the same fixed constant and could not disagree, so nothing
 * guarded them. One schema is conditional now — `camera_view` appears only for a
 * camera — so both are derived from the schema here and stay in step by
 * construction.
 */
export const sectionData = <T extends Record<string, unknown>>(
  schema: FormSchema,
  source: T,
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  for (const field of schema) {
    const value = source[field.name];
    if (value !== undefined) data[field.name] = value;
  }
  return data;
};

/** Empty for a form: never written, and the key is dropped instead. */
const isEmpty = (value: unknown): boolean => value === undefined || value === null || value === "";

/**
 * Fold a section's form data back into the config.
 *
 * Only the keys the schema rendered are touched. A key the schema did not render
 * is left exactly as it was — that is what keeps a conditional field from being
 * deleted as a side effect of editing its neighbour.
 */
export const sectionMerge = <C extends Record<string, unknown>>(
  schema: FormSchema,
  config: C,
  data: Record<string, unknown>,
): C => {
  const next: Record<string, unknown> = { ...config };
  for (const field of schema) {
    const value = data[field.name];
    if (isEmpty(value)) delete next[field.name];
    else next[field.name] = value;
  }
  return next as C;
};

/**
 * Home Assistant keys its labels on the field name, across three namespaces.
 *
 * `generic` first, as everywhere. Then `picture-elements`, the only namespace
 * that has `dark_mode_image` and `dark_mode_filter`. Then `elements`, which is
 * where `filter`, `state_image` and `state_filter` live — the namespace of the
 * image element, which is what our background is; `hui-image-element-editor`
 * resolves its own labels with the same chain. An unresolved key degrades to the
 * raw field name, never to blank, exactly as HA's own fallbacks do.
 */
const NAMESPACES = [
  "ui.panel.lovelace.editor.card.generic",
  "ui.panel.lovelace.editor.card.picture-elements",
  "ui.panel.lovelace.editor.elements",
] as const;

export const formLabel = (localize: LocalizeFunc, name: string): string => {
  for (const namespace of NAMESPACES) {
    const label = localize(`${namespace}.${name}`);
    if (label) return label;
  }
  return name;
};
