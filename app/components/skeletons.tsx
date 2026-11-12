import type { CSSProperties, ReactNode } from "react";
import { GROUP_COLOR, GROUP_LABEL, MUSCLE_GROUPS } from "../gym/muscle-groups";
import { Banner, Card, Dashboard, DashboardAside, DashboardMain, GroupLabel, Page, Toggle, Toolbar, ToolbarGroup } from "./blocks";
import { ListBox } from "./lists";

/*
 * What each page shows while its data loads (a route's loading.tsx). Every container gets its own stand-in with the
 * real card, the real title and the real structure classes, so each one has the size it will have once filled and
 * nothing moves when the data arrives. The stand-ins are still: no shimmer, no motion.
 */

const bone = (width: string | number, height: string | number, radius?: string): CSSProperties => ({ width, height, borderRadius: radius });

/** One stand-in for a piece of text: as tall as the line it replaces (1.5 × the font size around it). */
function Line({ width = "100%" }: { width?: string }) {
  return <span className="skeleton bone-line" style={{ width }} />;
}

/** A stand-in inside a line of text that has its own size (a big figure, a caption): it sits in the line, so the line keeps its height. */
function Inline({ width }: { width: string }) {
  return <span className="skeleton" style={{ display: "inline-block", width, height: "1em", verticalAlign: "middle", borderRadius: "0.4rem" }} />;
}

/** A stand-in for a button of a card head. */
function Action({ width = "6.5rem", tall }: { width?: string; tall?: boolean }) {
  return <span className="skeleton" style={tall ? bone(width, "2.75rem", "0.85rem") : bone(width, "2.25rem", "0.7rem")} />;
}

/** The section tabs / filter: the real `.segmented` shell without its thumb, one bone per option. */
function SegmentedBone({ count }: { count: number }) {
  return (
    <div className={`segmented loading${count > 4 ? " dense" : ""}`} style={{ "--n": count, "--i": 0 } as CSSProperties} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <button key={i} type="button" tabIndex={-1} disabled>
          <Line width="70%" />
        </button>
      ))}
    </div>
  );
}

/** The day or month stepper: arrows at the ends, the label between. */
function StepperBone() {
  return (
    <div className="month-selector" aria-hidden="true">
      <button type="button" className="month-nav-btn" tabIndex={-1} disabled><span className="skeleton" style={bone("1rem", "1rem")} /></button>
      <span className="skeleton" style={bone("40%", "1.25rem")} />
      <button type="button" className="month-nav-btn" tabIndex={-1} disabled><span className="skeleton" style={bone("1rem", "1rem")} /></button>
    </div>
  );
}

/** A list: banded rows of a name and a trailing control. `tall` rows are the ones with a second line. */
function RowsBone({ count, className = "entries", tall }: { count: number; className?: string; tall?: boolean }) {
  return (
    <ListBox wash className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="entry-row" style={{ minHeight: tall ? "4.1875rem" : "var(--row-h, 3.75rem)" }}>
          <div style={{ flex: 1 }}>
            <Line width={`${[62, 48, 70, 55, 40][i % 5]}%`} />
            {tall && <Line width="30%" />}
          </div>
          <span className="skeleton" style={bone("2.75rem", "2.75rem", "0.85rem")} />
        </div>
      ))}
    </ListBox>
  );
}

/** A round progress ring with its caption, as in `.dash-hero`. */
function RingBone() {
  return (
    <div className="dash-hero" aria-hidden="true">
      <span className="skeleton" style={bone(132, 132, "50%")} />
      <div className="dash-hero-text">
        <span className="todo-stats-fraction number-tabular"><Inline width="6rem" /></span>
        <span className="muted"><Inline width="3rem" /></span>
      </div>
    </div>
  );
}

