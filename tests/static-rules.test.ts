import { randomUUID } from "node:crypto";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { toISODate } from "@/lib/format-date";
import { NOT_WHOLE } from "@/lib/number-format";
import {
  GOAL_RANGES,
  logMealSchema,
  mealAmounts,
  MEAL_CALORIES_NEGATIVE,
  MEAL_CALORIES_TOO_HIGH,
  MEAL_LIMITS,
  MEAL_MACROS_NEGATIVE,
  MEAL_MACROS_TOO_HIGH,
  updateNutritionTargetsSchema,
} from "@/lib/validations/food";

// Rules checked on the code itself; no test here opens the database. The Vitest setup still prepares the local one
// unless CI=1, so to run this file alone without Postgres use the command in conventions.md (Gotchas, Postgres for tests).
const sources = import.meta.glob("../app/**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const foodClient = sources["../app/health/food-client.tsx"];

it("finds the sources", () => {
  expect(Object.keys(sources).length).toBeGreaterThan(30);
  expect(foodClient).toContain("export function");
});

// conventions.md, Form error state (D-009): `const [errorMsg, setErrorMsg] = useState("")` on every page, never null.
describe("every form's error state starts as an empty string [D-009]", () => {
  it.each(Object.entries(sources))("%s", (_file, text) => {
    const states = [...text.matchAll(/\[errorMsg, setErrorMsg\] = useState(<[^>]*>)?\(([^)]*)\)/g)];
    expect(states.filter(([, typed, initial]) => typed || ["", "null", "undefined"].includes(initial.trim())).map(([line]) => line)).toEqual([]);
  });
});

describe("the Health form's limits and words are the schema's [U5]", () => {
  const meal = { id: randomUUID(), date: toISODate(), name: "Meal", calories: 100, protein: 0, carbs: 0, fat: 0 };
  const refusal = (input: object) => logMealSchema.safeParse(input).error?.issues[0]?.message;

  it("refuses a meal over a limit with the message the form shows", () => {
    expect(refusal({ ...meal, calories: MEAL_LIMITS.calories })).toBeUndefined();
    expect(refusal({ ...meal, calories: MEAL_LIMITS.calories + 1 })).toBe(MEAL_CALORIES_TOO_HIGH);
    for (const macro of ["protein", "carbs", "fat"]) {
      expect(refusal({ ...meal, [macro]: MEAL_LIMITS.macroGrams })).toBeUndefined();
      expect(refusal({ ...meal, [macro]: MEAL_LIMITS.macroGrams + 0.1 })).toBe(MEAL_MACROS_TOO_HIGH);
    }
    expect(MEAL_CALORIES_TOO_HIGH).toBe("Calories must be 10.000 or less");
    expect(MEAL_MACROS_TOO_HIGH).toBe("Protein, carbs and fat must each be 1.000 g or less");
  });

  it("refuses a negative meal value with words that name the field, and the form checks it with the schema itself", () => {
    expect(refusal({ ...meal, calories: -1 })).toBe(MEAL_CALORIES_NEGATIVE);
    for (const macro of ["protein", "carbs", "fat"]) expect(refusal({ ...meal, [macro]: -0.1 })).toBe(MEAL_MACROS_NEGATIVE);
    expect(MEAL_CALORIES_NEGATIVE).toBe("Calories can't be negative");
    expect(MEAL_MACROS_NEGATIVE).toBe("Protein, carbs and fat can't be negative");
    expect(foodClient).toContain("mealAmounts.safeParse(");
    expect(foodClient).not.toMatch(/MEAL_LIMITS\.\w+\)? return/);
  });

  // The form shows the schema's first refusal, so with several wrong values it names the same one the server would.
  it("names the first field the schema refuses, in the schema's order", () => {
    const wrong = { ...meal, calories: 5, protein: -1, carbs: 2000 };
    expect(refusal(wrong)).toBe(MEAL_MACROS_NEGATIVE);
    expect(mealAmounts.safeParse(wrong).error?.issues[0]?.message).toBe(MEAL_MACROS_NEGATIVE);
  });

  // Field messages end with no full stop ("Name is required", "Must be at least 0"); the messages this form took from
  // the schema and number-format follow them.
  it("ends the form's limit and number messages with no full stop, as every field message does", () => {
    for (const message of [MEAL_CALORIES_TOO_HIGH, MEAL_MACROS_TOO_HIGH, MEAL_CALORIES_NEGATIVE, MEAL_MACROS_NEGATIVE, NOT_WHOLE]) expect(message).not.toMatch(/\.$/);
    expect(foodClient).toContain("`The total must be between 0 and ${formatNumber(METRIC_MAX[metric])}`");
  });

  it("takes each goal's range from GOAL_RANGES", () => {
    for (const [key, { min, max }] of Object.entries(GOAL_RANGES)) {
      const goal = (to: number) => updateNutritionTargetsSchema.safeParse({ [key]: { from: min, to } }).success;
      expect([goal(min - 1), goal(min), goal(max), goal(max + 1)], key).toEqual([false, true, true, false]);
    }
  });

  it("food-client writes no limit or number message of its own", () => {
    // A limit written out: a range bound ("min: 500") or a comparison with a number ("> 10000")
    expect(foodClient).not.toMatch(/\b(min|max): \d|[<>]=? *\d{2,}/);
    expect(foodClient).not.toContain("Please enter a whole number");
    expect(foodClient).toMatch(/import \{[^}]*\bNOT_WHOLE\b[^}]*\} from "@\/lib\/number-format"/);
  });
});

