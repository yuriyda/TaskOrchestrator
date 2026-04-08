/**
 * @file useFilteredTasks.ts
 * @description Memoized filtering, sorting, overdue floating, and blocked-task
 *   detection. Pure computation — no side effects beyond cursor/selection clamping.
 *   Extracted from TaskOrchestrator.
 */
import { useMemo, useEffect, type Dispatch, type SetStateAction } from "react";
import { localIsoDate } from "../core/date.js";
import { overdueLevel } from "../core/overdue.js";
import { STATUS_ORDER } from "../core/constants.js";
import { swapLayout } from "../core/layout.js";
import type { Task, TaskId } from "../types";

interface Filters {
  status: string | null;
  dateRange: string | null;
  list: string | null;
  tag: string | null;
  flow: string | null;
  persona: string | null;
}

interface SortState {
  field: string;
  dir: "asc" | "desc";
}

interface UseFilteredTasksParams {
  tasks: Task[];
  filters: Filters;
  searchQuery: string;
  calendarFilter: string | null;
  sort: SortState | null;
  locale: string;
  cursor: number;
  setCursor: (n: number) => void;
  setSelected: Dispatch<SetStateAction<Set<TaskId>>>;
}

export function useFilteredTasks({
  tasks, filters, searchQuery, calendarFilter, sort, locale,
  cursor, setCursor, setSelected,
}: UseFilteredTasksParams) {
  const filtered = useMemo(() => {
    let r = tasks;
    if (filters.status) r = r.filter(tk => tk.status === filters.status);
    if (filters.dateRange) {
      const todayStr = localIsoDate(new Date());
      const isPastDue = (tt: Task) => tt.due && tt.due < todayStr && tt.status !== "done" && tt.status !== "cancelled";
      const v = filters.dateRange;
      if (v === "overdue") r = r.filter(isPastDue);
      else if (v === "today") r = r.filter(tt => tt.due === todayStr || isPastDue(tt));
      else if (v === "tomorrow") { const d = new Date(); d.setDate(d.getDate() + 1); const tom = localIsoDate(d); r = r.filter(tt => tt.due === tom || isPastDue(tt)); }
      else if (v === "week") { const d = new Date(); d.setDate(d.getDate() + 7); const max = localIsoDate(d); r = r.filter(tt => (tt.due && tt.due >= todayStr && tt.due <= max) || isPastDue(tt)); }
      else if (v === "month") { const d = new Date(); d.setDate(d.getDate() + 30); const max = localIsoDate(d); r = r.filter(tt => (tt.due && tt.due >= todayStr && tt.due <= max) || isPastDue(tt)); }
    }
    if (filters.list) r = r.filter(tk => tk.list === filters.list);
    if (filters.tag) r = r.filter(tk => tk.tags.includes(filters.tag!));
    if (filters.flow) r = r.filter(tk => tk.flowId === filters.flow);
    if (filters.persona) r = r.filter(tk => (tk.personas || []).includes(filters.persona!));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const altQ = swapLayout(q);
      const match = (str: string) => { const s = str.toLowerCase(); return s.includes(q) || (altQ !== q && s.includes(altQ)); };
      r = r.filter(t =>
        match(t.title) ||
        t.tags.some(tag => match(tag)) ||
        (t.list && match(t.list))
      );
    }
    if (calendarFilter) r = r.filter(t => t.due === calendarFilter);

    const field = sort?.field ?? null;
    const mul = sort ? (sort.dir === "asc" ? 1 : -1) : 1;
    r = [...r].sort((a, b) => {
      if (field === "priority") {
        const va = a.priority ?? 99, vb = b.priority ?? 99;
        if (va !== vb) return (va - vb) * mul;
      } else if (field === "status") {
        const va = (STATUS_ORDER as Record<string, number>)[a.status] ?? 99;
        const vb = (STATUS_ORDER as Record<string, number>)[b.status] ?? 99;
        if (va !== vb) return (va - vb) * mul;
      } else if (field === "due") {
        if (!a.due && !b.due) { /* fall through */ }
        else if (!a.due) return 1;
        else if (!b.due) return -1;
        else if (a.due !== b.due) return (a.due < b.due ? -1 : 1) * mul;
      } else if (field === "createdAt") {
        if (a.createdAt !== b.createdAt) return (a.createdAt < b.createdAt ? -1 : 1) * mul;
      }
      return a.title.localeCompare(b.title, locale);
    });

    return r;
  }, [tasks, filters, searchQuery, calendarFilter, sort, locale]);

  const displayFiltered = useMemo(() => {
    const isOverdue = (t: Task) => overdueLevel(t) !== null;
    const over = filtered.filter(isOverdue);
    if (over.length === 0) return filtered;
    return [...over, ...filtered.filter(t => !isOverdue(t))];
  }, [filtered]);

  const overdueCount = useMemo(
    () => displayFiltered.filter(t => overdueLevel(t) !== null).length,
    [displayFiltered]
  );

  const blockedIds = useMemo(() => {
    const doneSet = new Set(tasks.filter(t => t.status === "done").map(t => t.id));
    const blocked = new Set<TaskId>();
    for (const t of tasks) {
      if (t.dependsOn && !doneSet.has(t.dependsOn)) blocked.add(t.id);
    }
    return blocked;
  }, [tasks]);

  useEffect(() => {
    if (displayFiltered.length > 0 && cursor >= displayFiltered.length) setCursor(displayFiltered.length - 1);
    const visibleIds = new Set(displayFiltered.map(t => t.id));
    setSelected(prev => {
      const next = new Set([...prev].filter(id => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [displayFiltered]);

  return { filtered, displayFiltered, overdueCount, blockedIds };
}
