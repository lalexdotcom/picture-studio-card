import { describe, expect, it } from "@rstest/core";
import { activeEditor, registerEditor } from "./broker";

const channel = () => ({ patchPosition: () => undefined });

describe("broker", () => {
  it("has no active editor when none is registered", () => {
    expect(activeEditor()).toBeUndefined();
  });

  it("returns the sole registered editor", () => {
    const ch = channel();
    const off = registerEditor(ch);
    expect(activeEditor()).toBe(ch);
    off();
  });

  it("returns undefined once the editor unregisters", () => {
    const off = registerEditor(channel());
    off();
    expect(activeEditor()).toBeUndefined();
  });

  it("returns undefined when several editors are registered, rather than guessing", () => {
    const offA = registerEditor(channel());
    const offB = registerEditor(channel());
    expect(activeEditor()).toBeUndefined();
    offA();
    offB();
  });
});
