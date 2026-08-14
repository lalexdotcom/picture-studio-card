/**
 * Material Design Icon paths, inlined.
 *
 * The card is a single-file bundle with no dynamic import, and @mdi/js is not a
 * dependency, so every icon it draws is a path written out here. The ones that
 * appear in more than one form live in this module rather than being copied,
 * which is also what keeps the two item families looking alike: a shared icon is
 * shared because it is the same constant, not because someone remembered.
 */

/** mdiArrowLeft — the form's back button. */
export const BACK_PATH = "M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z";

/**
 * mdiCropFree — the placement section of both item families: "Position" for a
 * badge, "Size and position" for an element. Corner brackets read as framing
 * within an area, which is what placing an item on a picture is, and the frame
 * carries the notion of extent without claiming to be a resize handle.
 */
export const PLACEMENT_PATH =
  "M19,3H15V5H19V9H21V5C21,3.89 20.1,3 19,3M19,19H15V21H19A2,2 0 0,0 21,19V15H19M5,15H3V19A2,2 0 0,0 5,21H9V19H5M3,5V9H5V5H9V3H5A2,2 0 0,0 3,5Z";
