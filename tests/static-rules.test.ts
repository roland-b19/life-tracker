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
const code = import.meta.glob("../app/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

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

// conventions.md, View controls per device (D-041, D-047): what the device keeps goes through `useDeviceState`; only the
// theme's head script, which runs before React, reads the same storage itself.
describe("only useDeviceState and the theme's head script touch localStorage [D-047]", () => {
  const allowed = ["../app/components/device-state.ts", "../app/components/theme.ts"];
  it("finds both", () => {
    expect(Object.keys(code)).toEqual(expect.arrayContaining(allowed));
  });
  it.each(Object.entries(code).filter(([file]) => !allowed.includes(file)))("%s", (_file, text) => {
    expect(text).not.toContain("localStorage");
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

// The `var` declarations a function body (or the file) holds at any depth, outside nested functions: `var` is function-scoped.
const varsIn = (scope: ts.Node): ts.VariableDeclaration[] => {
  const found: ts.VariableDeclaration[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclarationList(n) && !(n.flags & ts.NodeFlags.BlockScoped)) found.push(...n.declarations);
    if (!ts.isFunctionLike(n) && !ts.isClassLike(n)) ts.forEachChild(n, visit);
  };
  ts.forEachChild(scope, visit);
  return found;
};

// The declaration `name` means where `at` sits: the nearest scope around `at` (a function's parameters, a `for`
// statement's `let` or `const`, a block, the file) that declares it, a `var` counting in its function's body. A scope that
// declares it more than once gives undefined, as no declaration does.
const declarationOf = (name: string, at: ts.Node): ts.Node | undefined => {
  for (let scope = at.parent; scope; scope = scope.parent) {
    const found: ts.Node[] = [];
    if (ts.isFunctionLike(scope)) found.push(...scope.parameters.filter((p) => binds(p.name, name)));
    if ((ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope)) && scope.initializer && ts.isVariableDeclarationList(scope.initializer) && scope.initializer.flags & ts.NodeFlags.BlockScoped)
      found.push(...scope.initializer.declarations.filter((d) => binds(d.name, name)));
    if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
      for (const s of scope.statements) {
        if (ts.isFunctionDeclaration(s) && s.body && s.name?.text === name) found.push(s);
        if (ts.isVariableStatement(s) && s.declarationList.flags & ts.NodeFlags.BlockScoped)
          found.push(...s.declarationList.declarations.filter((d) => binds(d.name, name)));
      }
      if (ts.isSourceFile(scope) || ts.isFunctionLike(scope.parent)) found.push(...varsIn(scope).filter((d) => binds(d.name, name)));
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

// Whether an identifier is a name of this file's code, not a property's or a type member's name (`x.name`, `{ name: v }`).
const isReference = (n: ts.Identifier) => {
  const p = n.parent;
  if (ts.isPropertyAccessExpression(p)) return p.expression === n;
  if (ts.isQualifiedName(p)) return p.left === n;
  return !((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodSignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isJsxAttribute(p)) && p.name === n) && !(ts.isBindingElement(p) && p.propertyName === n);
};

// A node that only wraps the expression in it: parentheses, `as`, `!`, `satisfies` or a type assertion.
const wraps = (n: ts.Node) => ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isSatisfiesExpression(n) || ts.isTypeAssertionExpression(n);

// Each reference to one of `names` in the scope that declares `declaration` (its function, its block for a `let` or
// `const`, the file), resolved to that same declaration; a name where it is declared is not one.
const referencesTo = (declaration: ts.Node, names: string[]) => {
  let scope = declaration.parent;
  const blockScoped = !ts.isVariableDeclaration(declaration) || declaration.parent.flags & ts.NodeFlags.BlockScoped;
  while (!ts.isSourceFile(scope) && !ts.isFunctionLike(scope) && !(ts.isBlock(scope) && blockScoped)) scope = scope.parent;
  const references: ts.Identifier[] = [];
  const visit = (n: ts.Node) => {
    const bound = (p: ts.Node) => (ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p)) && p.name === n;
    if (ts.isIdentifier(n) && names.includes(n.text) && isReference(n) && !bound(n.parent) && declarationOf(n.text, n) === declaration) references.push(n);
    ts.forEachChild(n, visit);
  };
  visit(scope);
  return references;
};

// The call or JSX prop `n`, or a member of it, is handed to (`Object.assign(n, …)`, `f(n.x)`, `<C v={n} />`), or the
// call of a method of it (`n.push(…)`); a JSX prop with its element's tag, so a component of this file is read.
const handedTo = (n: ts.Node): ts.Node[] => {
  let at = n;
  let member = false;
  for (let p = at.parent; ; p = at.parent) {
    if ((ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === at) member = true;
    else if (!wraps(p)) break;
    at = p;
  }
  const p = at.parent;
  if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments?.includes(at as ts.Expression)) return [p];
  if (ts.isCallExpression(p) && p.expression === at && member) return [p];
  if (ts.isJsxSpreadAttribute(p)) return [p, p.parent.parent.tagName];
  if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent)) return [p.parent, p.parent.parent.parent.tagName];
  return [];
};

// What a function handed at `n` is called with: handed to a call, that call's callee chain and other arguments
// (`getDraft().then((d) => …)` reads `getDraft().then`); handed to a JSX prop, its element's tag (`<Picker onPick={…} />`
// reads `Picker`).
const callerOf = (n: ts.Node): ts.Node[] => {
  let at = n;
  while (wraps(at.parent)) at = at.parent;
  const p = at.parent;
  if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments?.includes(at as ts.Expression)) return [p.expression, ...p.arguments.filter((a) => a !== at)];
  if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent)) return [p.parent.parent.parent.tagName];
  return [];
};

