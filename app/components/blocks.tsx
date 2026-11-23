"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes } from "react";
import { caretInDisplay, editedNumberText, parseNumberInput, showNumberInput } from "@/lib/number-format";
import { ChevronRightIcon, PlusIcon } from "./icons";
import { Modal } from "./modal";
import { Navigation } from "./navigation";
import { useOnce } from "./once";

/*
 * The structures every page is made of, in one place. A page picks and fills them; it never writes their markup,
 * so a change here reaches every page. The list pieces (ListBox, RowActions, drag, More) are in lists.tsx, the
 * grouped list in categories-card.tsx, the Undo toast in toast.tsx.
 */

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** A signed-in page: the navigation, then the page's cards. */
export function Page({ userName, children }: { userName: string; children: ReactNode }) {
  return (
    <main>
      <Navigation userName={userName} />
      {children}
    </main>
  );
}

/** A centred card on a page of its own, with the brand and a heading: sign-in and the error screens. */
export function CenterCard({
  id,
  title,
  pulse,
  role,
  children,
}: {
  id: string;
  title: string;
  /** The brand's pulsing dot. */
  pulse?: boolean;
  role?: "alert";
  children: ReactNode;
}) {
  return (
    <main className="signin-page">
      <section className="surface signin" aria-labelledby={id} role={role}>
        <p className="signin-brand">
          Life Tracker
          {pulse && <span className="cloud-pulse-dot" aria-hidden="true" />}
        </p>
        <h1 id={id} className="section-title">
          {title}
        </h1>
        {children}
      </section>
    </main>
  );
}

/** The control bar under the navigation. `dash`: as wide as the dashboard below it. */
export function Toolbar({ dash, children }: { dash?: boolean; children: ReactNode }) {
  return <div className={cx("toolbar", dash && "dash")}>{children}</div>;
}

/** Controls that sit together in a toolbar. */
export function ToolbarGroup({ children }: { children: ReactNode }) {
  return <div className="toolbar-group">{children}</div>;
}

/** The two-column page layout: `DashboardMain` is the wide column, `DashboardAside` the narrow one. */
export function Dashboard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("dashboard-grid", className)}>{children}</div>;
}

export function DashboardMain({ children }: { children: ReactNode }) {
  return <div className="dashboard-main">{children}</div>;
}

/** `summaryFirst`: on a phone the aside comes before the main column. */
export function DashboardAside({ summaryFirst, children }: { summaryFirst?: boolean; children: ReactNode }) {
  return <div className={cx("dashboard-aside", summaryFirst && "summary-first")}>{children}</div>;
}

/** The arrow that folds a card or a workout exercise: a box alone beside the title, pointing down while open (D-033). */
export function FoldButton({ open, label, onToggle }: { open: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" className="group-toggle" aria-expanded={open} aria-label={label} onClick={onToggle}>
      <ChevronRightIcon size={14} />
    </button>
  );
}

/**
 * A titled card. `id` names the title, which labels the card. `count`: the number after the title. `sub`: the line
 * under it. `actions`: the buttons at the head's end (`below`: they drop under the title
 * on a phone); `end`: anything else that closes the head. No `title`: a card without a head, named by `label`.
 */
export function Card({
  id,
  title,
  count,
  sub,
  actions,
  below,
  end,
  label,
  busy,
  fold,
  className,
  ref,
  children,
}: {
  id?: string;
  title?: ReactNode;
  count?: number;
  sub?: ReactNode;
  actions?: ReactNode;
  below?: boolean;
  end?: ReactNode;
  label?: string;
  /** The card is loading. */
  busy?: boolean;
  /** A small arrow after the count that folds the card's body away; the head stays. */
  fold?: { folded: boolean; onToggle: () => void };
  className?: string;
  ref?: Ref<HTMLElement>;
  children?: ReactNode;
}) {
  const heading = (
    <h2 id={id} className="section-title">
      {title}
      {count !== undefined && (
        <>
          {" "}
          <span className="muted number-tabular">{count}</span>
        </>
      )}
      {fold && (
        <>
          {" "}
          <FoldButton open={!fold.folded} label={`Show ${typeof title === "string" ? title.toLowerCase() : "the list"}`} onToggle={fold.onToggle} />
        </>
      )}
    </h2>
  );
  return (
    <section ref={ref} className={cx("surface", className)} aria-labelledby={title ? id : undefined} aria-label={title ? undefined : label} aria-busy={busy || undefined}>
      {title && (
        <div className="section-head">
          {sub ? (
            <div>
              {heading}
              <p className="muted card-sub number-tabular">{sub}</p>
            </div>
          ) : (
            heading
          )}
          {actions && <span className={cx("head-actions", below && "below")}>{actions}</span>}
          {end}
        </div>
      )}
      {!fold?.folded && children}
    </section>
  );
}

