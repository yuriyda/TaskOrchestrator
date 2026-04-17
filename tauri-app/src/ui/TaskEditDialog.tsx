/**
 * @file TaskEditDialog.jsx
 * @description Modal dialog for editing all fields of a task — title, status,
 *   priority, list, tags, personas, dates, recurrence, URL, estimate, flow,
 *   dependency, and inline notes editor.
 */

import { useState } from "react";
import { X, Plus, User } from "lucide-react";
import { useApp } from "./AppContext";
import { ulid } from "../ulid";
import { Combobox } from "./Combobox";
import { DateField } from "./DatePicker";
import { STATUSES, PRIORITY_COLORS } from "../core/constants";
import { wouldCreateCycle } from "../core/taskActions.js";
import type { Task } from "../types";

function normalizeEstimate(raw) {
  const s = (raw || "").trim();
  if (!s) return "";
  const hMatch = s.match(/^([\d.]+)\s*h(?:ours?)?$/i);
  if (hMatch) { const h = parseFloat(hMatch[1]); return h > 0 ? `${h} hours` : ""; }
  const mMatch = s.match(/^([\d.]+)\s*m(?:in(?:utes?)?)?$/i);
  if (mMatch) { const m = Math.round(parseFloat(mMatch[1])); return m > 0 ? `${m} min` : ""; }
  const num = parseFloat(s);
  if (!isNaN(num) && num > 0) return num >= 60 ? `${(num / 60).toFixed(num % 60 ? 1 : 0)} hours` : `${Math.round(num)} min`;
  return "";
}

