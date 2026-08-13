import { defineConfig } from "@rstest/core";

export default defineConfig({
  // The card is a Lit element: its lifecycle needs a DOM. happy-dom is the
  // light end of what rstest supports — we assert call counts, not layout, so
  // a real browser would buy nothing. If custom elements or adoptedStyleSheets
  // misbehave here, "jsdom" is a drop-in replacement (and its own dependency).
  testEnvironment: "happy-dom",
  include: ["src/**/*.test.ts"],
});