/** A slim card: a title and a line under it, and one control at its end (a switch, a Resume button). `label` names the card. */
export function Banner({
  label,
  title,
  sub,
  className,
  children,
}: {
  label?: string;
  title: ReactNode;
  sub: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx("surface", className)} aria-label={label}>
      <div>
        <h2 className="section-title">
          {title}
        </h2>
        <p className="muted card-sub">{sub}</p>
      </div>
      {children}
    </section>
  );
}

/** The red line under a form's fields. */
export function ErrorText({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="error" role="alert">
      {children}
    </p>
  );
}

/** The segmented control above a chart (the period). */
export function ChartControls({ children }: { children: ReactNode }) {
  return <div className="chart-controls">{children}</div>;
}

/** What a chart says when it has too little to draw. */
export function ChartNote({ children }: { children: ReactNode }) {
  return <p className="muted chart-note">{children}</p>;
}

/** What a chart shows, in a line under it. */
export function ChartCaption({ children }: { children: ReactNode }) {
  return <p className="muted chart-caption">{children}</p>;
}

/** A small heading over a part of a card: a category title, a chart's name. Give it `children` for a fold button. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return <h3 className="group-label">{children}</h3>;
}

/** What a list shows when it has nothing to list. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="empty-note">{children}</p>;
}

/** A big figure with what it is out of (`of`), as on a goal card. */
export function BigNumber({ value, of, children }: { value: ReactNode; of?: ReactNode; children?: ReactNode }) {
  return (
    <p className="metric-big number-tabular">
      {value}
      {of && <span className="macro-target"> {of}</span>}
      {children}
    </p>
  );
}

/** A thin bar showing `percent` (0-100); `over`: the goal is passed. */
export function ProgressBar({ percent, over }: { percent: number; over?: boolean }) {
  return (
    <div className="progress-track">
      <div className={cx("progress-fill", over && "over")} style={{ width: `${percent}%` }} />
    </div>
  );
}

/** A small coloured tag: `kind` is the colour (rest, info, warning, danger). */
export function Badge({ kind, className, children }: { kind?: string; className?: string; children: ReactNode }) {
  return <span className={cx("badge", kind && `badge-${kind}`, className)}>{children}</span>;
}

/** The small neutral button of a card head or a toolbar; `icon` goes before the label. */
export function SmallButton({
  icon,
  className,
  children,
  ...button
}: { icon?: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  return (
    <button type="button" className={cx("btn-sm", className)} {...button}>
      {icon}
      {children}
    </button>
  );
}

/** "Add item", "Add category": the small button with a plus. */
export function AddButton({ children, ...button }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  return (
    <SmallButton icon={<PlusIcon size={14} />} {...button}>
      {children}
    </SmallButton>
  );
}

/** The round tick box of a to-do or a shopping row. No `onChange`: shown only, not a control. */
export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange?: () => void; label?: string }) {
  // The tick is drawn by the CSS, the same one as on a checkbox input
  const cls = cx("todo-checkbox-btn", !onChange && "static", checked && "checked");
  return onChange ? (
    <button type="button" className={cls} onClick={onChange} aria-label={label} />
  ) : (
    <span className={cls} aria-hidden="true" />
  );
}

/** A caption over a control. */
export function Label({ text, className, children }: { text: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={className}>
      {text}
      {children}
    </label>
  );
}

