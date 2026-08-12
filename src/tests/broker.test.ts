import { describe, expect, it } from "@rstest/core";
import { activeEditor, notifyEditors, registerEditor, subscribeEditors } from "../broker";

const channel = () => ({
  patchPosition: () => undefined,
  select: () => undefined,
  selectedIndex: () => undefined,
});

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

describe("subscribeEditors", () => {
  it("fires once on subscription, so a late subscriber is not left stale", () => {
    let calls = 0;
    const unsubscribe = subscribeEditors(() => {
      calls += 1;
    });
    expect(calls).toBe(1);
    unsubscribe();
  });

  it("fires when an editor registers", () => {
    const seen: (boolean | undefined)[] = [];
    const unsubscribe = subscribeEditors(() => {
      seen.push(activeEditor() !== undefined);
    });
    const off = registerEditor(channel());
    expect(seen).toEqual([false, true]);
    off();
    unsubscribe();
  });

  it("fires when an editor unregisters", () => {
    const off = registerEditor(channel());
    const seen: (boolean | undefined)[] = [];
    const unsubscribe = subscribeEditors(() => {
      seen.push(activeEditor() !== undefined);
    });
    off();
    expect(seen).toEqual([true, false]);
    unsubscribe();
  });

  it("stops firing once unsubscribed", () => {
    let calls = 0;
    const unsubscribe = subscribeEditors(() => {
      calls += 1;
    });
    unsubscribe();
    const off = registerEditor(channel());
    expect(calls).toBe(1);
    off();
  });

  it("ignores a repeated unregister rather than notifying again", () => {
    const off = registerEditor(channel());
    let calls = 0;
    const unsubscribe = subscribeEditors(() => {
      calls += 1;
    });
    off();
    off();
    expect(calls).toBe(2); // once on subscribe, once for the real unregister
    unsubscribe();
  });
});

describe("notifyEditors", () => {
  it("wakes subscribers without a membership change, which is how a card learns the selection", () => {
    let calls = 0;
    const off = subscribeEditors(() => {
      calls += 1;
    });
    // Subscribing fires once; only what follows is the announcement under test.
    const baseline = calls;
    notifyEditors();
    expect(calls).toBe(baseline + 1);
    off();
    notifyEditors();
    expect(calls).toBe(baseline + 1);
  });
});