/** Figures in tiles: the real labels (they wrap like the real ones do, which sets the tile's height) over a bone for each value. */
function StatRowBone({ labels }: { labels: string[] }) {
  return (
    <div className="stat-row" aria-hidden="true">
      {labels.map((label) => (
        <div key={label} className="stat-tile">
          <strong className="number-tabular"><Inline width="55%" /></strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

/** A bar chart: the value axis, a plot as tall as the chart (140px) and the day labels under it. */
function BarsBone({ count = 7 }: { count?: number }) {
  const heights = [55, 80, 40, 65, 90, 35, 70, 50, 85, 45];
  return (
    <div className="bars" aria-hidden="true">
      <div className="bars-axis" style={{ height: 140 }} />
      <div className="bars-plot" style={{ height: 140 }}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="bars-col">
            <div className="skeleton" style={{ height: `${heights[i % heights.length]}%`, width: "100%", borderRadius: "0.4rem 0.4rem 0 0" }} />
          </div>
        ))}
      </div>
      <div className="bars-labels">
        {Array.from({ length: count }, (_, i) => (
          <span key={i}><Line width="70%" /></span>
        ))}
      </div>
    </div>
  );
}

/** A big figure over a thin bar (water, steps). */
function GoalBone({ buttons }: { buttons?: boolean }) {
  return (
    <div aria-hidden="true">
      <p className="metric-big">
        <Inline width="5rem" /> <span className="macro-target"><Inline width="4rem" /></span>
      </p>
      <div className="progress-track" />
      {buttons && (
        <div className="tap-buttons">
          <span className="skeleton" style={bone("100%", "2.25rem", "0.7rem")} />
          <span className="skeleton" style={bone("100%", "2.25rem", "0.7rem")} />
        </div>
      )}
    </div>
  );
}

/** The four goal tiles of Nutrition. */
function MacroBone() {
  return (
    <div className="macro-grid" aria-hidden="true">
      {["Calories", "Protein", "Carbs", "Fat"].map((label) => (
        <div key={label} className="macro-card">
          <span className="macro-title">{label}</span>
          <span className="macro-numbers">
            <Line width="60%" />
            <span className="macro-target"><Line width="50%" /></span>
          </span>
          <div className="progress-track" />
        </div>
      ))}
    </div>
  );
}

/** The shared Categories card (a list of names and an add button). */
function CategoriesBone() {
  return (
    <Card id="categories-title" title="Categories" busy actions={<Action width="8rem" />}>
      <RowsBone count={2} />
    </Card>
  );
}

function Loading({ children, toolbar }: { children: ReactNode; toolbar?: ReactNode }) {
  return (
    <Page userName="">
      {toolbar}
      {children}
    </Page>
  );
}

export function TasksSkeleton() {
  return (
    <Loading
      toolbar={
        <Toolbar dash>
          <ToolbarGroup>
            <SegmentedBone count={2} />
            <SegmentedBone count={2} />
          </ToolbarGroup>
          <StepperBone />
        </Toolbar>
      }
    >
      <Dashboard className="todos-grid">
        <DashboardMain>
          <Card id="tasks-title" title="Daily tasks" below busy actions={<Action />}>
            <RowsBone count={5} className="todo-list" />
          </Card>
          <CategoriesBone />
        </DashboardMain>
        <DashboardAside>
          <Card id="progress-title" title="Progress" busy>
            <RingBone />
          </Card>
          <Card id="history-title" title="Last 7 days" busy>
            <div className="chart-controls">
              <SegmentedBone count={3} />
              <SegmentedBone count={2} />
            </div>
            <StatRowBone labels={["Average", "Perfect days", "Tasks done"]} />
            <BarsBone />
          </Card>
        </DashboardAside>
      </Dashboard>
    </Loading>
  );
}

export function WishlistSkeleton() {
  return (
    <Loading>
      <Dashboard>
        <DashboardMain>
          <Card
            id="wishlist-items-title"
            title="Items"
            below
            busy
            actions={
              <>
                <Action width="7rem" />
                <Action />
              </>
            }
          >
            <SegmentedBone count={4} />
            <RowsBone count={5} className="entries wishlist-entries" />
          </Card>
          <CategoriesBone />
        </DashboardMain>
        <DashboardAside summaryFirst>
          <Card id="wishlist-summary-title" title="Estimated Investment" busy>
            <p className="item-total">
              <span className="skeleton" style={{ ...bone("5rem", "1.4rem"), display: "inline-block", verticalAlign: "middle" }} /> <span className="muted">RON</span>
            </p>
          </Card>
        </DashboardAside>
      </Dashboard>
    </Loading>
  );
}

export function HealthSkeleton({ claude = false }: { claude?: boolean }) {
  return (
    <Loading
      toolbar={
        <>
          <Toolbar>
            <SegmentedBone count={claude ? 6 : 5} />
          </Toolbar>
          <Toolbar dash className="day-toolbar">
            <StepperBone />
          </Toolbar>
        </>
      }
    >
      <Dashboard>
        <DashboardMain>
          <Card id="macros-title" title="Nutrition" busy end={<Action width="2.75rem" tall />}>
            <MacroBone />
          </Card>
          <Card id="meals-title" title="Meals" below busy actions={<><Action width="7rem" /><Action /></>}>
            <RowsBone count={3} tall />
          </Card>
        </DashboardMain>
        <DashboardAside>
          <Card id="water-title" title="Water" busy end={<Action width="2.75rem" tall />}>
            <GoalBone buttons />
          </Card>
          <Card id="weight-trend-title" title="Weight" busy>
            <p className="metric-big">
              <Inline width="5rem" /> <span className="macro-target"><Inline width="2rem" /></span>
            </p>
            <p className="card-sub"><Inline width="40%" /></p>
          </Card>
          <Card id="steps-title" title="Steps" busy end={<Action width="2.75rem" tall />}>
            <GoalBone />
          </Card>
        </DashboardAside>
      </Dashboard>
    </Loading>
  );
}

export function GymSkeleton() {
  return (
    <Loading>
      <Banner id="deload-title" className="deload-card" title={<Inline width="7rem" />} sub={<><Inline width="6rem" /> <Inline width="4rem" /></>}>
        <Toggle label="Deload session" checked={false} disabled readOnly />
      </Banner>
      <Toolbar>
        <SegmentedBone count={2} />
      </Toolbar>
      <Card id="muscle-title" title="Muscle map" className="muscle-card" busy end={<Action width="6rem" />}>
        <div className="muscle-layout">
          <div className="muscle-stage skeleton" />
          <div className="muscle-side" aria-hidden="true">
            <div className="muscle-chips">
              {MUSCLE_GROUPS.map((g) => (
                <button key={g} type="button" className="muscle-chip" tabIndex={-1} disabled>
                  <span className="muscle-dot" style={{ background: GROUP_COLOR[g] }} aria-hidden="true" />
                  {GROUP_LABEL[g]}
                </button>
              ))}
            </div>
            <div>
              <GroupLabel>Planned sets per week</GroupLabel>
              <ul className="hbars">
                {Array.from({ length: 11 }, (_, i) => (
                  <li key={i}>
                    <span className="hbars-label"><Inline width="70%" /></span>
                    <span className="hbars-track" />
                    <span className="hbars-value"><Inline width="1rem" /></span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Card>
      <Dashboard>
        <DashboardMain>
          <Card id="preview-title" title={<Inline width="8rem" />} sub={<Inline width="5rem" />} below busy actions={<><Action /><Action width="5rem" /></>}>
            <RowsBone count={5} />
          </Card>
        </DashboardMain>
        <DashboardAside>
          <Card id="split-title" title="Training days" busy>
            <ListBox className="split-day-list">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                <div key={day} className="split-day-card">
                  <button type="button" className="split-day-select" tabIndex={-1} disabled>
                    <span className="split-day-title">
                      <strong>{day}</strong>
                      <span className="skeleton" style={bone("1.5rem", "1.75rem", "0.6rem")} />
                    </span>
                    <span className="muted split-day-sub"><Inline width="6rem" /></span>
                  </button>
                  <Action width="3.5rem" />
                </div>
              ))}
            </ListBox>
          </Card>
        </DashboardAside>
      </Dashboard>
      <Card id="history-title" title="History" className="gym-history" busy end={<Inline width="4.5rem" />}>
        <RowsBone count={3} />
      </Card>
    </Loading>
  );
}

export function SettingsSkeleton() {
  return (
    <Loading>
      <Dashboard>
        <DashboardMain>
          <Card id="claude-title" title="Claude" busy end={<Action width="9rem" />}>
            <RowsBone count={1} />
          </Card>
        </DashboardMain>
      </Dashboard>
    </Loading>
  );
}
