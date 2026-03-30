/**
 * DetailPanel — right sidebar showing details for one or multiple selected tasks.
 * Supports inline editing for most fields, note viewing/editing via modal,
 * and multi-select summary.
 */
import { useState, useRef } from "react";
import {
  Inbox, Flag, List, Hash, User, Calendar, Repeat, Zap,
  CornerDownRight, Link, Clock, CheckCircle2, FileText, Edit3, X,
} from "lucide-react";
import { useApp } from "./AppContext";
import { StatusBadge, PriorityBadge } from "./badges";
import { Combobox } from "./Combobox";
import { DatePickerAnchor } from "./DatePicker";
import { fmtDate, parseDateInput } from "../core/date";
import { humanRecurrence } from "../core/recurrence";
import { STATUSES, STATUS_ICONS } from "../core/constants";

export function DetailPanel({ selected, tasks, onUpdate, onEditFull }) {
  const { t, TC, lists, locale, settings, openUrl: ctxOpenUrl } = useApp();
  const dateLocale = t("footer.dateLocale");
  const [editingField, setEditingField] = useState(null);
  const [editValue,    setEditValue]    = useState("");
  const [noteModal, setNoteModal] = useState(null); // { taskId, note } | null
  const [noteModalContent, setNoteModalContent] = useState("");

  const startEdit = (field, currentVal) => {
    setEditingField(field);
    setEditValue(currentVal ?? "");
  };
  const editRef = useRef(null);
  const commitEdit = (taskId, field) => {
    if (editingField !== field) return;
    // Read from ref (uncontrolled) if available, else from state
    let raw = editRef.current ? editRef.current.value : editValue;
    let val = raw.trim() || null;
    if (field === "url" && val) {
      if (!/^https?:\/\/.+/i.test(val)) val = "https://" + val;
      if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(val)) { cancelEdit(); return; }
    }
    if ((field === "due" || field === "dateStart") && val) {
      const parsed = parseDateInput(val);
      if (!parsed) { cancelEdit(); return; }
      val = parsed;
    }
    const numVal = field === "priority" ? Number(raw.trim()) : undefined;
    onUpdate(taskId, { [field]: numVal !== undefined ? numVal : val });
    setEditingField(null);
  };
  const cancelEdit = () => setEditingField(null);

  // Renders value inline; click → edit input, blur → save
  // `value`   — actual stored value (e.g. "active", "2")
  // `display` — localized label shown to the user (e.g. "Active", "High")
  const Editable = ({ taskId, field, value, display, type = "text", options = null }) => {
    const inputCls = `w-full text-sm rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-sky-500 border ${TC.elevated} ${TC.text} ${TC.borderClass}`;
    if (editingField === field) {
      if (options) {
        return (
          <select value={editValue} autoFocus
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => commitEdit(taskId, field)}
            onKeyDown={e => { if (e.key === "Escape") cancelEdit(); if (e.key === "Enter") commitEdit(taskId, field); }}
            className={inputCls}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      }
      if (field === "list") {
        return (
          <Combobox
            autoFocus
            className={inputCls}
            value={editValue}
            onChange={setEditValue}
            options={lists}
            onBlur={() => commitEdit(taskId, field)}
            onKeyDown={e => { if (e.key === "Escape") cancelEdit(); if (e.key === "Enter") commitEdit(taskId, field); }}
          />
        );
      }
      if (type === "date") {
        return (
          <DatePickerAnchor
            value={editValue || null}
            onChange={(iso) => { onUpdate(taskId, { [field]: iso }); setEditingField(null); }}
            onClose={cancelEdit}
          />
        );
      }
      return (
        <input ref={editRef} type="text" defaultValue={editValue} autoFocus
          onBlur={() => commitEdit(taskId, field)}
          onKeyDown={e => { if (e.key === "Escape") cancelEdit(); if (e.key === "Enter") { e.preventDefault(); commitEdit(taskId, field); } }}
          className={inputCls} />
      );
    }
    // use `value` (actual stored value) as the edit seed
    const editSeed = value !== undefined && value !== null ? String(value) : "";
    if (field === "url" && display) {
      return (
        <span className="flex items-center gap-1 min-w-0">
          <span className="cursor-pointer truncate text-sky-400 hover:underline hover:text-sky-300 transition-colors"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); ctxOpenUrl(display); }}
                title={display}>
            {display.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
          </span>
          <Edit3 size={10} className={`flex-shrink-0 cursor-pointer ${TC.textMuted} hover:text-sky-400`}
                 onClick={() => startEdit(field, editSeed)} />
        </span>
      );
    }
    return (
      <span className={`cursor-text hover:opacity-75 transition-opacity ${display ? "" : `italic text-xs ${TC.textMuted}`}`}
            onClick={() => startEdit(field, editSeed)}>
        {display || "\u2014"}
      </span>
    );
  };

  const Row = ({ icon: Icon, label, children }) => (
    <div className={`flex items-start gap-2 py-2 border-b last:border-0 ${TC.borderClass}`}>
      <Icon size={13} className={`mt-0.5 flex-shrink-0 ${TC.textMuted}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-xs mb-0.5 ${TC.textMuted}`}>{label}</div>
        <div className={`text-sm break-words ${TC.text}`}>{children}</div>
      </div>
    </div>
  );

  if (selected.size === 0) {
    return (
      <aside className={`w-64 flex-shrink-0 border-l p-5 flex flex-col items-center justify-center gap-2 overflow-y-auto ${TC.borderClass}`}>
        <Inbox size={32} className={TC.textMuted} style={{ opacity: 0.5 }} />
        <p className={`text-xs text-center ${TC.textMuted}`}>
          {t("detail.empty").split("\n").map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}
        </p>
      </aside>
    );
  }

  if (selected.size > 1) {
    const selectedTasks = tasks.filter(t => selected.has(t.id));
    return (
      <aside className={`w-64 flex-shrink-0 border-l p-5 overflow-y-auto ${TC.borderClass}`}>
        <div className={`text-center mb-4 pb-4 border-b ${TC.borderClass}`}>
          <div className="text-4xl font-bold text-sky-400">{selected.size}</div>
          <div className={`text-xs mt-1 ${TC.textSec}`}>{t("detail.tasksSelected")}</div>
        </div>
        <div className="space-y-1">
          {selectedTasks.map(t => {
            const Icon = STATUS_ICONS[t.status] ?? STATUS_ICONS["inbox"];
            return (
              <div key={t.id} className={`flex items-center gap-2 px-2 py-1.5 rounded ${TC.elevated}`}>
                <Icon size={12} className={`flex-shrink-0 ${TC.textMuted}`} />
                <span className={`text-xs truncate ${TC.textSec}`}>{t.title}</span>
              </div>
            );
          })}
        </div>
      </aside>
    );
  }

  const task = tasks.find(t => t.id === [...selected][0]);
  if (!task) return null;

  // Defensive: fall back to 'inbox' icon if task has an unexpected status value
  const safeStatus = STATUS_ICONS[task.status] ? task.status : "inbox";
  const StatusIcon = STATUS_ICONS[safeStatus];
  const statusColors = {
    inbox:     "bg-gray-600/50 text-gray-200 border border-gray-500/40",
    active:    "bg-sky-600/20 text-sky-300 border border-sky-500/40",
    done:      "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40",
    cancelled: "bg-red-600/20 text-red-300 border border-red-500/40",
  };

  return (
    <aside className={`w-64 flex-shrink-0 border-l p-5 overflow-y-auto ${TC.borderClass}`}>

      {/* Title + edit button */}
      <div className={`mb-4 pb-4 border-b ${TC.borderClass}`}>
        <div className="flex items-start justify-between gap-1 mb-1">
          <p className={`text-xs ${TC.textMuted}`}>{t("detail.task")}</p>
          <button onClick={() => onEditFull(task.id)} title={t("edit.title")}
            className={`p-0.5 rounded hover:opacity-70 transition-opacity flex-shrink-0 ${TC.textMuted}`}>
            <FileText size={12} />
          </button>
        </div>
        {editingField === "__title__"
          ? <input autoFocus className={`w-full text-sm rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-sky-500 border font-medium ${TC.elevated} ${TC.text} ${TC.borderClass}`}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => commitEdit(task.id, "__title__")}
              onKeyDown={e => { if (e.key === "Enter") commitEdit(task.id, "__title__"); if (e.key === "Escape") cancelEdit(); }} />
          : <h2 className={`text-sm font-medium leading-snug cursor-text hover:opacity-75 ${TC.text}`}
                onClick={() => startEdit("__title__", task.title)}>{task.title}</h2>
        }
      </div>

      <div className="space-y-0">
        <Row icon={StatusIcon} label={t("detail.status")}>
          <Editable taskId={task.id} field="status" value={safeStatus} display={t("status." + safeStatus)}
            options={STATUSES.map(s => ({ value: s, label: t("status." + s) }))} />
        </Row>
        <Row icon={Flag} label={t("detail.priority")}>
          <Editable taskId={task.id} field="priority" value={String(task.priority)} display={t("priority." + task.priority)}
            options={[1,2,3,4].map(p => ({ value: String(p), label: `${p} \u2014 ${t("priority."+p)}` }))} />
        </Row>
        <Row icon={List} label={t("detail.list")}>
          <Editable taskId={task.id} field="list" value={task.list} display={task.list} type="text" />
        </Row>
        <Row icon={Hash} label={t("detail.tags")}>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {task.tags.length > 0
              ? task.tags.map(tag => <span key={tag} className="text-xs text-sky-400 bg-sky-400/10 px-1.5 py-0.5 rounded">#{tag}</span>)
              : <span className={`text-xs italic ${TC.textMuted}`}>{"\u2014"}</span>
            }
          </div>
        </Row>
        {(task.personas || []).length > 0 && (
          <Row icon={User} label={t("detail.personas")}>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {(task.personas || []).map(p => (
                <span key={p} className="text-xs text-indigo-400 bg-indigo-400/10 border border-indigo-400/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <User size={9} />{p}
                </span>
              ))}
            </div>
          </Row>
        )}
        <Row icon={Calendar} label={t("detail.due")}>
          <Editable taskId={task.id} field="due" value={task.due} display={fmtDate(task.due, settings?.dateFormat, locale)} type="date" />
        </Row>
        {(task.recurrence || editingField === "recurrence") && (
          <Row icon={Repeat} label={t("detail.recurrence")}>
            <Editable taskId={task.id} field="recurrence"
              value={task.recurrence}
              display={humanRecurrence(task.recurrence, locale) ?? task.recurrence} />
          </Row>
        )}
        {(task.flowId || editingField === "flowId") && (
          <Row icon={Zap} label={t("detail.flow")}>
            <Editable taskId={task.id} field="flowId" value={task.flowId} display={task.flowId} />
          </Row>
        )}
        {task.dependsOn && (
          <Row icon={CornerDownRight} label={t("detail.dependsOn")}>
            <span className="text-yellow-300">
              {tasks.find(x => x.id === task.dependsOn)?.title || task.dependsOn}
            </span>
          </Row>
        )}
        <Row icon={Link} label={t("detail.url")}>
          <Editable taskId={task.id} field="url" value={task.url} display={task.url} type="url" />
        </Row>
        <Row icon={Calendar} label={t("detail.dateStart")}>
          <Editable taskId={task.id} field="dateStart" value={task.dateStart} display={fmtDate(task.dateStart, settings?.dateFormat, locale)} type="date" />
        </Row>
        <Row icon={Clock} label={t("detail.estimate")}>
          <Editable taskId={task.id} field="estimate" value={task.estimate} display={task.estimate} />
        </Row>
        {task.postponed > 0 && (
          <Row icon={Repeat} label={t("detail.postponed")}>
            <span className={TC.textSec}>{task.postponed}{"\u00d7"}</span>
          </Row>
        )}
        <Row icon={Calendar} label={t("detail.created")}>
          <span className={`text-xs ${TC.textMuted}`}>
            {new Date(task.createdAt).toLocaleString(dateLocale, { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}
          </span>
        </Row>
        {task.completedAt && (
          <Row icon={CheckCircle2} label={t("detail.completedAt")}>
            <span className={`text-xs ${TC.textMuted}`}>
              {new Date(task.completedAt).toLocaleString(dateLocale, { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}
            </span>
          </Row>
        )}
      </div>
      {task.notes && task.notes.length > 0 && (
        <div className={`mt-4 pt-4 border-t ${TC.borderClass}`}>
          <div className="flex items-center gap-1.5 mb-2">
            <FileText size={12} className={TC.textMuted} />
            <span className={`text-xs font-medium ${TC.textMuted}`}>{t("detail.notes")} ({task.notes.length})</span>
          </div>
          <div className="space-y-2">
            {task.notes.map(note => (
              <div
                key={note.id}
                title={t("note.dblclick")}
                onDoubleClick={() => { setNoteModal({ taskId: task.id, note, allNotes: task.notes }); setNoteModalContent(note.content); }}
                className={`rounded p-2 text-xs cursor-pointer ${TC.elevated} hover:border hover:${TC.borderClass} transition-colors`}
              >
                <div className={`whitespace-pre-wrap leading-relaxed ${TC.textMuted}`}>{note.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Note edit modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setNoteModal(null)}>
          <div
            className={`w-full max-w-lg mx-4 rounded-xl shadow-2xl border ${TC.surface} ${TC.borderClass} flex flex-col`}
            onClick={e => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between px-4 py-3 border-b ${TC.borderClass}`}>
              <div className="flex items-center gap-2">
                <FileText size={14} className={TC.textMuted} />
                <span className={`text-sm font-medium ${TC.text}`}>{t("detail.notes")}</span>
              </div>
              <button onClick={() => setNoteModal(null)} className={`${TC.textMuted} hover:${TC.text} transition-colors`}><X size={16} /></button>
            </div>
            <div className="p-4">
              <textarea
                className={`w-full text-sm rounded-md px-3 py-2 border outline-none focus:ring-1 focus:ring-sky-500 resize-none ${TC.elevated} ${TC.text} ${TC.borderClass}`}
                rows={10}
                value={noteModalContent}
                onChange={e => setNoteModalContent(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Escape") { e.stopPropagation(); setNoteModal(null); }
                  if (e.key === "Enter" && e.ctrlKey) {
                    e.preventDefault();
                    if (!noteModalContent.trim()) return;
                    const updatedNotes = noteModal.allNotes.map(n =>
                      n.id === noteModal.note.id ? { ...n, content: noteModalContent.trim() } : n
                    );
                    onUpdate(noteModal.taskId, { notes: updatedNotes });
                    setNoteModal(null);
                  }
                }}
                autoFocus
              />
            </div>
            <div className={`flex justify-end gap-2 px-4 py-3 border-t ${TC.borderClass}`}>
              <button
                onClick={() => setNoteModal(null)}
                className={`px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 ${TC.elevated} ${TC.textSec} hover:opacity-80 transition-colors`}
              >
                {t("note.cancel")}
                <kbd className={`text-xs px-1.5 py-0.5 rounded border ${TC.borderClass} opacity-60 font-mono`}>Esc</kbd>
              </button>
              <button
                onClick={() => {
                  if (!noteModalContent.trim()) return;
                  const updatedNotes = noteModal.allNotes.map(n =>
                    n.id === noteModal.note.id ? { ...n, content: noteModalContent.trim() } : n
                  );
                  onUpdate(noteModal.taskId, { notes: updatedNotes });
                  setNoteModal(null);
                }}
                className="px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                {t("note.save")}
                <kbd className="text-xs px-1.5 py-0.5 rounded border border-white/30 opacity-70 font-mono">{"Ctrl+\u21b5"}</kbd>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