function normalizeUrl(raw) {
  let u = (raw || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(u) ? u : "";
}

function normalizeRecurrence(raw) {
  const r = (raw || "").trim();
  if (!r) return "";
  if (/^(daily|weekly|monthly|yearly)$/i.test(r)) return r.toLowerCase();
  if (/^FREQ=/i.test(r)) return r;
  return "";
}

interface TaskEditDialogProps {
  task: Task;
  tasks?: Task[];
  onSave: (changes: Partial<Task>) => void;
  onCancel: () => void;
}

export function TaskEditDialog({ task, tasks: allTasks = [], onSave, onCancel }: TaskEditDialogProps) {
  const { t, TC, lists, tags: allTags, flows, personas: allPersonas } = useApp();
  const [form, setForm] = useState({
    title:      task.title      || "",
    status:     task.status     || "inbox",
    priority:   task.priority   || 4,
    list:       task.list       || "",
    tags:       [...(task.tags     || [])],
    personas:   [...(task.personas || [])],
    due:        task.due        || "",
    dateStart:  task.dateStart  || "",
    recurrence: task.recurrence || "",
    url:        task.url        || "",
    estimate:   task.estimate   || "",
    flowId:     task.flowId     || "",
    notes:      [...(task.notes || [])],
  });
  // dependsOn: multi-dep array, stored separately from form
  const [dependsOn, setDependsOn] = useState<string[]>(() => {
    const d = task.dependsOn;
    return Array.isArray(d) ? d.map(String) : d ? [String(d)] : [];
  });
  const [depInput, setDepInput] = useState("");
  const taskOptions = allTasks
    .filter(x => x.id !== task.id)
    .map(x => ({ value: x.id, label: x.title }));
  const addDep = (id: string) => {
    if (!id || dependsOn.includes(id)) { setDepInput(""); return; }
    if (wouldCreateCycle(allTasks, String(task.id), id)) { setDepInput(""); return; }
    setDependsOn(prev => [...prev, id]);
    setDepInput("");
  };
  const removeDep = (id: string) => setDependsOn(prev => prev.filter(d => d !== id));
  const [tagInput,     setTagInput]     = useState("");
  const [personaInput, setPersonaInput] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null); // null = none, "new" = new note form
  const [noteContent, setNoteContent] = useState("");

  const startAdd  = () => { setNoteContent(""); setEditingNoteId("new"); };
  const startEdit = (note) => { setNoteContent(note.content || ""); setEditingNoteId(note.id); };
  const cancelNote = () => { setEditingNoteId(null); setNoteContent(""); };
  const saveNote = () => {
    if (!noteContent.trim()) return;
    if (editingNoteId === "new") {
      const newNote = { id: ulid(), content: noteContent.trim(), createdAt: new Date().toISOString() };
      set("notes", [...form.notes, newNote]);
    } else {
      set("notes", form.notes.map(n => n.id === editingNoteId ? { ...n, content: noteContent.trim() } : n));
    }
    cancelNote();
  };
  const deleteNote = (id) => set("notes", form.notes.filter(n => n.id !== id));

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const addTag = (tag) => {
    const cleaned = tag.trim().replace(/^#/, "");
    if (cleaned && !form.tags.includes(cleaned)) set("tags", [...form.tags, cleaned]);
    setTagInput("");
  };
  const removeTag = (tag) => set("tags", form.tags.filter(t => t !== tag));

  const addPersona = (p) => {
    const cleaned = p.trim().replace(/^\\/, "").replace(/\s+/g, "");
    if (cleaned && !form.personas.includes(cleaned)) set("personas", [...form.personas, cleaned]);
    setPersonaInput("");
  };
  const removePersona = (p) => set("personas", form.personas.filter(x => x !== p));

  const handleSave = () => {
    // Auto-flush any note currently open in the editor
    let finalNotes = form.notes;
    if (editingNoteId && noteContent.trim()) {
      if (editingNoteId === "new") {
        const newNote = { id: ulid(), content: noteContent.trim(), createdAt: new Date().toISOString() };
        finalNotes = [...form.notes, newNote];
      } else {
        finalNotes = form.notes.map(n => n.id === editingNoteId ? { ...n, content: noteContent.trim() } : n);
      }
    }
    const changes = {
      title:      form.title.trim()  || task.title,
      status:     form.status,
      priority:   Number(form.priority),
      list:       form.list.trim()       || null,
      tags:       form.tags,
      personas:   form.personas,
      due:        form.due               || null,
      dateStart:  form.dateStart         || null,
      recurrence: normalizeRecurrence(form.recurrence) || null,
      url:        normalizeUrl(form.url) || null,
      estimate:   normalizeEstimate(form.estimate) || null,
      flowId:     form.flowId.trim()     || null,
      dependsOn:  dependsOn.length ? dependsOn : null,
      notes:      finalNotes,
    };
    onSave(changes);
  };

  const inputCls = `w-full text-sm rounded-md px-3 py-1.5 border outline-none focus:ring-1 focus:ring-sky-500 ${TC.elevated} ${TC.text} ${TC.borderClass}`;
  const labelCls = `block text-xs mb-1 ${TC.textMuted}`;
  const sectionCls = `grid gap-3 mb-4`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
         onMouseDown={e => { if (e.target === e.currentTarget) e.currentTarget.dataset.bd = "1"; }}
         onClick={e => { if (e.currentTarget.dataset.bd) { delete e.currentTarget.dataset.bd; onCancel(); } }}>
      <div className={`w-[520px] max-h-[90vh] flex flex-col rounded-xl shadow-2xl border ${TC.surface} ${TC.borderClass}`}
           onClick={e => e.stopPropagation()}
           onKeyDown={e => {
             if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
             else if (e.key === "Enter" && !["TEXTAREA","SELECT","BUTTON"].includes(e.target.tagName)) {
               e.preventDefault(); e.stopPropagation(); handleSave();
             }
           }}>

        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b flex-shrink-0 ${TC.borderClass}`}>
          <h2 className={`text-sm font-semibold ${TC.text}`}>{t("edit.title")}</h2>
          <button onClick={onCancel} className={`p-1 rounded hover:opacity-70 ${TC.textMuted}`}><X size={16} /></button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Title */}
          <div>
            <label className={labelCls}>{t("edit.field.title")}</label>
            <input className={inputCls} value={form.title}
              onChange={e => set("title", e.target.value)}
              autoFocus />
          </div>

          {/* Status + Priority */}
          <div className={`${sectionCls} grid-cols-2`}>
            <div>
              <label className={labelCls}>{t("edit.field.status")}</label>
              <select className={inputCls} value={form.status} onChange={e => set("status", e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{t("status." + s)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("edit.field.priority")}</label>
              <div className="flex gap-1">
                {[1,2,3,4].map(p => (
                  <button key={p} onClick={() => set("priority", p)}
                    style={{ background: form.priority === p ? PRIORITY_COLORS[p] : "transparent",
                             border: `1px solid ${PRIORITY_COLORS[p]}`, color: form.priority === p ? "#fff" : PRIORITY_COLORS[p] }}
                    className="flex-1 text-xs font-bold rounded py-1.5 transition-colors">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* List + Due */}
          <div className={`${sectionCls} grid-cols-2`}>
            <div>
              <label className={labelCls}>{t("edit.field.list")}</label>
              <Combobox
                className={inputCls}
                value={form.list}
                onChange={v => set("list", v)}
                options={lists}
                placeholder={t("edit.newList")}
              />
            </div>
            <div>
              <label className={labelCls}>{t("edit.field.due")}</label>
              <DateField className={inputCls} value={form.due} onChange={v => set("due", v)} />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className={labelCls}>{t("edit.field.tags")}</label>
            <div className={`flex flex-wrap gap-1.5 p-2 rounded-md border min-h-[36px] ${TC.elevated} ${TC.borderClass}`}>
              {form.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-xs text-sky-400 bg-sky-400/10 border border-sky-400/30 px-2 py-0.5 rounded-full">
                  #{tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-red-400 transition-colors"><X size={10} /></button>
                </span>
              ))}
              <Combobox
                className={`text-xs bg-transparent outline-none min-w-[100px] flex-1 ${TC.text}`}
                value={tagInput}
                onChange={setTagInput}
                onCommit={addTag}
                options={allTags}
                placeholder={t("edit.addTag")}
                onKeyDown={e => {
                  if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) { e.preventDefault(); e.stopPropagation(); addTag(tagInput); return; }
                  if (e.key === "Backspace" && !tagInput && form.tags.length) removeTag(form.tags[form.tags.length - 1]);
                }}
                onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
              />
            </div>
          </div>

          {/* Personas */}
          <div>
            <label className={labelCls}>{t("edit.field.personas")}</label>
            <div className={`flex flex-wrap gap-1.5 p-2 rounded-md border min-h-[36px] ${TC.elevated} ${TC.borderClass}`}>
              {form.personas.map(p => (
                <span key={p} className="flex items-center gap-1 text-xs text-indigo-400 bg-indigo-400/10 border border-indigo-400/30 px-2 py-0.5 rounded-full">
                  <User size={9} />{p}
                  <button onClick={() => removePersona(p)} className="hover:text-red-400 transition-colors"><X size={10} /></button>
                </span>
              ))}
              <Combobox
                className={`text-xs bg-transparent outline-none min-w-[100px] flex-1 ${TC.text}`}
                value={personaInput}
                onChange={v => setPersonaInput(v.replace(/\s/g, ""))}
                onCommit={addPersona}
                options={allPersonas}
                placeholder={t("edit.addPersona")}
                onKeyDown={e => {
                  if ((e.key === "Enter" || e.key === ",") && personaInput.trim()) { e.preventDefault(); e.stopPropagation(); addPersona(personaInput); return; }
                  if (e.key === "Backspace" && !personaInput && form.personas.length) removePersona(form.personas[form.personas.length - 1]);
                }}
                onBlur={() => { if (personaInput.trim()) addPersona(personaInput); }}
              />
            </div>
          </div>

          {/* Start date + Recurrence */}
          <div className={`${sectionCls} grid-cols-2`}>
            <div>
              <label className={labelCls}>{t("edit.field.dateStart")}</label>
              <DateField className={inputCls} value={form.dateStart} onChange={v => set("dateStart", v)} />
            </div>
            <div>
              <label className={labelCls}>{t("edit.field.recurrence")}</label>
              <Combobox
                className={inputCls}
                value={form.recurrence}
                onChange={v => set("recurrence", v)}
                options={["daily","weekly","monthly","FREQ=DAILY","FREQ=WEEKLY;INTERVAL=1","FREQ=MONTHLY;INTERVAL=1","FREQ=YEARLY;INTERVAL=1"]}
                placeholder="daily / weekly / FREQ=..."
              />
            </div>
          </div>

          {/* URL + Estimate */}
          <div className={`${sectionCls} grid-cols-2`}>
            <div>
              <label className={labelCls}>{t("edit.field.url")}</label>
              <input className={inputCls} type="url" value={form.url} onChange={e => set("url", e.target.value)} onBlur={() => set("url", normalizeUrl(form.url))} placeholder="https://..." />
            </div>
            <div>
              <label className={labelCls}>{t("edit.field.estimate")}</label>
              <input className={inputCls} value={form.estimate} onChange={e => set("estimate", e.target.value)} onBlur={() => set("estimate", normalizeEstimate(form.estimate))} placeholder="1 hour / 30 min" />
            </div>
          </div>

          {/* Flow */}
          <div>
            <label className={labelCls}>{t("edit.field.flow")}</label>
            <Combobox
              className={inputCls}
              value={form.flowId}
              onChange={v => set("flowId", v)}
              options={flows}
            />
          </div>

          {/* Depends on — multi-dep chips */}
          <div>
            <label className={labelCls}>{t("edit.field.dependsOn")}</label>
            <div className={`flex flex-wrap gap-1.5 p-2 rounded-md border min-h-[36px] ${TC.elevated} ${TC.borderClass}`}>
              {dependsOn.map(depId => {
                const depTask = allTasks.find(x => x.id === depId);
                return (
                  <span key={depId} className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2 py-0.5 rounded-full">
                    {depTask?.title?.slice(0, 28) || depId}
                    <button onClick={() => removeDep(depId)} type="button" className="hover:text-red-400 transition-colors"><X size={10} /></button>
                  </span>
                );
              })}
              <Combobox
                className={`text-xs bg-transparent outline-none min-w-[120px] flex-1 ${TC.text}`}
                value={depInput}
                onChange={v => {
                  setDepInput(v);
                  const matched = allTasks.find(x => x.id === v);
                  if (matched) addDep(matched.id);
                }}
                onCommit={v => {
                  const matched = allTasks.find(x => x.id === v || x.title.toLowerCase() === v.toLowerCase());
                  if (matched) addDep(matched.id);
                }}
                options={taskOptions.filter(o => !dependsOn.includes(o.value))}
                placeholder={t("edit.field.dependsOn") + "..."}
                onKeyDown={e => {
                  if (e.key === "Backspace" && !depInput && dependsOn.length) removeDep(dependsOn[dependsOn.length - 1]);
                }}
              />
            </div>
          </div>

          {/* Notes editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>{t("detail.notes")}{form.notes.length > 0 ? ` (${form.notes.length})` : ""}</label>
              {editingNoteId === null && (
                <button onClick={startAdd} type="button"
                  className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors">
                  <Plus size={11} />{t("note.add")}
                </button>
              )}
            </div>

            {/* Existing notes */}
            <div className="space-y-2">
              {form.notes.map(note => (
                <div key={note.id}>
                  {editingNoteId === note.id ? (
                    <div className={`rounded-md p-2 border ${TC.elevated} ${TC.borderClass}`}>
                      <textarea
                        className={`w-full text-xs bg-transparent outline-none focus:outline-none resize-none ${TC.text} placeholder:opacity-40`}
                        rows={4}
                        value={noteContent}
                        onChange={e => setNoteContent(e.target.value)}
                        placeholder={t("note.content")}
                        autoFocus
                      />
                      <div className="flex gap-1.5 mt-1.5">
                        <button onClick={saveNote} type="button" className="text-xs px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors">{t("note.save")}</button>
                        <button onClick={cancelNote} type="button" className={`text-xs px-2 py-0.5 rounded ${TC.elevated} ${TC.textMuted} hover:opacity-80 transition-colors`}>{t("note.cancel")}</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`group rounded-md p-2 text-xs border cursor-pointer ${TC.elevated} ${TC.borderClass} hover:border-sky-500/50 transition-colors`}
                      onClick={() => startEdit(note)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startEdit(note); } }}
                      tabIndex={0}
                      role="button"
                      aria-label={t("note.edit")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className={`whitespace-pre-wrap leading-relaxed ${TC.textMuted}`}>{note.content}</div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
                            type="button"
                            className={`${TC.textMuted} hover:text-red-400 transition-colors`}
                            title={t("note.delete")}
                          ><X size={11} /></button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* New note form */}
            {editingNoteId === "new" && (
              <div className={`rounded-md p-2 border mt-2 ${TC.elevated} ${TC.borderClass}`}>
                <textarea
                  className={`w-full text-xs bg-transparent outline-none focus:outline-none resize-none ${TC.text} placeholder:opacity-40`}
                  rows={4}
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  placeholder={t("note.content")}
                  autoFocus
                />
                <div className="flex gap-1.5 mt-1.5">
                  <button onClick={saveNote} type="button" className="text-xs px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white transition-colors">{t("note.save")}</button>
                  <button onClick={cancelNote} type="button" className={`text-xs px-2 py-0.5 rounded ${TC.elevated} ${TC.textMuted} hover:opacity-80 transition-colors`}>{t("note.cancel")}</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`flex gap-2 justify-end px-6 py-4 border-t flex-shrink-0 ${TC.borderClass}`}>
          <button onClick={onCancel}
            className={`px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${TC.elevated} ${TC.textSec} hover:opacity-80`}>
            {t("confirm.cancel")}
            <kbd className={`text-xs px-1 py-0.5 rounded font-mono leading-none opacity-60 ${TC.surface}`}>Esc</kbd>
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors flex items-center gap-2">
            {t("edit.save")}
            <kbd className="text-xs bg-sky-500/40 text-white/80 px-1 py-0.5 rounded font-mono leading-none">↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