// A field message (what a form shows under or next to a field) ends with no full stop; a state refusal (gone, changed
// elsewhere, signed out, already exists) is a sentence and keeps its full stop.
describe("field messages end with no full stop", () => {
  const validations = import.meta.glob("../src/lib/validations/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
  const endingInFullStop = (text: string) => [...withoutComments(text).matchAll(/"([^"\n]*\.)"|'([^'\n]*\.)'|`([^`\n]*\.)`/g)].map(([, double, single, template]) => double ?? single ?? template);

  it("in src/lib/validations, only the state refusals end with one", () => {
    expect(Object.keys(validations).length).toBeGreaterThan(5);
    expect(Object.values(validations).flatMap(endingInFullStop).sort()).toEqual(
      [
        "Category not found.",
        "Only today and yesterday can be changed.",
        "This changed on another device. Check the new value and try again.",
        "This item is no longer on the list.",
        "This weigh-in was already deleted.",
        "These notes changed on another device. Check them and try again.",
        "This workout is already finished.",
        "Workout not found.",
        "This workout was finished or cancelled elsewhere.",
        "Set not found.",
        "Sets are logged; use Cancel workout instead.",
        "You're signed out. Sign in again.",
        '"${name}" already exists.',
        'Can\'t undo: "${name}" has changed since.',
        "This task no longer exists.",
        "This item no longer exists.",
      ].sort(),
    );
  });

  it("no form in app/ sets an error message ending with one", () => {
    const set = Object.entries(sources).flatMap(([file, text]) =>
      [...text.matchAll(/setErrorMsg\(\s*("[^"\n]*\."|'[^'\n]*\.'|`[^`\n]*\.`)\s*\)/g)].map(([, message]) => `${file}: ${message}`),
    );
    expect(set).toEqual([]);
  });
});

// The functions below read a file's syntax tree, as toast.test.ts does.
const treeOf = (text: string) => ts.createSourceFile("form.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
type Fn = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

// Whether a declared name, or a destructuring pattern, binds `wanted`.
const binds = (name: ts.BindingName, wanted: string): boolean =>
  ts.isIdentifier(name) ? name.text === wanted : name.elements.some((e) => !ts.isOmittedExpression(e) && binds(e.name, wanted));

// The declaration `name` means where `at` sits: the nearest scope around `at` (a function's parameters, a block, the
// file) that declares it. A scope that declares it more than once gives undefined, as no declaration does.
const declarationOf = (name: string, at: ts.Node): ts.Node | undefined => {
  for (let scope = at.parent; scope; scope = scope.parent) {
    const found: ts.Node[] = [];
    if (ts.isFunctionLike(scope)) found.push(...scope.parameters.filter((p) => binds(p.name, name)));
    if (ts.isBlock(scope) || ts.isSourceFile(scope))
      for (const s of scope.statements) {
        if (ts.isFunctionDeclaration(s) && s.body && s.name?.text === name) found.push(s);
        if (ts.isVariableStatement(s)) found.push(...s.declarationList.declarations.filter((d) => binds(d.name, name)));
      }
    if (found.length) return found.length === 1 ? found[0] : undefined;
  }
};

// The function a declaration gives: `function name`, or `const name =` an arrow, a function expression or
// `useCallback(fn, deps)`; anything else (a parameter, a destructured value, another value, none) gives undefined.
const functionOf = (declaration: ts.Node | undefined): Fn | undefined => {
  if (declaration && ts.isFunctionDeclaration(declaration)) return declaration.body ? declaration : undefined;
  if (!declaration || !ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name)) return undefined;
  let value = declaration.initializer;
  if (value && ts.isCallExpression(value) && /^(React\.)?useCallback$/.test(value.expression.getText())) value = value.arguments[0];
  return value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? value : undefined;
};

// The body of the one function named `name` in `text`, whatever its shape (see functionOf); "" unless there is exactly one.
const bodyOf = (text: string, name: string) => {
  const found: Fn[] = [];
  const visit = (node: ts.Node) => {
    const named = (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name) && node.name.text === name;
    const fn = named ? functionOf(node) : undefined;
    if (fn) found.push(fn);
    ts.forEachChild(node, visit);
  };
  visit(treeOf(text));
  return found.length === 1 ? found[0].body!.getText() : "";
};

// The values a declaration gives its name: a variable's value and, for a `let` or `var`, every assignment to it in the
// scope that declares it (`name = …`, `name ??= …` and the like, a destructuring one too), found by resolving each
// assignment's left side to this declaration; for a parameter, its default values (all of that parameter's). Anything
// else (an import, a parameter with no default) gives none.
const valuesOf = (declaration: ts.Node | undefined): ts.Node[] => {
  if (declaration && ts.isParameter(declaration)) {
    const defaults: ts.Node[] = [];
    const visit = (n: ts.Node) => {
      if ((ts.isParameter(n) || ts.isBindingElement(n)) && n.initializer) defaults.push(n.initializer);
      if (!ts.isTypeNode(n)) ts.forEachChild(n, visit);
    };
    visit(declaration);
    return defaults;
  }
  if (!declaration || !ts.isVariableDeclaration(declaration)) return [];
  const values: ts.Node[] = declaration.initializer ? [declaration.initializer] : [];
  if (declaration.parent.flags & ts.NodeFlags.Constant) return values;
  const names = (n: ts.Node): boolean => (ts.isIdentifier(n) && declarationOf(n.text, n) === declaration) || Boolean(ts.forEachChild(n, names));
  const visit = (n: ts.Node) => {
    const assigns = ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
    if (assigns && names(n.left)) values.push(n.right);
    ts.forEachChild(n, visit);
  };
  visit(declaration.parent.parent.parent);
  return values;
};

// The code `fn` runs: the whole function (its parameters with their default values, and its body) and, transitively,
// what each name in it means in this file (declarationOf, from where the name is used): a function's whole code
// (functionOf), or the values valuesOf gives. Code from another file (an import, or what a prop runs) is not read.
const codeOf = (fn: Fn) => {
  const seen = new Set<ts.Node>();
  const read = (node: ts.Node | undefined): string[] => {
    if (!node || seen.has(node)) return [];
    seen.add(node);
    const texts = [node.getText()];
    const visit = (n: ts.Node) => {
      if (ts.isIdentifier(n)) {
        const declaration = declarationOf(n.text, n);
        const named = functionOf(declaration);
        texts.push(...(named ? read(named) : valuesOf(declaration).flatMap(read)));
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return texts;
  };
  return read(fn).join("\n");
};

// D-043: a form whose save sends a compare-and-set `from` (the value it last saw) holds Save until the answer comes, or a
// second Save sends the same `from` again and is refused with a false "changed on another device". FormModal holds it
// for a form that passes `sendsFrom` (D-047), or for one still on the deprecated `busy` bridge (conventions.md, Busy flags).
describe("a FormModal whose save sends a compare-and-set from holds Save while it is out [D-043]", () => {
  // `{ from: x, to: y }`, `{ to, from }` or a call such as `rename(from, to)`: the old value next to the new one.
  const sendsFrom = (code: string) => /\bfrom\b\s*[:,][^;]{0,60}?\bto\b|\bto\b\s*[:,][^;]{0,60}?\bfrom\b\s*[:,}]/.test(code);
  // Each `<FormModal>` in `text` whose save sends a `from`, and whether it holds Save (passes `sendsFrom` or `busy={…}`).
  // The handler is the name `onSubmit` gives, `{save}` or an inline arrow that only calls one, `{(e) => save(e)}`, or else
  // the inline function itself. A name is looked up from the FormModal out (declarationOf) and must be a function of this
  // file (functionOf); any other name (a prop, an import, a value), or an `onSubmit` of another kind, is an unknown
  // handler and fails. The save sends a `from` when the code the handler runs matches sendsFrom, comments included. That
  // code (codeOf) is the whole handler, its parameters' default values included, every function of this file it calls or
  // names however deep and however declared, and the values of the names it uses (valuesOf: a variable's value, every
  // assignment to a `let` or `var`, a parameter's default values). Limits: code from another file is not read (an import,
  // or what a prop runs: `function submit(e) { onSave(e); }` is checked without `onSave`'s code), and only a tag written
  // `FormModal` is found (a FormModal imported under another name is not).
  const fromForms = (text: string) => {
    const forms: { handler: string; held: boolean }[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningLikeElement(node) && node.tagName.getText() === "FormModal") {
        const props = node.attributes.properties.filter(ts.isJsxAttribute);
        const prop = (name: string) => props.find((p) => p.name.getText() === name);
        const submit = prop("onSubmit")?.initializer;
        const value = submit && ts.isJsxExpression(submit) ? submit.expression : undefined;
        // A name it gives: `{save}`, or the one name an inline arrow only calls, `{(e) => save(e)}` (also after `void` or `await`).
        const inline = value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? value : undefined;
        let only = inline && !ts.isBlock(inline.body) ? inline.body : undefined;
        while (only && (ts.isVoidExpression(only) || ts.isAwaitExpression(only) || ts.isParenthesizedExpression(only))) only = only.expression;
        const name = value && ts.isIdentifier(value) ? value : only && ts.isCallExpression(only) && ts.isIdentifier(only.expression) ? only.expression : undefined;
        const named = name && functionOf(declarationOf(name.text, name));
        const fn = name ? named && (inline ?? named) : inline;
        const handler = name?.text ?? value?.getText() ?? "no onSubmit";
        if (!fn) forms.push({ handler, held: false });
        else if (sendsFrom(codeOf(fn))) forms.push({ handler, held: Boolean(prop("sendsFrom") || prop("busy")?.initializer) });
      }
      ts.forEachChild(node, visit);
    };
    visit(treeOf(text));
    return forms;
  };
  const categoriesCard = sources["../app/components/categories-card.tsx"];

  it("finds the known ones: Health water/steps and goals, and the categories card", () => {
    expect(fromForms(foodClient).map(({ handler }) => handler)).toEqual(["handleMetricSubmit", "handleGoalsSubmit"]);
    expect(fromForms(categoriesCard).map(({ handler }) => handler)).toEqual(["submit"]);
  });

  it("fails on a copy of the Health form with sendsFrom removed, and of the categories card with busy removed", () => {
    const withoutSendsFrom = foodClient.replace(/^\s*sendsFrom\n/m, "");
    expect(withoutSendsFrom).not.toBe(foodClient);
    expect(fromForms(withoutSendsFrom)).toContainEqual({ handler: "handleMetricSubmit", held: false });
    const withoutBusy = categoriesCard.replace("busy={busy}", "");
    expect(withoutBusy).not.toBe(categoriesCard);
    expect(fromForms(withoutBusy)).toContainEqual({ handler: "submit", held: false });
  });

  // Each onSubmit shape, and each way of declaring a handler (put before `function submit`, named `send` so it does not
  // clash with the card's own `save`), on a copy of the categories card with busy removed: a `from` sent by the handler,
  // by a helper it calls (however deep or however declared) or in a value it hands to a call, or a handler that is not a
  // function of this file (`onSave`, a prop), fails.
  it.each([
    ["async (e) => submit(e)", ""],
    ["e => submit(e)", ""],
    ["(e) => void submit(e)", ""],
    ["onSave", ""],
    ["(e) => onSave(e)", ""],
    ["send", "const send = (e) => api.rename(from, to);"],
    ["send", "const input = { scope, from, to };\n  const send = (e) => renameCategoryAction(input);"],
    ["send", "const send = useCallback(async (e) => { await renameCategoryAction({ scope, from, to }); }, []);"],
    ["send", "async function send(e: React.FormEvent): Promise<{ success: boolean }> { e.preventDefault(); return renameCategoryAction({ scope, from, to }); }"],
    ["send", "const doRename = () => renameCategoryAction({ scope, from, to });\n  function send(e: React.FormEvent) { e.preventDefault(); return doRename(); }"],
    ["send", "const doRename = useCallback(async () => { await renameCategoryAction({ scope, from, to }); }, []);\n  function send(e: React.FormEvent) { e.preventDefault(); return doRename(); }"],
    ["send", "async function doRename() { await renameCategoryAction({ scope, from, to }); }\n  async function step() { await doRename(); }\n  async function send(e: React.FormEvent) { e.preventDefault(); await step(); }"],
  ])("fails on a copy of the categories card with busy removed and onSubmit={%s} %s", (shape, declared) => {
    const copy = categoriesCard
      .replace("busy={busy}", "")
      .replace("onSubmit={submit}", `onSubmit={${shape}}`)
      .replace("  function submit(", `  ${declared}\n  function submit(`);
    expect(copy).toContain(`onSubmit={${shape}}`);
    expect(copy).toContain(`  ${declared}\n  function submit(`);
    expect(fromForms(copy).filter(({ held }) => !held)).not.toEqual([]);
  });

  // A `from` in a parameter's default value (a helper's, the handler's own, a destructured one), in a later assignment to
  // a `let`, or written after `to` fails; the same copy without that `from` gives none.
  it.each([
    ["send", "function doRename(input = { scope, from: prev, to: next }) { return renameCategoryAction(input); }\n  function send(e: React.FormEvent) { e.preventDefault(); return doRename(); }"],
    ["(e) => send(e)", "async function send(e: React.FormEvent, input = { scope, from: prev, to: next }) { e.preventDefault(); await renameCategoryAction(input); }"],
    ["(e) => send(e)", "async function send(e: React.FormEvent, { input = { scope, from: prev, to: next } } = {}) { e.preventDefault(); await renameCategoryAction(input); }"],
    ["send", "let input = { scope, name: next };\n  if (from) input = { scope, from: prev, to: next };\n  function send(e: React.FormEvent) { e.preventDefault(); void renameCategoryAction(input); }"],
    ["send", "const send = (e: React.FormEvent) => renameCategoryAction({ scope, to, from });"],
  ])("fails on a copy of the categories card with busy removed and onSubmit={%s} %s, and not without its from", (shape, declared) => {
    const copy = (code: string) =>
      categoriesCard.replace("busy={busy}", "").replace("onSubmit={submit}", `onSubmit={${shape}}`).replace("  function submit(", `  ${code}\n  function submit(`);
    const without = declared.replace(/, from(: prev)?\b/g, "");
    expect(without).not.toBe(declared);
    expect(copy(declared)).toContain(`  ${declared}\n  function submit(`);
    expect(fromForms(copy(declared)).filter(({ held }) => !held)).not.toEqual([]);
    expect(fromForms(copy(without))).toEqual([]);
  });

  // Two components in one file that each declare `save`: each FormModal reads its own component's.
  it("fails on a copy of the categories card with busy removed and onSubmit={save}, after another component's save with no from", () => {
    const other = `function Other() {\n  async function save(e: React.FormEvent) {\n    e.preventDefault();\n    await addCategoryAction({ scope: "wishlist", name: "x" });\n  }\n  return <FormModal isOpen onClose={() => {}} title="x" onSubmit={save}>x</FormModal>;\n}\n\n`;
    const copy = categoriesCard.replace("busy={busy}", "").replace("onSubmit={submit}", "onSubmit={save}").replace("export function CategoriesCard(", `${other}export function CategoriesCard(`);
    expect(copy).toContain(`${other}export function CategoriesCard(`);
    expect(fromForms(copy)).toEqual([{ handler: "save", held: false }]);
  });

  it.each(Object.entries(sources))("%s", (_file, text) => {
    expect(fromForms(text).filter(({ held }) => !held)).toEqual([]);
  });
});

// D-047: one changedFields helper (app/components/forms.ts) finds what an edit changed, never a change built inline.
describe("a form finds what an edit changed with changedFields [D-047]", () => {
  it("the Health water/steps and goals forms", () => {
    for (const handler of ["handleMetricSubmit", "handleGoalsSubmit"]) expect(bodyOf(foodClient, handler), handler).toContain("changedFields(");
  });
});

// D-047: FormModal owns each opening's saving state (Save says "Saving..." and the fields wait while the opening's save
// is out), so a migrated form passes no `busy` of its own. The forms not moved yet are listed in conventions.md (Busy flags).
describe("a migrated form leaves its saving state to FormModal [D-047]", () => {
  const migrated = ["../app/todos/todos-client.tsx", "../app/wishlist/wishlist-client.tsx", "../app/health/food-client.tsx"];
  const formModals = (text: string) => [...text.matchAll(/<FormModal\b([^>]*?(?:\{[^}]*\}[^>]*?)*)>/g)].map(([, props]) => props);

  it.each(migrated)("%s", (file) => {
    const props = formModals(sources[file]);
    expect(props.length).toBeGreaterThan(0);
    expect(props.length).toBe(sources[file].split("<FormModal").length - 1);
    expect(props.filter((p) => /\bbusy=/.test(p))).toEqual([]);
  });
});
