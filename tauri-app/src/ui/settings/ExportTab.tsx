/**
 * @file ExportTab.tsx
 * Export tab for SettingsDialog: CSV and Obsidian Markdown export.
 * Extracted from SettingsDialog to reduce component size.
 */
import { useState } from "react";
import { Download, FolderOpen } from "lucide-react";
import { useApp } from "../AppContext";
import { CSV_FIELDS } from "../../core/constants";
import type { Task } from "../../types";

interface ExportTabProps {
  tasks: Task[];
  filteredTasks: Task[];
  hasActiveFilter: boolean;
}

export function ExportTab({ tasks, filteredTasks, hasActiveFilter }: ExportTabProps) {
  const { t, locale, TC, settings } = useApp();
  const [csvFields, setCsvFields] = useState(() => new Set(CSV_FIELDS.map(f => f.key)));
  const [obsExportScope, setObsExportScope] = useState("all");
  const [obsExportMsg, setObsExportMsg] = useState<string | null>(null);

  const toggleCsvField = (key: string, checked: boolean) => {
    setCsvFields(prev => { const n = new Set(prev); checked ? n.add(key) : n.delete(key); return n; });
  };

  const getExportTasks = () => obsExportScope === "filtered" && filteredTasks ? filteredTasks : tasks;

  const sanitizeFilename = (name: string) => name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "untitled";

  const taskToFrontmatter = (task: Task) => {
    const lines = ["---"];
    lines.push(`id: "${task.id}"`);
    lines.push(`status: ${task.status || "inbox"}`);
    lines.push(`priority: ${task.priority || 4}`);
    if (task.due) lines.push(`due: ${task.due}`);
    if (task.list) lines.push(`list: "${task.list}"`);
    if (task.tags?.length) lines.push(`tags: [${task.tags.map(t => `"${t}"`).join(", ")}]`);
    if (task.personas?.length) lines.push(`personas: [${task.personas.map(p => `"${p}"`).join(", ")}]`);
    if (task.recurrence) lines.push(`recurrence: ${task.recurrence}`);
    if (task.estimate) lines.push(`estimate: "${task.estimate}"`);
    if (task.url) lines.push(`url: "${task.url}"`);
    lines.push(`created: ${task.createdAt?.slice(0, 10) || ""}`);
    lines.push("---");
    return lines.join("\n");
  };

  const exportCSV = async () => {
    const fields = CSV_FIELDS.filter(f => csvFields.has(f.key));
    const header = fields.map(f => locale === "ru" ? f.labelRu : f.labelEn).join(",");
    const rows = tasks.map(task => {
      return fields.map(f => {
        const v = (task as any)[f.key];
        if (v == null) return "";
        if (Array.isArray(v)) {
          const s = v.join("; ").replace(/"/g, '""');
          return `"${s}"`;
        }
        const s = String(v).replace(/"/g, '""');
        return (s.includes(",") || s.includes("\n") || s.includes('"')) ? `"${s}"` : s;
      }).join(",");
    });
    const bom = "\uFEFF";
    const csv = bom + [header, ...rows].join("\n");

    if (typeof (window as any).showSaveFilePicker === "function") {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: "tasks.csv",
          types: [{ description: "CSV", accept: { "text/csv": [".csv"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(csv);
        await writable.close();
        return;
      } catch (e: any) {
        if (e.name === "AbortError") return;
      }
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tasks.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportObsidianFiles = async () => {
    try {
      const dir = await (window as any).showDirectoryPicker();
      const exportTasks = getExportTasks();
      const usedNames = new Set<string>();
      for (const task of exportTasks) {
        let name = sanitizeFilename(task.title);
        if (usedNames.has(name.toLowerCase())) name += ` (${task.id.slice(-4)})`;
        usedNames.add(name.toLowerCase());
        const fm = taskToFrontmatter(task);
        const body = (task.notes || []).map((n: any) => n.content).join("\n\n");
        const content = fm + "\n\n" + body;
        const file = await dir.getFileHandle(`${name}.md`, { create: true });
        const writable = await file.createWritable();
        await writable.write(content);
        await writable.close();
      }
      setObsExportMsg(`${t("settings.export.done")}: ${exportTasks.length}`);
      setTimeout(() => setObsExportMsg(null), 3000);
    } catch (e: any) {
      if (e.name === "AbortError") return;
      console.error("Obsidian files export error:", e);
    }
  };

  const exportObsidianList = async () => {
    try {
      if (typeof (window as any).showSaveFilePicker !== "function") return;
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: "tasks.md",
        types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }],
      });
      const exportTasks = getExportTasks();
      const byList: Record<string, Task[]> = {};
      for (const task of exportTasks) {
        const list = task.list || (locale === "ru" ? "Без списка" : "No list");
        if (!byList[list]) byList[list] = [];
        byList[list].push(task);
      }
      const lines: string[] = [];
      for (const [list, listTasks] of Object.entries(byList)) {
        lines.push(`## ${list}\n`);
        for (const task of listTasks) {
          const done = task.status === "done" ? "x" : " ";
          const parts = [`- [${done}] ${task.title}`];
          if (task.due) parts.push(`📅 ${task.due}`);
          if (task.priority && task.priority < 4) parts.push(`⏫`.repeat(4 - task.priority));
          if (task.tags?.length) parts.push(task.tags.map(t => `#${t}`).join(" "));
          if (task.recurrence) parts.push(`🔁 ${task.recurrence}`);
          if (task.estimate) parts.push(`⏱️ ${task.estimate}`);
          lines.push(parts.join(" "));
        }
        lines.push("");
      }
      const writable = await handle.createWritable();
      await writable.write(lines.join("\n"));
      await writable.close();
      setObsExportMsg(`${t("settings.export.done")}: ${exportTasks.length}`);
      setTimeout(() => setObsExportMsg(null), 3000);
    } catch (e: any) {
      if (e.name === "AbortError") return;
      console.error("Obsidian list export error:", e);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className={`text-base font-semibold mb-4 ${TC.text}`}>{t("settings.export.title")}</h2>

      {/* CSV */}
      <div className={`rounded-lg border p-4 ${TC.borderClass}`}>
        <div className={`font-medium text-sm mb-1 ${TC.text}`}>{t("settings.export.csv")}</div>
        <div className={`text-xs mb-4 ${TC.textMuted}`}>{t("settings.export.csvDesc")}</div>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${TC.textMuted}`}>{t("settings.export.fields")}</div>
        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 mb-4">
          {CSV_FIELDS.map(f => (
            <label key={f.key} className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={csvFields.has(f.key)}
                onChange={e => toggleCsvField(f.key, e.target.checked)}
                className="rounded accent-sky-500 cursor-pointer" />
              <span className={`text-xs ${TC.textSec} group-hover:text-gray-200 transition-colors`}>
                {locale === "ru" ? f.labelRu : f.labelEn}
              </span>
            </label>
          ))}
        </div>
        <button onClick={exportCSV} disabled={csvFields.size === 0}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${csvFields.size > 0 ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-gray-700 text-gray-500 cursor-not-allowed"}`}>
          <Download size={14} />{t("settings.export.csvBtn")}
        </button>
      </div>

      {/* Obsidian */}
      <div className={`rounded-lg border p-4 ${TC.borderClass}`}>
        <div className={`font-medium text-sm mb-1 ${TC.text}`}>{t("settings.export.obsidian")}</div>

        <div className="flex items-center gap-3 my-3">
          <span className={`text-xs ${TC.textMuted}`}>{t("settings.export.scope")}:</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="obsScope" checked={obsExportScope === "all"} onChange={() => setObsExportScope("all")} className="accent-sky-500" />
            <span className={`text-xs ${TC.textSec}`}>{t("settings.export.scopeAll")} ({tasks.length})</span>
          </label>
          {hasActiveFilter && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="obsScope" checked={obsExportScope === "filtered"} onChange={() => setObsExportScope("filtered")} className="accent-sky-500" />
              <span className={`text-xs ${TC.textSec}`}>{t("settings.export.scopeFiltered")} ({filteredTasks?.length || 0})</span>
            </label>
          )}
        </div>

        {obsExportMsg && <div className="text-xs text-green-400 mb-3">{obsExportMsg}</div>}

        <div className={`rounded border p-3 mb-3 ${TC.borderClass}`}>
          <div className={`text-xs font-medium mb-1 ${TC.text}`}>{t("settings.export.obsidianFiles")}</div>
          <div className={`text-xs mb-3 ${TC.textMuted}`}>{t("settings.export.obsidianFilesDesc")}</div>
          <button onClick={exportObsidianFiles}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors bg-violet-600 hover:bg-violet-500 text-white">
            <FolderOpen size={14} />{t("settings.export.obsidianFilesBtn")}
          </button>
        </div>

        <div className={`rounded border p-3 ${TC.borderClass}`}>
          <div className={`text-xs font-medium mb-1 ${TC.text}`}>{t("settings.export.obsidianList")}</div>
          <div className={`text-xs mb-3 ${TC.textMuted}`}>{t("settings.export.obsidianListDesc")}</div>
          <button onClick={exportObsidianList}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors bg-violet-600 hover:bg-violet-500 text-white">
            <Download size={14} />{t("settings.export.obsidianListBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