// A name's code: its declaration (a function's whole code, a variable's value, a parameter's default values, what a
// `for (const c of list)` or `for (const k in object)` takes it from) and each expression in the scope that declares it that writes to it, the name
// resolved to that same declaration: an assignment to it or to a member of it (`name = …`, `name.current = …`, `name++`,
// `delete name.x`, `for (name of list)`) and, unless it is a function (declared as one, or called anywhere), a call or JSX
// prop it or a member of it is handed to (`Object.assign(name, …)`, `<C v={name} />`, with C's code) or a call of a method
// of it (`name.push(…)`). For `const [value, setValue] = useState(…)` (or `useReducer`, `value` also a pattern such as
// `[{ value }, setForm]`), `value`'s code also holds each call of `setValue` and the call it is handed to (`load(setValue)`,
// `.then(setValue)`). A callback's parameter also holds what calls the callback (callerOf), the callback inline or named
// (`function pick`, `const pick =` an arrow or `useCallback(…)`), at each place it is handed to a call or a JSX prop. A
// callback or setter inside an options object (`load({ done: (v) => setValue(v) })`) is not followed. It may read more than
// this list, which can only flag more; two known examples: a write keyed by a name (`table[key] = …` counts as a write to
// `key`), and a `catch (x)` parameter resolving to an outer `x`.
const nameCode = (name: string, declaration: ts.Node): ts.Node[] => {
  const own: ts.Node[] = [];
  if (ts.isFunctionDeclaration(declaration)) own.push(declaration);
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) own.push(declaration.initializer);
  const loop = ts.isVariableDeclaration(declaration) ? declaration.parent.parent : undefined;
  if (loop && (ts.isForOfStatement(loop) || ts.isForInStatement(loop)) && loop.initializer === declaration.parent) own.push(loop.expression);
  if (ts.isParameter(declaration)) {
    const visit = (n: ts.Node) => {
      if ((ts.isParameter(n) || ts.isBindingElement(n)) && n.initializer) own.push(n.initializer);
      if (!ts.isTypeNode(n)) ts.forEachChild(n, visit);
    };
    visit(declaration);
    const fn = declaration.parent;
    own.push(...callerOf(fn));
    const named = [fn, fn.parent, fn.parent?.parent].find((d) => d && functionOf(d) === fn) as ts.FunctionDeclaration | ts.VariableDeclaration | undefined;
    if (named?.name && ts.isIdentifier(named.name)) own.push(...referencesTo(named, [named.name.text]).flatMap(callerOf));
  }
  let setter: string | undefined;
  const call = ts.isVariableDeclaration(declaration) && declaration.initializer;
  if (call && ts.isCallExpression(call) && /^(React\.)?use(State|Reducer)$/.test(call.expression.getText()) && ts.isArrayBindingPattern(declaration.name)) {
    const [value, set] = declaration.name.elements;
    if (value && ts.isBindingElement(value) && binds(value.name, name) && set && ts.isBindingElement(set) && ts.isIdentifier(set.name)) setter = set.name.text;
  }
  const references = referencesTo(declaration, setter ? [name, setter] : [name]);
  // The assignment that writes a reference (`name = …`, `name.x += …`, `[name] = …`, `name++`, `delete name.x`), or
  // what a `for (name of …)` takes it from.
  const assignment = (n: ts.Node) => {
    for (let at = n; at.parent && !ts.isBlock(at.parent) && !ts.isSourceFile(at.parent) && !ts.isFunctionLike(at.parent); at = at.parent) {
      const p = at.parent;
      if (ts.isBinaryExpression(p) && p.left === at && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return p;
      if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(p.operator)) return p;
      if (ts.isDeleteExpression(p)) return p;
      if ((ts.isForInStatement(p) || ts.isForOfStatement(p)) && p.initializer === at) return p.expression;
    }
  };
  // A function (declared as one, or called somewhere) runs what is assigned to it, so only its assignments are read.
  const calledAt = (n: ts.Identifier) => ts.isCallExpression(n.parent) && n.parent.expression === n;
  const runs = Boolean(functionOf(declaration)) || references.some((n) => n.text === name && calledAt(n));
  for (const n of references) {
    if (n.text === setter) {
      const handed = handedTo(n);
      own.push(...(calledAt(n) ? [n.parent] : handed.length ? handed : [n]));
    }
    const write = assignment(n);
    if (write) own.push(write);
    else if (!runs) own.push(...handedTo(n));
  }
  return own;
};

