"use client";

import { useRef } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes } from "react";
import { cleanNumberInput, showDecimal } from "@/lib/decimal-input";
import { ChevronRightIcon, PlusIcon } from "./icons";
import { Modal } from "./modal";
import { Navigation } from "./navigation";

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
export function Toolbar({ dash, className, children }: { dash?: boolean; className?: string; children: ReactNode }) {
  return <div className={cx("toolbar", dash && "dash", className)}>{children}</div>;
}

/** Controls that sit together in a toolbar. */
export function ToolbarGroup({ children }: { children: ReactNode }) {
  return <div className="toolbar-group">{children}</div>;
}

/** The two-column page layout (`even`: two equal columns, no main/aside): `DashboardMain` is the wide column, `DashboardAside` the narrow one. */
export function Dashboard({ even, className, children }: { even?: boolean; className?: string; children: ReactNode }) {
  return <div className={cx(even ? "dashboard-grid-even" : "dashboard-grid", className)}>{children}</div>;
}

export function DashboardMain({ children }: { children: ReactNode }) {
  return <div className="dashboard-main">{children}</div>;
}

/** `summaryFirst`: on a phone the aside comes before the main column. */
export function DashboardAside({ summaryFirst, children }: { summaryFirst?: boolean; children: ReactNode }) {
  return <div className={cx("dashboard-aside", summaryFirst && "summary-first")}>{children}</div>;
}

/**
 * A titled card. `id` names the title, which labels the card. `count`: the number after the title. `sub`: the line
 * under it. `icon`: before the title. `actions`: the buttons at the head's end (`below`: they drop under the title
 * on a phone); `end`: anything else that closes the head. No `title`: a card without a head, named by `label`.
 */
export function Card({
  id,
  title,
  icon,
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
  icon?: ReactNode;
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
    <h2 id={id} className={cx("section-title", !!icon && "icon-title")}>
      {icon && <>{icon} </>}
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
          <button type="button" className="group-toggle" aria-expanded={!fold.folded} aria-label={`Show ${typeof title === "string" ? title.toLowerCase() : "the list"}`} onClick={fold.onToggle}>
            <ChevronRightIcon size={14} />
          </button>
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

/**
 * A slim card: a title and a line under it, and one control at its end (a switch, a Resume button). `id` names the
 * title; without it `label` names the card.
 */
export function Banner({
  id,
  label,
  title,
  sub,
  className,
  children,
}: {
  id?: string;
  label?: string;
  title: ReactNode;
  sub: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx("surface", className)} aria-labelledby={id} aria-label={id ? undefined : label}>
      <div>
        <h2 id={id} className="section-title">
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
export function EmptyNote({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cx("empty-note", className)}>{children}</p>;
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

/** A small coloured tag: `kind` is the colour (rest, info, carried, reminder, danger, ...). */
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

/**
 * A captioned text input (any input attribute goes through). A `type="number"` field is a text field that takes a
 * decimal comma or dot (inputMode "numeric": whole numbers only): the browser's number input accepts no comma and
 * lets iOS select only one word. `onChange` always gets a dot-decimal value; the field shows a comma.
 */
export function Field({ label, labelClassName, type, onChange, value, ...input }: { label: ReactNode; labelClassName?: string } & InputHTMLAttributes<HTMLInputElement>) {
  if (type !== "number") {
    return (
      <Label text={label} className={labelClassName}>
        <input type={type} onChange={onChange} value={value} {...input} />
      </Label>
    );
  }
  const integer = input.inputMode === "numeric";
  return (
    <Label text={label} className={labelClassName}>
      <input
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        autoComplete="off"
        {...input}
        value={value === undefined ? undefined : integer ? String(value) : showDecimal(String(value))}
        onChange={(e) => {
          e.target.value = cleanNumberInput(e.target.value, integer);
          onChange?.(e);
        }}
      />
    </Label>
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

/**
 * A modal holding a form: the fields (children) in a stack, the error under them, then Cancel and Save. `busy`
 * disables Save and says "Saving..."; `canSubmit` is false while a required field is empty.
 */
export function FormModal({
  isOpen,
  onClose,
  title,
  onSubmit,
  error,
  errorId,
  busy,
  canSubmit,
  submitLabel,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => unknown;
  error?: string | null;
  /** Ties the error to the field it is about (aria-describedby). */
  errorId?: string;
  busy?: boolean;
  canSubmit?: boolean;
  submitLabel?: string;
  children: ReactNode;
}) {
  // State is stale within one tick, so a fast double tap would submit twice: the lock lives until the handler settles.
  const locked = useRef(false);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    if (locked.current) return e.preventDefault();
    locked.current = true;
    const unlock = () => (locked.current = false);
    try {
      Promise.resolve(onSubmit(e)).then(unlock, unlock);
    } catch (error) {
      unlock();
      throw error;
    }
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={submit}>
        <div className="form-stack">
          {children}
          {error && <ErrorText id={errorId}>{error}</ErrorText>}
        </div>
        <FormActions onCancel={onClose} busy={busy} canSubmit={canSubmit} submitLabel={submitLabel} />
      </form>
    </Modal>
  );
}
