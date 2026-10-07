"use client";

import { useEffect, useMemo, useState } from "react";
import type { Task } from "../lib/notion";

const COLORS = [
  "#5b5bd6",
  "#33b6a0",
  "#f3a338",
  "#ef6b73",
  "#7c66dc",
  "#3b82c4",
  "#8ca75a",
  "#9aa3b2",
];
const PENDING_STATUSES = [
  "Review Later",
  "To Do (New)",
  "Do It Now",
  "Reminders",
  "(In-Process)-Self",
  "In Process—Self",
  "Allocated to team",
  "Allocated to Team",
];
const FILTERS: Array<[string, keyof Task]> = [
  ["Project", "project"],
  ["Sub-project", "subProject"],
  ["Status", "status"],
  ["Task type", "type"],
  ["Owner / person", "owner"],
];
const unique = (values: string[]) =>
  [...new Set(values.filter(Boolean))].sort();
const percent = (value: number, total: number) =>
  total ? Math.round((value / total) * 100) : 0;
const isPending = (task: Task) =>
  PENDING_STATUSES.some(
    (status) => status.toLowerCase() === task.status.toLowerCase(),
  );

function group(tasks: Task[], key: keyof Task): [string, number][] {
  const groups = new Map<string, number>();
  tasks.forEach((task) => {
    const value = String(task[key] || "Unassigned");
    groups.set(value, (groups.get(value) || 0) + 1);
  });
  return [...groups.entries()].sort((a, b) => b[1] - a[1]);
}

