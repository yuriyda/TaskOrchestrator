/**
 * Overdue detection: computes overdue level for a task and provides CSS/color constants.
 * Returns "late" when due < today and task is not done/cancelled, null otherwise.
 */
export const OVERDUE_DATE_CLS = { today: "text-yellow-400", overdue: "text-orange-400", late: "text-red-400" };
export const OVERDUE_STRIPE   = { today: "rgba(234,179,8,.75)", overdue: "rgba(251,146,60,.8)", late: "rgba(239,68,68,.85)" };
export const OVERDUE_BG       = { today: "rgba(234,179,8,.04)", overdue: "rgba(251,146,60,.05)", late: "rgba(239,68,68,.07)" };

export function overdueLevel(task) {
  if (!task.due || task.status === "done" || task.status === "cancelled") return null;
  const today = new Date().toISOString().slice(0, 10);
  if (task.due < today) return "late";
  return null;
}
