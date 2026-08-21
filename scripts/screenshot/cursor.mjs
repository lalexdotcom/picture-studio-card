// A cursor for the captures. Chromium draws no pointer in a recording, so the
// gifs would show badges moving on their own. This paints one: MDI's
// cursor-default and cursor-pointer — the same glyphs on every OS, unlike a
// screenshot of the host's real cursor — white on a dark outline, so it stays
// readable over both the floor plan and a dialog surface.
//
// It follows the real pointer instead of being driven separately: the script
// moves Playwright's mouse, the overlay listens. The two cannot drift apart,
// and `cursor: pointer` under the tip is what swaps the glyph, so the hand
// appears exactly where Home Assistant would show it.

// mdi:cursor-default and mdi:cursor-pointer, with the hotspot each glyph
// points with, in viewBox units.
const GLYPHS = {
  default: {
    d: "M13.64,21.97C13.14,22.21 12.54,22 12.31,21.5L10.13,16.76L7.62,18.78C7.45,18.92 7.24,19 7,19A1,1 0 0,1 6,18V3A1,1 0 0,1 7,2C7.24,2 7.47,2.09 7.64,2.23L7.65,2.22L19.14,11.86C19.57,12.22 19.62,12.85 19.27,13.27C19.12,13.45 18.91,13.57 18.7,13.61L15.54,14.23L17.74,18.96C18,19.46 17.76,20.05 17.26,20.28L13.64,21.97Z",
    hot: [6.4, 2.2],
  },
  pointer: {
    d: "M13.75,10.19L14.38,10.32L18.55,12.4C19.25,12.63 19.71,13.32 19.65,14.06V14.19L19.65,14.32L18.75,20.44C18.69,20.87 18.5,21.27 18.15,21.55C17.84,21.85 17.43,22 17,22H10.12C9.63,22 9.18,21.82 8.85,21.47L2.86,15.5L3.76,14.5C4,14.25 4.38,14.11 4.74,14.13H5.03L9,15V4.5A2,2 0 0,1 11,2.5A2,2 0 0,1 13,4.5V10.19H13.75Z",
    hot: [10.9, 2.5],
  },
};

/**
 * Installs the overlay in every document the context loads. Exposes
 * `window.__cursor` with `raise()` — a dialog entering the top layer would
 * otherwise cover the cursor.
 */
export async function installCursor(context, { size = 26 } = {}) {
  await context.addInitScript(
    ([glyphs, size]) => {
      const install = () => {
        if (window.__cursor) return;
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", String(size));
        svg.setAttribute("height", String(size));
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        // White body, dark outline, and a soft shadow under it: the plan has
        // both black carpet and lit desktops, and one or the other would
        // swallow a flat cursor.
        path.setAttribute("fill", "#fff");
        path.setAttribute("stroke", "#101014");
        path.setAttribute("stroke-width", "0.9");
        path.setAttribute("stroke-linejoin", "round");
        svg.appendChild(path);

        const host = document.createElement("div");
        host.id = "__capture_cursor";
        host.appendChild(svg);
        Object.assign(host.style, {
          position: "fixed",
          left: "0",
          top: "0",
          margin: "0",
          padding: "0",
          border: "0",
          background: "transparent",
          overflow: "visible",
          pointerEvents: "none",
          zIndex: "2147483647",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,.55))",
          transition: "transform 90ms ease-out",
          willChange: "transform",
        });
        host.setAttribute("popover", "manual");
        document.body.appendChild(host);

        let kind = "default";
        let pressed = false;
        let x = -100;
        let y = -100;

        const paint = () => {
          const g = glyphs[kind];
          path.setAttribute("d", g.d);
          const scale = pressed ? 0.86 : 1;
          host.style.transform =
            `translate(${x - (g.hot[0] / 24) * size}px, ${y - (g.hot[1] / 24) * size}px) scale(${scale})`;
          host.style.transformOrigin = `${(g.hot[0] / 24) * size}px ${(g.hot[1] / 24) * size}px`;
        };

        // What is under the tip decides the glyph, the way a browser decides
        // it. elementFromPoint stops at a shadow host, so this descends until
        // it reaches the deepest element: `cursor` is inherited, so that one
        // already carries whatever the card asked for.
        const kindAt = (px, py) => {
          let el = document.elementFromPoint(px, py);
          for (let depth = 0; el?.shadowRoot && depth < 20; depth++) {
            const inner = el.shadowRoot.elementFromPoint(px, py);
            if (!inner || inner === el) break;
            el = inner;
          }
          if (!el) return "default";
          const c = getComputedStyle(el).cursor;
          return c === "pointer" || c === "grab" || c === "grabbing" ? "pointer" : "default";
        };

        const track = (ev) => {
          x = ev.clientX;
          y = ev.clientY;
          kind = pressed ? kind : kindAt(x, y);
          paint();
        };
        addEventListener("pointermove", track, { capture: true, passive: true });
        addEventListener("pointerdown", (ev) => {
          pressed = true;
          kind = kindAt(ev.clientX, ev.clientY);
          track(ev);
        }, { capture: true, passive: true });
        addEventListener("pointerup", (ev) => {
          pressed = false;
          track(ev);
        }, { capture: true, passive: true });

        window.__cursor = {
          // A dialog that enters the top layer after us would cover the
          // cursor; re-showing puts it back on top.
          raise() {
            try { host.hidePopover(); } catch {}
            try { host.showPopover(); } catch {}
            paint();
          },
          at: () => ({ x, y }),
        };
        window.__cursor.raise();
      };

      if (document.body) install();
      else addEventListener("DOMContentLoaded", install, { once: true });
    },
    [GLYPHS, size],
  );
}