function Donut({ data }: { data: [string, number][] }) {
  const total = data.reduce((sum, item) => sum + item[1], 0);
  let offset = 0;
  return (
    <div className="donutWrap">
      <svg viewBox="0 0 42 42" className="donut">
        <circle
          cx="21"
          cy="21"
          r="15.9"
          fill="none"
          stroke="#edf0f6"
          strokeWidth="5"
        />
        {data.map((item, index) => {
          const share = total ? (item[1] / total) * 100 : 0;
          const start = offset;
          offset += share;
          return (
            <circle
              key={item[0]}
              cx="21"
              cy="21"
              r="15.9"
              fill="none"
              stroke={COLORS[index % COLORS.length]}
              strokeWidth="5"
              strokeDasharray={`${share} ${100 - share}`}
              strokeDashoffset={-start}
              transform="rotate(-90 21 21)"
            />
          );
        })}
        <text x="21" y="20" textAnchor="middle" className="big">
          {total}
        </text>
        <text x="21" y="25" textAnchor="middle" className="small">
          TASKS
        </text>
      </svg>
      <div className="legend">
        {data.map((item, index) => (
          <div key={item[0]}>
            <i style={{ background: COLORS[index % COLORS.length] }} />
            <span>{item[0]}</span>
            <b>{item[1]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bars({ data }: { data: [string, number][] }) {
  const max = Math.max(...data.map((item) => item[1]), 1);
  return (
    <div className="bars">
      {data.slice(0, 10).map((item, index) => (
        <div className="barRow" key={item[0]}>
          <span title={item[0]}>{item[0]}</span>
          <div>
            <i
              style={{
                width: `${(item[1] / max) * 100}%`,
                background: COLORS[index % COLORS.length],
              }}
            />
          </div>
          <b>{item[1]}</b>
        </div>
      ))}
    </div>
  );
}

function TaskTable({ tasks }: { tasks: Task[] }) {
  if (!tasks.length)
    return <div className="emptyState">No tasks match this selection.</div>;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="tableScroll">
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Project</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Due date</th>
            <th>Progress</th>
            <th>Weight</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <b>{task.name}</b>
                <small>{task.subProject}</small>
              </td>
              <td>{task.project}</td>
              <td>
                <em>{task.status}</em>
              </td>
              <td>{task.owner}</td>
              <td
                className={
                  task.dueDate &&
                  task.dueDate < today &&
                  task.status !== "Completed"
                    ? "red"
                    : ""
                }
              >
                {task.dueDate || "—"}
              </td>
              <td>
                <progress value={task.progress} max="100" /> {task.progress}%
              </td>
              <td>{task.weight || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusDetails({ tasks }: { tasks: Task[] }) {
  const [selected, setSelected] = useState("All Tasks");
  const statuses = group(tasks, "status");
  const pending = tasks.filter(isPending);
  const completedAndOther = tasks.filter((task) => !isPending(task));
  const pendingStatuses = statuses.filter(([status]) =>
    PENDING_STATUSES.some(
      (item) => item.toLowerCase() === status.toLowerCase(),
    ),
  );
  const otherStatuses = statuses.filter(
    ([status]) =>
      !PENDING_STATUSES.some(
        (item) => item.toLowerCase() === status.toLowerCase(),
      ),
  );
  const visible =
    selected === "All Tasks"
      ? tasks
      : selected === "Pending Tasks"
        ? pending
        : selected === "Completed & Other"
          ? completedAndOther
          : tasks.filter((task) => task.status === selected);
  return (
    <div className="detailsStack">
      <div className="broadSummary">
        <button
          className={selected === "All Tasks" ? "selected" : ""}
          onClick={() => setSelected("All Tasks")}
        >
          <small>TOTAL TASKS</small>
          <b>{tasks.length}</b>
          <span>Click to show every task</span>
        </button>
        <button
          className={
            selected === "Pending Tasks" ? "selected pending" : "pending"
          }
          onClick={() => setSelected("Pending Tasks")}
        >
          <small>PENDING TASKS</small>
          <b>{pending.length}</b>
          <span>
            {percent(pending.length, tasks.length)}% of selected tasks
          </span>
        </button>
        <button
          className={
            selected === "Completed & Other" ? "selected other" : "other"
          }
          onClick={() => setSelected("Completed & Other")}
        >
          <small>COMPLETED + OTHER</small>
          <b>{completedAndOther.length}</b>
          <span>
            {percent(completedAndOther.length, tasks.length)}% of selected tasks
          </span>
        </button>
      </div>
      <div className="statusGroups">
        <section className="statusGroup pendingGroup">
          <div className="groupHeading">
            <span>Pending statuses</span>
            <b>{pending.length}</b>
          </div>
          <div className="statusCards">
            {pendingStatuses.map(([status, count], index) => (
              <button
                key={status}
                className={selected === status ? "selected" : ""}
                onClick={() => setSelected(status)}
                style={{ borderLeftColor: COLORS[index % COLORS.length] }}
              >
                <span>{status}</span>
                <b>{count}</b>
              </button>
            ))}
          </div>
        </section>
        <section className="statusGroup otherGroup">
          <div className="groupHeading">
            <span>Completed & other statuses</span>
            <b>{completedAndOther.length}</b>
          </div>
          <div className="statusCards">
            {otherStatuses.map(([status, count], index) => (
              <button
                key={status}
                className={selected === status ? "selected" : ""}
                onClick={() => setSelected(status)}
                style={{
                  borderLeftColor:
                    COLORS[(index + pendingStatuses.length) % COLORS.length],
                }}
              >
                <span>{status}</span>
                <b>{count}</b>
              </button>
            ))}
          </div>
        </section>
      </div>
      <article className="panel tablePanel">
        <div className="panelTitle split">
          <div>
            <small>STATUS DRILL-DOWN</small>
            <h2>{selected}</h2>
          </div>
          <strong>
            {visible.length} task{visible.length === 1 ? "" : "s"}
          </strong>
        </div>
        <TaskTable tasks={visible} />
      </article>
    </div>
  );
}

export default function Home() {
  const [all, setAll] = useState<Task[]>([]);
  const [meta, setMeta] = useState<{ source?: string; syncedAt?: string }>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [view, setView] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    setSidebarOpen(!window.matchMedia("(max-width: 700px)").matches);
    fetch("/api/tasks")
      .then((response) => response.json())
      .then((result) => {
        setAll(result.tasks);
        setMeta(result);
      });
  }, []);
  const data = useMemo(
    () =>
      all.filter(
        (task) =>
          (!query || task.name.toLowerCase().includes(query.toLowerCase())) &&
          FILTERS.every(
            ([, key]) => !filters[key] || String(task[key]) === filters[key],
          ),
      ),
    [all, filters, query],
  );
  const today = new Date().toISOString().slice(0, 10);
  const completed = data.filter(
    (task) => task.status.toLowerCase() === "completed",
  ).length;
  const overdue = data.filter(
    (task) =>
      task.dueDate &&
      task.dueDate < today &&
      task.status.toLowerCase() !== "completed",
  ).length;
  const dueDates = data.filter((task) => task.dueDate).length;
  const averageProgress = data.length
    ? Math.round(
        data.reduce((sum, task) => sum + task.progress, 0) / data.length,
      )
    : 0;
  const totalWeight = data.reduce((sum, task) => sum + task.weight, 0);
  const weightedProgress = data.reduce(
    (sum, task) => sum + (task.weight * task.progress) / 100,
    0,
  );
  const relationsMissing =
    all.length > 0 &&
    ["project", "subProject", "status", "type", "owner"].filter(
      (key) =>
        all.filter((task) => task[key as keyof Task] === "Unassigned").length >
        all.length * 0.8,
    ).length >= 2;
  const reset = () => {
    setFilters({});
    setQuery("");
  };
  const filterOptions = (key: keyof Task) => {
    const relevant = all.filter((task) =>
      FILTERS.every(
        ([, otherKey]) =>
          otherKey === key ||
          !filters[otherKey] ||
          String(task[otherKey]) === filters[otherKey],
      ),
    );
    return unique(relevant.map((task) => String(task[key])));
  };
  const changeFilter = (key: keyof Task, value: string) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === "project") next.subProject = "";
      if (key === "type") next.owner = "";
      return next;
    });
  };

  return (
    <main className={sidebarOpen ? "" : "sidebarCollapsed"}>
      <button
        className="sidebarToggle"
        onClick={() => setSidebarOpen((open) => !open)}
        aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
      >
        {sidebarOpen ? "‹" : "☰"}
      </button>
      <aside className={sidebarOpen ? "open" : "collapsed"}>
        <div className="brand">
          <span>W</span>
          <div>
            MY WORK<small>PERFORMANCE HUB</small>
          </div>
        </div>
        {[
          "Overview",
          "Task Details",
          "Projects",
          "People",
          "Task Register",
        ].map((item) => (
          <button
            className={view === item ? "active" : ""}
            onClick={() => {
              setView(item);
              if (window.matchMedia("(max-width: 700px)").matches)
                setSidebarOpen(false);
            }}
            key={item}
          >
            {item}
          </button>
        ))}
        <div className="sideFoot">
          <b>NOTION CONNECTED</b>
          <span className={meta.source === "notion" ? "live" : "demo"} />
          <small>
            {meta.source === "notion" ? "Live workspace data" : "Preview data"}
          </small>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p>PERSONAL OPERATIONS</p>
            <h1>{view}</h1>
            <span>
              {view === "Task Details"
                ? "Click any status count to see the actual tasks behind it."
                : "One view of tasks, accountability and delivery health."}
            </span>
          </div>
          <div className="sync">
            Last refreshed
            <br />
            <b>
              {meta.syncedAt
                ? new Date(meta.syncedAt).toLocaleString()
                : "Loading…"}
            </b>
          </div>
        </header>
        {relationsMissing && (
          <div className="warning">
            <b>Related Notion databases are not accessible.</b> Share Main
            Projects, Sub Projects, Task Status, Team Allocated and Team Name
            with the same Notion integration to activate all filters.
          </div>
        )}
        <div className="filterBar">
          <button
            className="filterToggle"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filters <b>{Object.values(filters).filter(Boolean).length}</b>
            <span>{filtersOpen ? "▲" : "▼"}</span>
          </button>
          <div className="search">
            ⌕{" "}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks…"
            />
          </div>
          <span className="resultCount">
            <b>{data.length}</b> / {all.length} tasks
          </span>
        </div>
        <div className={filtersOpen ? "filterPanel open" : "filterPanel"}>
          {FILTERS.map(([label, key]) => (
            <label key={key}>
              {label}
              <select
                value={filters[key] || ""}
                onChange={(event) => changeFilter(key, event.target.value)}
              >
                <option value="">All</option>
                {filterOptions(key).map((value) => (
                  <option value={value} key={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button onClick={reset}>Reset</button>
        </div>
        <div className="scope">
          <span>
            Showing <b>{data.length}</b> of {all.length} tasks
          </span>
          {Object.entries(filters)
            .filter(([, value]) => value)
            .map(([key, value]) => (
              <em key={key}>{value}</em>
            ))}
        </div>
        {view !== "Task Details" && (
          <div className="kpis">
            <article>
              <small>TOTAL TASKS</small>
              <b>{data.length}</b>
              <span>Current selection</span>
            </article>
            <article>
              <small>COMPLETION RATE</small>
              <b>{percent(completed, data.length)}%</b>
              <span>{completed} tasks completed</span>
            </article>
            <article>
              <small>OVERDUE</small>
              <b>{overdue}</b>
              <span>{dueDates} tasks have due dates</span>
            </article>
            <article>
              <small>AVERAGE PROGRESS</small>
              <b>{averageProgress}%</b>
              <span>Across selected tasks</span>
            </article>
            <article>
              <small>WEIGHTED DELIVERY</small>
              <b>
                {totalWeight
                  ? Math.round((weightedProgress / totalWeight) * 100)
                  : 0}
                %
              </b>
              <span>Adjusted for task weight</span>
            </article>
          </div>
        )}
        {view === "Task Details" && <StatusDetails tasks={data} />}{" "}
        {view === "Overview" && (
          <div className="grid">
            <article className="panel wide">
              <div className="panelTitle">
                <small>PORTFOLIO HEALTH</small>
                <h2>Task status</h2>
              </div>
              <Donut data={group(data, "status")} />
            </article>
            <article className="panel">
              <small>DELIVERY FOCUS</small>
              <h2>Project workload</h2>
              <Bars data={group(data, "project")} />
            </article>
            <article className="panel">
              <small>ACCOUNTABILITY</small>
              <h2>Person-wise allocation</h2>
              <Bars data={group(data, "owner")} />
            </article>
            <article className="panel quality">
              <small>DATA QUALITY</small>
              <h2>Planning completeness</h2>
              {[
                [
                  "Owner assigned",
                  data.filter((task) => task.owner !== "Unassigned").length,
                ],
                [
                  "Project assigned",
                  data.filter((task) => task.project !== "Unassigned").length,
                ],
                ["Due date entered", dueDates],
                [
                  "Weightage entered",
                  data.filter((task) => task.weight > 0).length,
                ],
                [
                  "Progress updated",
                  data.filter((task) => task.progress > 0).length,
                ],
              ].map(([label, count]) => (
                <div key={label}>
                  <span>{label}</span>
                  <progress value={count as number} max={data.length} />
                  <b>{percent(count as number, data.length)}%</b>
                </div>
              ))}
            </article>
          </div>
        )}
        {view !== "Overview" && view !== "Task Details" && (
          <article className="panel tablePanel">
            <div className="panelTitle">
              <small>DETAILED VIEW</small>
              <h2>
                {view === "Projects"
                  ? "Project and sub-project performance"
                  : view === "People"
                    ? "Person-wise performance"
                    : "Complete task register"}
              </h2>
            </div>
            {view === "Projects" ? (
              <Bars data={group(data, "subProject")} />
            ) : view === "People" ? (
              <Bars data={group(data, "owner")} />
            ) : (
              <TaskTable tasks={data} />
            )}
          </article>
        )}
        <footer>
          My Work Performance Hub · Source: Notion · Filters apply across every
          metric
        </footer>
      </section>
    </main>
  );
}
