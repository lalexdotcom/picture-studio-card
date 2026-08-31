import { defineConfig } from "@rstest/core";

export default defineConfig({
  projects: [
    {
      // Most of the suite. The card is a Lit element: its lifecycle needs a
      // DOM, and happy-dom is the light end of what rstest supports. We assert
      // call counts and rendered structure here, not layout, so a real browser
      // would buy nothing and cost seconds on every run.
      name: "happy-dom",
      testEnvironment: "happy-dom",
      include: ["src/tests/happy-dom/**/*.test.ts"],
    },
    {
      // Anything happy-dom cannot answer: computed styles, real layout and
      // hit-testing, pointer-driven drag. Chromium only — see the rationale in
      // .devcontainer/post-create.sh, which installs the matching binary.
      name: "playwright",
      include: ["src/tests/playwright/**/*.test.ts"],
      browser: {
        enabled: true,
        provider: "playwright",
        browser: "chromium",
        // rstest infers this from CI, which would mean headed locally — and
        // the devcontainer has no X server, so Chromium refuses to start.
        // Override with `--browser.headless=false` when you want to watch it.
        headless: true,
      },
    },
    {
      // The release scripts are bash, and what they guarantee is a set of
      // refusals. Each test builds a throwaway git repository, runs the real
      // script against it and asserts on its exit status and on the files it
      // leaves — which is spec decision 12's "throwaway clone", automated so it
      // runs on every push rather than when someone remembers.
      name: "scripts",
      include: ["src/tests/scripts/**/*.test.ts"],
    },
  ],
});