/** A captioned text input (any input attribute goes through). A `type="number"` field is a `NumberField`. */
export function Field({ label, labelClassName, type, onChange, value, ...input }: { label: ReactNode; labelClassName?: string } & InputHTMLAttributes<HTMLInputElement>) {
  if (type === "number") return <NumberField label={label} labelClassName={labelClassName} onChange={onChange} value={value} {...input} />;
  return (
    <Label text={label} className={labelClassName}>
      <input type={type} onChange={onChange} value={value} {...input} />
    </Label>
  );
}

/**
 * A number field: a text field in the app's number format (number-format.ts), because the browser's number input
 * takes no comma and lets iOS select only one word. inputMode "numeric": whole numbers only. A dot or a comma typed is
 * the decimal, thousand dots go in as you type, and `onChange` gets the machine value ("1234.5"). Anything else stays
 * as typed, shows its error under the field, is passed on as it is and blocks the form's submit.
 */
function NumberField({ label, labelClassName, onChange, value, ...input }: { label: ReactNode; labelClassName?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const integer = input.inputMode === "numeric";
  const given = value === undefined ? undefined : String(value);
  const [shown, setShown] = useState(() => ({ value: given ?? "", text: showNumberInput(given ?? ""), error: "" }));
  // A value the page sets (a form opened on a row, a reset) replaces the text
  if (given !== undefined && given !== shown.value) setShown({ value: given, text: showNumberInput(given), error: "" });
  const field = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current !== null && field.current === document.activeElement) field.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [shown]);
  useEffect(() => field.current?.setCustomValidity(shown.error), [shown.error]);
  return (
    <label className={labelClassName}>
      <span id={`${id}-label`}>{label}</span>
      <input
        ref={field}
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        autoComplete="off"
        {...input}
        aria-labelledby={`${id}-label`}
        aria-invalid={shown.error ? true : undefined}
        aria-describedby={shown.error ? `${id}-error` : undefined}
        value={shown.text}
        onChange={(e) => {
          const el = e.target;
          const edit = e.nativeEvent as InputEvent;
          // A deletion inserts nothing; a paste may not say what it inserted, so its text is read whole
          const inserted = edit.inputType?.startsWith("delete") ? null : (edit.data ?? el.value);
          const edited = editedNumberText(el.value, inserted, el.selectionStart ?? el.value.length);
          const read = parseNumberInput(edited.text, { integer });
          const next = read.ok ? { value: read.value, text: read.display, error: "" } : { value: el.value, text: el.value, error: read.error };
          caret.current = read.ok ? caretInDisplay(read.display, edited.caret) : null;
          setShown(next);
          el.value = next.value;
          onChange?.(e);
        }}
      />
      {shown.error && (
        <span id={`${id}-error`} className="error" role="alert">
          {shown.error}
        </span>
      )}
    </label>
  );
}

/** The small sort drop-down in a card head. */
export function SortSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <select
      className="sort-select"
      aria-label={label}
      value={value}
      // data-pointer marks a mouse or touch open, which gets no focus ring; a key press (not the Escape that closes
      // the menu) brings it back.
      onPointerDown={(e) => (e.currentTarget.dataset.pointer = "")}
      onKeyDown={(e) => {
        if (e.key !== "Escape") delete e.currentTarget.dataset.pointer;
      }}
      onBlur={(e) => delete e.currentTarget.dataset.pointer}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A tick box with its words after it. */
export function Toggle({ label, ...input }: { label: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="toggle-label">
      <input type="checkbox" {...input} />
      {label}
    </label>
  );
}

/** Two fields side by side. */
export function FieldPair({ children }: { children: ReactNode }) {
  return <div className="form-pair">{children}</div>;
}