// The code `node` runs: its own text and, transitively, the code of each name in it (nameCode), the name resolved in this
// file from where it is used (declarationOf). Code from another file (an import, what a prop runs) is not read.
const codeOf = (node: ts.Node) => {
  const seen = new Set<ts.Node>();
  const named = new Set<string>();
  const read = (node: ts.Node): string[] => {
    if (seen.has(node)) return [];
    seen.add(node);
    const texts = [node.getText()];
    const visit = (n: ts.Node) => {
      const declaration = ts.isIdentifier(n) && isReference(n) ? declarationOf(n.text, n) : undefined;
      const key = declaration && `${declaration.pos}:${declaration.end}:${(n as ts.Identifier).text}`;
      if (declaration && key && !named.has(key)) {
        named.add(key);
        texts.push(...nameCode((n as ts.Identifier).text, declaration).flatMap(read));
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return texts;
  };
  return read(node).join("\n");
};

// D-043: a form whose save sends a compare-and-set `from` (the value it last saw) holds Save until the answer comes, or a
// second Save sends the same `from` again and is refused with a false "changed on another device". FormModal holds it
// for a form that passes `sendsFrom` (D-047), or for one still on the deprecated `busy` bridge (conventions.md, Busy flags).
describe("a FormModal whose save sends a compare-and-set from holds Save while it is out [D-043]", () => {
  // `{ from: x, to: y }`, `{ to, from }` or a call such as `rename(from, to)`: the old value next to the new one. Not seen:
  // a quoted key (`{ "from": x }`), the two set in two statements (`o.from = x; o.to = y`), or more than 60 characters
  // between them.
  const sendsFrom = (code: string) => /\bfrom\b\s*[:,][^;]{0,60}?\bto\b|\bto\b\s*[:,][^;]{0,60}?\bfrom\b\s*[:,}]/.test(code);
  // Each `<FormModal>` in `text` whose save sends a `from`, and whether it holds Save (passes `sendsFrom` or `busy={…}`).
  // A FormModal is a tag written `FormModal` or a name of this file declared as one (`const Modal = FormModal`, directly or
  // through another such name). The handler is the name `onSubmit` gives, `{save}` or an inline arrow that only calls one,
  // `{(e) => save(e)}`, or else the inline function itself. A name is looked up from the FormModal out (declarationOf) and
  // must be a function of this file (functionOf); any other name (a prop, an import, a value), or an `onSubmit` of another
  // kind, is an unknown handler and fails. The save sends a `from` when the code the handler runs (codeOf) matches
  // sendsFrom, comments included. That code follows, however deep and each name looked up by scope in this file, at least
  // these flows (nameCode): calls to functions of this file; a name's declaration and every write to it (an assignment, and
  // for a value that is not a function a call or JSX prop it is handed to or a method called on it); a state value's setter
  // calls, plain (`[value, setValue]`) or destructured (`[{ value }, setForm]`), and the call a setter is handed to
  // (`load(setInput)`, `.then(setInput)`); a callback's parameter, read as the call it is handed to (`getDraft().then((d) =>
  // …)` reads `getDraft().then`) or, handed to a JSX prop, as that element's component; a `for…of` or `for…in` variable,
  // read as its iterable; a component of this file handed a value or setter in JSX (`<Picker onPick={setInput} />` reads
  // `Picker`); parameter defaults. Any other flow is not followed, for example: code from another file (an import, what a
  // prop runs: `function submit(e) { onSave(e); }` is checked without `onSave`'s code, a namespace member: `<B.FormModal>`
  // is not found), a FormModal imported under another name, an alias of a setter (`const update = setInput`), a callback
  // or setter inside an options object (`load({ done: (v) => setInput(v) })`), a custom hook of this file (`const [v, setV]
  // = useDraft()`), and a value aliased then changed through the alias (`const t = input; Object.assign(t, …)`). This reads
  // more than the save may run, so a form that sends no `from` can be flagged. It may also read more than this list, which
  // can only flag more; two known examples: a write keyed by a name (`table[key] = …` counts as a write to `key`), and a
  // `catch (x)` parameter resolving to an outer `x`.
  // A tag written `FormModal`, or a name of this file declared `const X = FormModal` (directly or through another such name).
  const isFormModal = (tag: ts.Node, seen = new Set<ts.Node>()): boolean => {
    if (!ts.isIdentifier(tag)) return false;
    const declaration = tag.text === "FormModal" ? undefined : declarationOf(tag.text, tag);
    if (!declaration) return tag.text === "FormModal";
    if (seen.has(declaration) || !ts.isVariableDeclaration(declaration) || !declaration.initializer) return false;
    return isFormModal(declaration.initializer, seen.add(declaration));
  };
  const fromForms = (text: string) => {
    const forms: { handler: string; held: boolean }[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningLikeElement(node) && isFormModal(node.tagName)) {
        const props = node.attributes.properties.filter(ts.isJsxAttribute);
        const prop = (name: string) => props.find((p) => p.name.getText() === name);
        const submit = prop("onSubmit")?.initializer;
        const value = submit && ts.isJsxExpression(submit) ? submit.expression : undefined;
        // A name it gives: `{save}`, or the one name an inline arrow only calls, `{(e) => save(e)}` (also after `void` or `await`).
        const inline = value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? value : undefined;
        let only = inline && !ts.isBlock(inline.body) ? inline.body : undefined;
        while (only && (ts.isVoidExpression(only) || ts.isAwaitExpression(only) || ts.isParenthesizedExpression(only))) only = only.expression;
        const name = value && ts.isIdentifier(value) ? value : only && ts.isCallExpression(only) && ts.isIdentifier(only.expression) ? only.expression : undefined;
        const fn = name ? functionOf(declarationOf(name.text, name)) && (inline ?? name) : inline;
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

  // A `from` put in by another statement than the one declaring what the save reads (a `let` holding a function and
  // reassigned, the helper's or the handler's own; a useState or useReducer value whose setter is called elsewhere; a ref
  // or an object written in place; a `var` declared in a nested block), or a FormModal used under a local alias (direct or
  // chained) fails; the same copy without that `from` gives none.
  it.each([
    ["FormModal", "let doRename = () => addCategoryAction({ scope, name: next });\n  if (errorMsg) doRename = () => renameCategoryAction({ scope, from: prev, to: next });\n  function send(e: React.FormEvent) { e.preventDefault(); void doRename(); }"],
    ["FormModal", "let send = async (e: React.FormEvent) => { await addCategoryAction({ scope, name: next }); };\n  if (errorMsg) send = async (e: React.FormEvent) => { await renameCategoryAction({ scope, from: prev, to: next }); };"],
    ["FormModal", "const [input, setInput] = useState<never>(null as never);\n  function edit() { setInput({ scope, from: prev, to: next } as never); }\n  function send(e: React.FormEvent) { e.preventDefault(); void renameCategoryAction(input); }"],
    ["FormModal", "const [state, dispatch] = useReducer((_: object, action: object) => action, {});\n  function edit() { dispatch({ scope, from: prev, to: next }); }\n  const send = (e: React.FormEvent) => renameCategoryAction({ ...state, scope } as never);"],
    ["FormModal", "const pending = useRef<never>(null as never);\n  useEffect(() => { pending.current = { scope, from: prev, to: next } as never; });\n  function send(e: React.FormEvent) { e.preventDefault(); void renameCategoryAction(pending.current); }"],
    ["FormModal", "const input = { scope, name: next } as Record<string, string>;\n  Object.assign(input, { scope, from: prev, to: next });\n  function send(e: React.FormEvent) { e.preventDefault(); void renameCategoryAction(input as never); }"],
    ["FormModal", "if (errorMsg) {\n    var input = { scope, from: prev, to: next };\n  }\n  function send(e: React.FormEvent) { e.preventDefault(); void renameCategoryAction(input!); }"],
    ["Modal", "const Modal = FormModal;\n  async function send(e: React.FormEvent) { e.preventDefault(); await renameCategoryAction({ scope, from: prev, to: next }); }"],
    ["Modal", "const Base = FormModal;\n  const Modal = Base;\n  async function send(e: React.FormEvent) { e.preventDefault(); await renameCategoryAction({ scope, from: prev, to: next }); }"],
  ])("fails on a copy of the categories card with busy removed, <%s onSubmit={send}> and %s, and not without its from", (tag, declared) => {
    const copy = (code: string) =>
      categoriesCard
        .replace("busy={busy}", "")
        .replace("onSubmit={submit}", "onSubmit={send}")
        .replace(/(<\/?)FormModal\b(?=[\s>])/g, `$1${tag}`)
        .replace("  function submit(", `  ${code}\n  function submit(`);
    const without = declared.replace(/, from: prev\b/g, "");
    expect(without).not.toBe(declared);
    expect(copy(declared)).toContain(`<${tag}\n`);
    expect(copy(declared)).toContain(`  ${declared}\n  function submit(`);
    expect(fromForms(copy(declared)).filter(({ held }) => !held)).not.toEqual([]);
    expect(fromForms(copy(without))).toEqual([]);
  });

  // A `from` that reaches the save through a callback's parameter (`.then((d) => …)`, a callback handed to a helper,
  // `forEach`, a `for…of` or `for…in` variable), a component of this file handed a setter, a ref or a callback in JSX, or a
  // destructured state value's setter fails; the same copy without that `from` gives none.
  const SEND = (sent: string) => `\n  function send(e: React.FormEvent) { e.preventDefault(); void renameCategoryAction(${sent}); }`;
  const STATE = "const [input, setInput] = useState<never>(null as never);";
  const PICKER = "function Picker({ onPick }: { onPick: (v: never) => void }) {\n  return <button type=\"button\" onClick={() => onPick({ scope, from: prev, to: next } as never)}>p</button>;\n}\n\n";
  const FILLER = "function Filler({ target }: { target: { current: never } }) {\n  target.current = { scope, from: prev, to: next } as never;\n  return null;\n}\n\n";
  it.each([
    ["", `${STATE}\n  useEffect(() => load((v) => setInput(v)), []);\n  function load(set: (v: never) => void) { set({ scope, from: prev, to: next } as never); }${SEND("input")}`, ""],
    ["", `${STATE}\n  useEffect(() => { void getDraft().then((d) => setInput(d)); }, []);\n  async function getDraft() { return { scope, from: prev, to: next } as never; }${SEND("input")}`, ""],
    ["", `const pending = useRef<never>(null as never);\n  useEffect(() => { void getDraft().then((d) => { pending.current = d; }); }, []);\n  async function getDraft() { return { scope, from: prev, to: next } as never; }${SEND("pending.current")}`, ""],
    ["", `const changes = [{ scope, from: prev, to: next }];\n  const batch: never[] = [];\n  changes.forEach((c) => batch.push(c as never));${SEND("batch[0]")}`, ""],
    ["", `const changes = [{ scope, from: prev, to: next }];\n  const batch: never[] = [];\n  for (const c of changes) batch.push(c as never);${SEND("batch[0]")}`, ""],
    ["", `const batch: never[] = [];\n  for (const k in getChanges()) batch.push(k as never);\n  function getChanges() { return { scope, from: prev, to: next }; }${SEND("batch[0]")}`, ""],
    [PICKER, `${STATE}${SEND("input")}`, "<Picker onPick={setInput} />"],
    [FILLER, `const pending = useRef<never>(null as never);${SEND("pending.current")}`, "<Filler target={pending} />"],
    [PICKER, `${STATE}\n  const pick = useCallback((v: never) => setInput(v), []);${SEND("input")}`, "<Picker onPick={pick} />"],
    [PICKER, `${STATE}${SEND("input")}`, "<Picker onPick={(v) => setInput(v)} />"],
    ["", `const [{ input }, setForm] = useState<{ input: never }>({ input: null as never });\n  function edit() { setForm({ input: { scope, from: prev, to: next } as never }); }${SEND("input")}`, ""],
    ["", `const [[input], setForm] = useState<[never]>([null as never]);\n  function edit() { setForm([{ scope, from: prev, to: next } as never]); }${SEND("input")}`, ""],
  ])("fails on a copy of the categories card with busy removed, onSubmit={send}, %s %s and %s in the form, and not without its from", (top, declared, child) => {
    const copy = (code: string, component: string) =>
      categoriesCard
        .replace("busy={busy}", "")
        .replace("onSubmit={submit}", "onSubmit={send}")
        .replace("export function CategoriesCard(", `${component}export function CategoriesCard(`)
        .replace("        <Field label=\"Name\"", `        ${child}\n        <Field label="Name"`)
        .replace("  function submit(", `  ${code}\n  function submit(`);
    const without = (code: string) => code.replace(/, from: prev\b/g, "");
    expect(without(declared + top)).not.toBe(declared + top);
    expect(copy(declared, top)).toContain(`${top}export function CategoriesCard(`);
    expect(copy(declared, top)).toContain(`        ${child}\n        <Field label="Name"`);
    expect(copy(declared, top)).toContain(`  ${declared}\n  function submit(`);
    expect(fromForms(copy(declared, top)).filter(({ held }) => !held)).not.toEqual([]);
    expect(fromForms(copy(without(declared), without(top)))).toEqual([]);
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
