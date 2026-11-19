import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The palette (D-020 to D-026) checked from the CSS itself: every color token in the first :root block is
// light-dark(light, dark), so both modes are read from one place. Translucent colors are composited over
// the solid card before the contrast is measured (WCAG 2 relative luminance).

const css = readFileSync("app/globals.css", "utf8");

type Rgba = [number, number, number, number];
type Mode = 0 | 1; // 0 light, 1 dark
const MODES: [Mode, string][] = [[0, "light"], [1, "dark"]];

function parseColor(raw: string): Rgba {
  const v = raw.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as Rgba;
  const rgb = /^rgba?\(([^)]+)\)$/.exec(v);
  if (rgb) {
    const [r, g, b, a = 1] = rgb[1].split(",").map(Number);
    return [r, g, b, a];
  }
  if (v === "transparent") return [0, 0, 0, 0];
  throw new Error(`Not a color: ${v}`);
}

// Splits the arguments of light-dark(a, b), keeping commas inside rgba() together
function lightDarkArgs(inner: string): [string, string] {
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "(") depth++;
    else if (inner[i] === ")") depth--;
    else if (inner[i] === "," && depth === 0) return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
  }
  throw new Error(`light-dark() needs two values: ${inner}`);
}

// Every light-dark(...) in a value, in order
function lightDarks(value: string): [string, string][] {
  const out: [string, string][] = [];
  let from = 0;
  for (;;) {
    const at = value.indexOf("light-dark(", from);
    if (at < 0) return out;
    let depth = 0;
    let end = at + "light-dark(".length;
    for (; end < value.length; end++) {
      if (value[end] === "(") depth++;
      else if (value[end] === ")") {
        if (depth === 0) break;
        depth--;
      }
    }
    out.push(lightDarkArgs(value.slice(at + "light-dark(".length, end)));
    from = end + 1;
  }
}

const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("\n}\n", css.indexOf(":root {")));
const tokens = new Map<string, string>();
for (const m of rootBlock.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens.set(m[1], m[2]);

function token(name: string, mode: Mode): Rgba {
  const value = tokens.get(name);
  if (!value) throw new Error(`Missing token ${name}`);
  const pair = lightDarks(value);
  if (pair.length !== 1) throw new Error(`${name} should be one light-dark() color`);
  return parseColor(pair[0][mode]);
}

const over = (top: Rgba, bottom: Rgba): Rgba => {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1) as Rgba;
};

function luminance([r, g, b]: Rgba): number {
  const ch = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("the palette's contrast, in both modes", () => {
  for (const [mode, name] of MODES) {
    const t = (n: string) => token(n, mode);
    const card = t("--surface-solid");
    const glow = over(t("--glow"), t("--background"));

    it(`${name}: text and secondary text read on every surface`, () => {
      const backs: [string, Rgba][] = [
        ["--surface-solid", card],
        ["--surface-modal", t("--surface-modal")],
        ["--surface-secondary", t("--surface-secondary")],
        ["--background", t("--background")],
        ["--background under the glow", glow],
        ...["tint", "success", "warning", "danger"].map((k): [string, Rgba] => [`--${k}-subtle`, over(t(`--${k}-subtle`), card)]),
      ];
      for (const fg of ["--text", "--secondary"])
        for (const [label, bg] of backs) expect(contrast(t(fg), bg), `${fg} on ${label}`).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: labels on colored fills read`, () => {
      for (const fill of ["--tint", "--tint-hover", "--success", "--warning"])
        expect(contrast(t("--on-tint"), t(fill)), `--on-tint on ${fill}`).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: accent and status fills stand out from the page and the card`, () => {
      for (const fill of ["--tint", "--success", "--warning", "--danger"])
        for (const bg of ["--surface-solid", "--background"]) {
          // Choice 11 (D-024): the golden light amber is held to 2.5:1, a fill that always sits beside a --text word
          const min = mode === 0 && fill === "--warning" ? 2.5 : 3;
          expect(contrast(t(fill), t(bg)), `${fill} on ${bg}`).toBeGreaterThanOrEqual(min);
        }
    });
  }

});

describe("the color rule in the CSS", () => {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

  // D-021: the accent and the status colors are fills, never text. Only the color property is matched,
  // not accent-color, background-color, border-color, fill or stroke. The one exception the owner asked for (D-029) is
  // the Wishlist total's large "RON" in the accent; the fill test above holds the accent to 3:1, enough for large text.
  it("no color: declaration takes an accent or status color", () => {
    const colored = [...code.replace(/\.item-currency\s*\{\s*color:\s*var\(--tint\);\s*\}/, "").matchAll(/(?<![\w-])color\s*:\s*([^;}]+)/g)]
      .map((m) => m[0].trim())
      .filter((d) => /var\(--(tint|success|warning|danger)/.test(d));
    expect(colored).toEqual([]);
  });

  // Every color is a token, so both modes come from :root; a data-URI icon's own stroke only shapes a mask.
  it("no color literal is left outside the :root token blocks", () => {
    const rest = code.replace(/:root(\[[^\]]*\])?\s*\{[^}]*\}/g, "").replace(/url\([^)]*\)/g, "url()");
    const literals = rest.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|(?<![\w-])(white|black)(?![\w-])/gi) ?? [];
    expect(literals).toEqual([]);
  });

  // D-025: the dark/light fade animates the tokens on <html>, so every color token that differs between the modes is
  // registered as a <color> (or it would not interpolate) and listed in the fade's transition-property.
  it("every color token that changes with the mode is registered and faded", () => {
    const changing = [...tokens]
      .filter(([, value]) => /^light-dark\(/.test(value.trim()))
      .filter(([name]) => {
        const [[light, dark]] = lightDarks(tokens.get(name)!);
        return light !== dark;
      })
      .map(([name]) => name)
      .sort();
    const registered = [...code.matchAll(/@property\s+(--[\w-]+)\s*\{[^}]*syntax:\s*"<color>"/g)].map((m) => m[1]).sort();
    const fade = /:root\[data-theme-fade\]\s*\{[^}]*transition-property:\s*([^;]+);/.exec(code);
    const faded = (fade?.[1] ?? "").split(",").map((p) => p.trim()).sort();
    expect(changing.length).toBeGreaterThan(20);
    expect(registered).toEqual(changing);
    expect(faded).toEqual(changing);
  });
});