/** A captioned drop-down. */
export function SelectField({
  label,
  options,
  ...select
}: { label: ReactNode; options: { value: string; label: string }[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Label text={label}>
      <select {...select}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Label>
  );
}

/** Cancel and Save. `compact`: the small pair of a form inside a form. */
export function FormActions({
  onCancel,
  onSubmit,
  busy,
  canSubmit = true,
  submitLabel = "Save",
  compact,
}: {
  onCancel: () => void;
  /** Given: the submit button is a plain button that calls it (a form inside a form); otherwise it submits. */
  onSubmit?: () => void;
  busy?: boolean;
  canSubmit?: boolean;
  submitLabel?: string;
  compact?: boolean;
}) {
  return (
    <div className="form-actions">
      <button type="button" className={cx("secondary", compact && "btn-sm")} onClick={onCancel}>
        Cancel
      </button>
      <button
        type={onSubmit ? "button" : "submit"}
        className={compact ? "btn-sm" : undefined}
        disabled={busy || !canSubmit}
        onClick={onSubmit}
      >
        {busy ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}

/** One opening of a form, as `FormModal` hands it to its `onSubmit`. */
export type FormOpening = {
  /** The id an add sends (D-040): made once per opening, so a Save again after a lost answer sends the same one. */
  id: string;
  /** Whether this opening is still on screen: an answer closes or marks only its own opening. */
  stillOpen: () => boolean;
};

/**
 * A modal holding a form: the fields (children) in a stack, the error under them, then Cancel and Save. The form owns
 * its openings (D-047): `onSubmit` gets the opening's `id` and `stillOpen`, and while the opening's save is unanswered
 * Save says "Saving..." and the fields are disabled. `canSubmit` is false while a required field is empty.
 */
export function FormModal({
  isOpen,
  onClose,
  onCancel,
  title,
  onSubmit,
  error,
  errorId,
  keepsOpening,
  canSubmit,
  submitLabel,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Runs on the form's Cancel only (not Escape, a click outside or the close button), before `onClose`. */
  onCancel?: () => void;
  title: string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>, opening: FormOpening) => unknown;
  error?: string;
  /** Ties the error to the field it is about (aria-describedby). */
  errorId?: string;
  /**
   * Opened again before the save of the opening on screen has answered, the form goes on as that opening: it waits, and
   * the answer closes it or shows its refusal in it (D-043, D-047). A form passes it when a second save from a fresh
   * opening would go wrong: its save sends the values it opened with as `from` (D-040), so the second would be refused
   * as changed on another device; or the fresh opening would show the values from before the first save, so its Save
   * would undo the first (the day editor, the deload form).
   */
  keepsOpening?: boolean;
  canSubmit?: boolean;
  submitLabel?: string;
  children: ReactNode;
}) {
  // One submit until the handler settles, and the rest of a double tap on Save is swallowed, so it neither submits
  // again nor lands on what lies under the closed dialog (D-043). Enter in a field names the Save button too. The lock
  // belongs to one opening of the form: a save still unanswered after Cancel never holds the Save of the next opening.
  const once = useOnce();
  const [opening, setOpening] = useState(0);
  // The opening whose save is unanswered, if any.
  const [savingIn, setSavingIn] = useState<number | null>(null);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen && !(keepsOpening && savingIn === opening)) setOpening(opening + 1);
  }
  const saving = isOpen && savingIn === opening;
  // The opening on screen, for `stillOpen` in an answer that comes later; none once the form is closed or gone.
  const shown = useRef<number | null>(null);
  useEffect(() => {
    shown.current = isOpen ? opening : null;
    return () => {
      shown.current = null;
    };
  }, [isOpen, opening]);
  const ids = useRef({ opening: -1, id: "" });
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    const from = opening;
    if (ids.current.opening !== from) ids.current = { opening: from, id: crypto.randomUUID() };
    const { id } = ids.current;
    const ran = once(
      `form:${from}`,
      () => {
        let answered = false;
        const answer = Promise.resolve(onSubmit(e, { id, stillOpen: () => shown.current === from })).finally(() => {
          answered = true;
          setSavingIn((now) => (now === from ? null : now));
        });
        // A submit the page answers at once (a field it refuses) never shows as saving.
        queueMicrotask(() => {
          if (!answered) setSavingIn(from);
        });
        return answer;
      },
      (e.nativeEvent as SubmitEvent).submitter,
    );
    if (!ran) e.preventDefault();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={submit}>
        <fieldset className="form-stack" disabled={saving}>
          {children}
          {error && <ErrorText id={errorId}>{error}</ErrorText>}
        </fieldset>
        <FormActions
          onCancel={() => {
            onCancel?.();
            onClose();
          }}
          busy={saving}
          canSubmit={canSubmit}
          submitLabel={submitLabel}
        />
      </form>
    </Modal>
  );
}
