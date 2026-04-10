/**
 * @file useTaskActions.jsx
 * @description Custom hook grouping all task action handlers: context menu,
 *   flow operations, row click, bulk actions, add/edit/delete, RTM import,
 *   checkbox confirm. Extracted from task-orchestrator.jsx.
 */
import { localIsoDate } from "../core/date.js";
import { timeToMinutes, minutesToTime } from "../store/dayPlanner.js";

export function useTaskActions({
  store, tasks, locale, t, filters, selected, setSelected, setCursor,
  blockedIds, addToast, showFlowToasts, setContextMenu, editTaskId, setEditTaskId,
  confirmPending, setConfirmPending, filtered, lastIdx, setLastIdx,
  clearFilter, settings, pendingSlotTimeRef,
  setRtmImportData, rtmImportData, setImportProgress,
  handleUpdate,
}) {
  // ── Context menu handlers ─────────────────────────────────────────────────
  const handleContextMenu = (e, task) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, task });
  };

  const handleCtxOpen = (taskId) => {
    setContextMenu(null);
    setEditTaskId(taskId);
  };

  const handleCtxAssignToday = (ids) => {
    setContextMenu(null);
    store.bulkAssignToday(ids, tasks);
    const n = ids.size;
    addToast(locale === "ru"
      ? `На сегодня: ${n} ${n === 1 ? "задача" : "задач"}`
      : `Assigned today: ${n} ${n === 1 ? "task" : "tasks"}`);
  };

  const handleCtxSnooze = (ids, days, months) => {
    setContextMenu(null);
    store.bulkSnooze(ids, days, months, tasks);
    const n = ids.size;
    addToast(locale === "ru"
      ? `Отложено: ${n} ${n === 1 ? "задача" : "задач"}`
      : `Snoozed: ${n} ${n === 1 ? "task" : "tasks"}`);
  };

  const handleCtxMarkDone = async (ids) => {
    setContextMenu(null);
    if ([...ids].every(id => blockedIds.has(id))) { addToast(t("flow.blocked")); return; }
    const result = await store.bulkStatus(ids, "done", tasks);
    const n = ids.size;
    addToast(locale === "ru"
      ? `Выполнено: ${n} ${n === 1 ? "задача" : "задач"}`
      : `Done: ${n} ${n === 1 ? "task" : "tasks"}`);
    showFlowToasts(result);
  };

  const handleCtxSetStatus = async (ids, status) => {
    setContextMenu(null);
    const result = await store.bulkStatus(ids, status, tasks);
    const n = ids.size;
    addToast(locale === "ru"
      ? `${t("status." + status)}: ${n} ${n === 1 ? "задача" : "задач"}`
      : `${t("status." + status)}: ${n} ${n === 1 ? "task" : "tasks"}`);
    showFlowToasts(result);
  };

  const handleCtxDuplicate = (taskId) => {
    setContextMenu(null);
    const src = tasks.find(t => t.id === taskId);
    if (!src) return;
    const { id: _id, createdAt: _ca, rtmSeriesId: _rs, ...rest } = src;
    store.addTask({ ...rest, notes: [] }, tasks);
    addToast(locale === "ru" ? "Задача продублирована" : "Task duplicated");
  };

  const handleCtxDelete = (ids) => {
    setContextMenu(null);
    const n = ids.size;
    store.bulkDelete(ids, tasks);
    setSelected(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
    addToast(locale === "ru"
      ? `${t("toast.deleted")}: ${n} ${n === 1 ? "задача" : "задач"}`
      : `${t("toast.deleted")}: ${n} ${n === 1 ? "task" : "tasks"}`);
  };

  // ── Flow handlers ────────────────────────────────────────────────────────
  const handleFlowStartNext = async (taskId) => {
    const result = await store.bulkStatus(new Set([taskId]), "active", tasks);
    addToast(locale === "ru" ? "Задача запущена" : "Task started");
    showFlowToasts(result);
  };

  const handleFlowUpdate = (name, changes) => {
    store.updateFlow(name, changes);
  };

  const handleFlowDelete = (name) => {
    store.deleteFlow(name);
    clearFilter("flow");
  };

  // ── Row click ─────────────────────────────────────────────────────────────
  const handleRowClick = (e, taskId, idx) => {
    setCursor(idx);
    if (e.shiftKey && lastIdx !== null) {
      const lo = Math.min(lastIdx, idx), hi = Math.max(lastIdx, idx);
      setSelected(new Set(filtered.slice(lo, hi + 1).map(t => t.id)));
    } else if (e.ctrlKey || e.metaKey) {
      setSelected(prev => { const next = new Set(prev); if (next.has(taskId)) next.delete(taskId); else next.add(taskId); return next; });
      setLastIdx(idx);
    } else {
      setSelected(new Set([taskId]));
      setLastIdx(idx);
    }
  };

  // ── Bulk handlers ─────────────────────────────────────────────────────────
  const bulkDone = async () => {
    if (!selected.size) return;
    if ([...selected].every(id => blockedIds.has(id))) { addToast(t("flow.blocked")); return; }
    const n = selected.size;
    const result = await store.bulkStatus(selected, "done", tasks);
    addToast(locale === "ru"
      ? `Выполнено: ${n} ${n === 1 ? "задача" : "задач"}`
      : `Done: ${n} ${n === 1 ? "task" : "tasks"}`);
    showFlowToasts(result);
  };

  const bulkCycle = async () => {
    if (!selected.size) return;
    const result = await store.bulkCycle(selected, tasks);
    showFlowToasts(result);
  };

  const bulkShift = () => {
    const shiftable = [...selected].filter(id => { const t = tasks.find(x => x.id === id); return t && t.due && /^\d{4}-\d{2}-\d{2}$/.test(t.due); });
    if (!shiftable.length) { addToast(t("toast.noNumericDue")); return; }
    store.bulkDueShift(new Set(shiftable), tasks);
    const n = shiftable.length;
    addToast(locale === "ru"
      ? `Отложено: ${n} ${n === 1 ? "задача" : "задач"}`
      : `Postponed: ${n} ${n === 1 ? "task" : "tasks"}`);
  };

  const bulkToday = () => {
    if (!selected.size) return;
    const n = selected.size;
    store.bulkAssignToday(selected, tasks);
    addToast(locale === "ru"
      ? `На сегодня: ${n} ${n === 1 ? "задача" : "задач"}`
      : `Assigned today: ${n} ${n === 1 ? "task" : "tasks"}`);
  };

  const bulkDelete = () => {
    if (!selected.size) return;
    const n = selected.size;
    store.bulkDelete(selected, tasks); setSelected(new Set());
    addToast(locale === "ru"
      ? `${t("toast.deleted")}: ${n} ${n === 1 ? "задача" : "задач"}`
      : `${t("toast.deleted")}: ${n} ${n === 1 ? "task" : "tasks"}`);
  };

  // ── Add task ──────────────────────────────────────────────────────────────
  const handleAdd = async (taskData) => {
    const data = { ...taskData };
    if (!data.due && filters.dateRange) {
      const today = localIsoDate(new Date());
      if (filters.dateRange === "today" || filters.dateRange === "overdue") {
        data.due = today;
      } else if (filters.dateRange === "tomorrow") {
        const d = new Date(); d.setDate(d.getDate() + 1);
        data.due = localIsoDate(d);
      } else if (filters.dateRange === "week") {
        const d = new Date(); d.setDate(d.getDate() + 7);
        data.due = localIsoDate(d);
      } else if (filters.dateRange === "month") {
        const d = new Date(); d.setDate(d.getDate() + 30);
        data.due = localIsoDate(d);
      }
    }
    if (filters.status === "active" && (!data.status || data.status === "inbox")) {
      data.status = "active";
    }
    if (!data.list && filters.list) {
      data.list = filters.list;
    }
    if (filters.tag && (!data.tags || !data.tags.includes(filters.tag))) {
      data.tags = [...(data.tags || []), filters.tag];
    }
    if (filters.persona && (!data.personas || !data.personas.includes(filters.persona))) {
      data.personas = [...(data.personas || []), filters.persona];
    }
    if (!data.flowId && filters.flow) {
      data.flowId = filters.flow;
    }

    const task = await store.addTask(data, tasks);

    if (task && pendingSlotTimeRef.current && store.plannerAddTaskSlot && store.currentPlan) {
      const time = pendingSlotTimeRef.current;
      pendingSlotTimeRef.current = null;
      const startMin = timeToMinutes(time);
      const dayEnd = (settings.plannerDayEnd ?? 17) * 60;
      const slots = store.dayPlanSlots || [];
      let maxAvailable = dayEnd - startMin;
      for (const s of slots) {
        const sStart = timeToMinutes(s.startTime);
        const sEnd = timeToMinutes(s.endTime);
        if (sStart <= startMin && sEnd > startMin) { maxAvailable = 0; break; }
        if (sStart >= startMin && sStart - startMin < maxAvailable) {
          maxAvailable = sStart - startMin;
        }
      }
      const duration = Math.min(60, maxAvailable);
      if (duration > 0) {
        const endTime = minutesToTime(startMin + duration);
        store.plannerAddTaskSlot(task.id, time, endTime, tasks);
      }
    }
  };

  // ── Edit / save ──────────────────────────────────────────────────────────
  const handleEditFull = (taskId) => setEditTaskId(taskId);

  const handleEditSave = (changes) => {
    if (!editTaskId) return;
    const normalized = { ...changes };
    if ("__title__" in normalized) { normalized.title = normalized.__title__; delete normalized.__title__; }
    store.updateTask(editTaskId, normalized, tasks).then(showFlowToasts);
    setEditTaskId(null);
  };

  // ── RTM import ─────────────────────────────────────────────────────────────
  const handleRtmFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { setRtmImportData(JSON.parse(ev.target.result)); }
      catch { addToast(locale === "ru" ? "Ошибка: неверный JSON" : "Error: invalid JSON"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleRtmImport = async (includeCompleted) => {
    if (!rtmImportData) return;
    setRtmImportData(null);
    setImportProgress({ current: 0, total: 0 });
    const result = await store.importRtm(rtmImportData, {
      includeCompleted,
      onProgress: (current, total) => setImportProgress({ current, total }),
    });
    setImportProgress(null);
    const n = result.imported;
    addToast(locale === "ru"
      ? `${t("rtm.importedToast")}: ${n} ${n === 1 ? "задача" : "задач"}`
      : `${t("rtm.importedToast")}: ${n} task${n !== 1 ? "s" : ""}`);
  };

  // ── Checkbox / confirm ────────────────────────────────────────────────────
  const handleCheckboxClick = (task) => {
    const ids = selected.size > 1 && selected.has(task.id) ? new Set(selected) : new Set([task.id]);
    const isDone = task.status === "done";
    if (!isDone) {
      const allBlocked = [...ids].every(id => blockedIds.has(id));
      if (allBlocked) { addToast(t("flow.blocked")); return; }
    }
    setConfirmPending({ ids, isDone });
  };

  const handleConfirm = async () => {
    if (!confirmPending) return;
    const { ids, isDone } = confirmPending;
    const result = await store.bulkStatus(ids, isDone ? "active" : "done", tasks);
    showFlowToasts(result);
    setConfirmPending(null);
  };

  const confirmMessage = () => {
    if (!confirmPending) return "";
    const { ids, isDone } = confirmPending;
    const n = ids.size;
    if (locale === "ru") {
      if (isDone) return n === 1 ? "Отменить завершение задачи?" : `Отменить завершение ${n} задач?`;
      return n === 1 ? "Завершить задачу?" : `Завершить ${n} ${n >= 2 && n <= 4 ? "задачи" : "задач"}?`;
    }
    if (isDone) return n === 1 ? "Undo completion of task?" : `Undo completion of ${n} tasks?`;
    return n === 1 ? "Complete task?" : `Complete ${n} tasks?`;
  };

  return {
    handleContextMenu, handleCtxOpen, handleCtxAssignToday, handleCtxSnooze,
    handleCtxMarkDone, handleCtxSetStatus, handleCtxDuplicate, handleCtxDelete,
    handleFlowStartNext, handleFlowUpdate, handleFlowDelete,
    handleRowClick, bulkDone, bulkCycle, bulkShift, bulkToday, bulkDelete,
    handleAdd, handleUpdate, handleEditFull, handleEditSave,
    handleRtmFileSelect, handleRtmImport,
    handleCheckboxClick, handleConfirm, confirmMessage,
  };
}
