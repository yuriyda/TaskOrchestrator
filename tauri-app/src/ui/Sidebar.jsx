/**
 * @file Sidebar.jsx
 * Left sidebar: agenda, status, lists, tags, personas, flows, hotkeys,
 * theme switcher, and settings shortcut.
 */
import { useState, useMemo } from "react";
import { useApp } from "./AppContext";
import {
  Inbox, Zap, Check, X, List, Hash, User, Keyboard, Calendar,
  ChevronsDown, ChevronsUp, ChevronRight, Filter, AlertTriangle,
  Settings, Sun, Moon, Play,
} from "lucide-react";
import { STATUSES, STATUS_ICONS } from "../core/constants";
import { localIsoDate } from "../core/date";
import { themeOptions } from "./icons";

export function Sidebar({ tasks, filters, setFilter, clearFilter, onOpenSettings }) {
  const { t, theme, setTheme, TC, settings, flowMeta, openUrl: ctxOpenUrl } = useApp();

  const lists    = useMemo(() => { const m = {}; tasks.forEach(t => { if (t.list) m[t.list] = (m[t.list] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [tasks]);
  const tags     = useMemo(() => { const m = {}; tasks.forEach(t => t.tags.forEach(g => { m[g] = (m[g] || 0) + 1; })); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [tasks]);
  const flows    = useMemo(() => { const m = {}; tasks.forEach(t => { if (t.flowId) m[t.flowId] = (m[t.flowId] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [tasks]);
  const personas = useMemo(() => { const m = {}; tasks.forEach(t => (t.personas || []).forEach(p => { m[p] = (m[p] || 0) + 1; })); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [tasks]);
  // Flow progress: { name: { total, done } }
  const flowProgress = useMemo(() => {
    const m = {};
    tasks.forEach(t => {
      if (!t.flowId) return;
      if (!m[t.flowId]) m[t.flowId] = { total: 0, done: 0 };
      m[t.flowId].total++;
      if (t.status === "done") m[t.flowId].done++;
    });
    return m;
  }, [tasks]);
  const statusCounts = useMemo(() => { const m = {}; STATUSES.forEach(s => { m[s] = tasks.filter(t => t.status === s).length; }); return m; }, [tasks]);

  // Collapsed state per section; hotkeys collapsed by default
  const [open, setOpen] = useState({ agenda: true, status: true, lists: true, tags: true, personas: true, flows: true, hotkeys: false });

  const agendaCounts = useMemo(() => {
    const todayStr = localIsoDate(new Date());
    const d1 = new Date(); d1.setDate(d1.getDate() + 1);
    const tom = localIsoDate(d1);
    const d7 = new Date(); d7.setDate(d7.getDate() + 7);
    const max7 = localIsoDate(d7);
    const d30 = new Date(); d30.setDate(d30.getDate() + 30);
    const max30 = localIsoDate(d30);
    const isPastDue = tt => tt.due && tt.due < todayStr && tt.status !== "done" && tt.status !== "cancelled";
    return {
      overdue:  tasks.filter(isPastDue).length,
      today:    tasks.filter(tt => tt.due === todayStr || isPastDue(tt)).length,
      tomorrow: tasks.filter(tt => tt.due === tom || isPastDue(tt)).length,
      week:     tasks.filter(tt => (tt.due && tt.due >= todayStr && tt.due <= max7) || isPastDue(tt)).length,
      month:    tasks.filter(tt => (tt.due && tt.due >= todayStr && tt.due <= max30) || isPastDue(tt)).length,
    };
  }, [tasks]);
  const toggle = (key) => setOpen(o => ({ ...o, [key]: !o[key] }));
  const SECTION_KEYS = ['agenda', 'status', 'lists', 'tags', 'personas', 'flows'];
  const allExpanded = SECTION_KEYS.every(k => open[k]);
  const toggleAll = () => {
    const target = !allExpanded;
    setOpen(o => {
      const next = { ...o };
      for (const k of SECTION_KEYS) next[k] = target;
      return next;
    });
  };

  const Section = ({ id, label, icon: Icon, children, borderTop = false, extra }) => (
    <div className={borderTop ? `pt-4 border-t ${TC.borderClass}` : ""}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <button
          onClick={() => toggle(id)}
          className={`flex items-center gap-1.5 flex-1 group`}
        >
          <span className={`text-xs font-semibold uppercase tracking-wider flex-1 text-left flex items-center gap-1 ${TC.textMuted}`}>
            {Icon && <Icon size={12} />}{label}
          </span>
          <ChevronRight
            size={12}
            className={`${TC.textMuted} transition-transform duration-150 ${open[id] ? "rotate-90" : ""}`}
        />
        </button>
        {extra}
      </div>
      {open[id] && children}
    </div>
  );

  const FilterItem = ({ icon: Icon, label, count, filterKey, filterValue }) => {
    const isActive = filters[filterKey] === filterValue;
    return (
      <button onClick={() => setFilter(filterKey, filterValue)}
        className={`w-full flex items-center gap-2 px-3 rounded-md text-sm transition-colors ${settings?.condense ? "py-0.5" : "py-1.5"} ${isActive ? "bg-sky-600/20 text-sky-300" : `${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}`}>
        <Icon size={14} className="flex-shrink-0" />
        <span className="flex-1 text-left truncate">{label}</span>
        <span className="text-xs opacity-60">{count}</span>
      </button>
    );
  };

  const hotkeys = [
    ["Ctrl+N",        t("hk.newTask")],
    ["↑ / ↓",         t("hk.cursor")],
    ["Shift+↑/↓",     t("hk.extend")],
    ["Home / End",    t("hk.homeEnd")],
    ["Ctrl+Shift+A",  t("hk.selectAll")],
    ["Space",         t("hk.complete")],
    ["S",             t("hk.cycle")],
    ["Del",           t("hk.delete")],
    ["1 / 2 / 3 / 4", t("hk.priority")],
    ["Shift+P",       t("hk.postpone")],
    ["Ctrl+Z",        t("hk.undo")],
    ["Ctrl+E",        t("hk.search")],
    ["Ctrl+D",        t("hk.planner")],
    ["Esc",           t("hk.escape")],
  ];

  return (
    <aside data-guide="sidebar" className={`w-56 flex-shrink-0 border-r p-4 flex flex-col overflow-hidden ${TC.aside}`}
           style={{ scrollbarWidth: "thin" }}>
      <div className={`flex-1 ${settings?.condense ? "space-y-2" : "space-y-4"} overflow-y-auto`}>

        <Section id="agenda" label={t("sidebar.agenda")} icon={Calendar} extra={
          <button onClick={(e) => { e.stopPropagation(); toggleAll(); }} className={`ml-auto transition-colors ${TC.textMuted} hover:text-gray-300`}
            title={allExpanded ? t("sidebar.collapseAll") : t("sidebar.expandAll")}>
            {allExpanded ? <ChevronsUp size={14} /> : <ChevronsDown size={14} />}
          </button>
        }>
          <div className="space-y-0.5">
            <FilterItem icon={Calendar}      label={t("agenda.today")}    count={agendaCounts.today}    filterKey="dateRange" filterValue="today" />
            <FilterItem icon={Calendar}      label={t("agenda.tomorrow")} count={agendaCounts.tomorrow} filterKey="dateRange" filterValue="tomorrow" />
            <FilterItem icon={Calendar}      label={t("agenda.week")}     count={agendaCounts.week}     filterKey="dateRange" filterValue="week" />
            <FilterItem icon={Calendar}      label={t("agenda.month")}    count={agendaCounts.month}    filterKey="dateRange" filterValue="month" />
            <FilterItem icon={AlertTriangle} label={t("agenda.overdue")}  count={agendaCounts.overdue}  filterKey="dateRange" filterValue="overdue" />
          </div>
        </Section>

        <Section id="status" label={t("sidebar.status")}>
          <div className="space-y-0.5">
            <button onClick={() => clearFilter("status")}
              className={`w-full flex items-center gap-2 px-3 rounded-md text-sm transition-colors ${settings?.condense ? "py-0.5" : "py-1.5"} ${!filters.status ? "bg-sky-600/20 text-sky-300" : `${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}`}>
              <Filter size={14} /><span className="flex-1 text-left">{t("filter.all")}</span><span className="text-xs opacity-60">{tasks.length}</span>
            </button>
            {STATUSES.map(s => <FilterItem key={s} icon={STATUS_ICONS[s]} label={t("status." + s)} count={statusCounts[s]} filterKey="status" filterValue={s} />)}
          </div>
        </Section>

        <Section id="lists" label={t("sidebar.lists")}>
          <div className="space-y-0.5">{lists.map(([n, c]) => <FilterItem key={n} icon={List} label={n} count={c} filterKey="list" filterValue={n} />)}</div>
        </Section>

        <Section id="tags" label={t("sidebar.tags")}>
          <div className="space-y-0.5">{tags.map(([n, c]) => <FilterItem key={n} icon={Hash} label={n} count={c} filterKey="tag" filterValue={n} />)}</div>
        </Section>

        {personas.length > 0 && (
          <Section id="personas" label={t("sidebar.personas")}>
            <div className="space-y-0.5">{personas.map(([n, c]) => <FilterItem key={n} icon={User} label={n} count={c} filterKey="persona" filterValue={n} />)}</div>
          </Section>
        )}

        {flows.length > 0 && (
          <Section id="flows" label="Task Flows">
            <div className="space-y-1">{flows.map(([n, c]) => {
              const prog = flowProgress[n];
              const pct = prog && prog.total > 0 ? Math.round(prog.done / prog.total * 100) : 0;
              const meta = flowMeta[n];
              const barColor = meta?.color || "#f472b6";
              const isActive = filters.flow === n;
              return (
                <div key={n}>
                  <button onClick={() => setFilter("flow", n)}
                    className={`w-full flex items-center gap-2 px-3 rounded-md text-sm transition-colors ${settings?.condense ? "py-0.5" : "py-1.5"} ${isActive ? "bg-sky-600/20 text-sky-300" : `${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}`}>
                    <Zap size={14} className="flex-shrink-0" style={meta?.color ? { color: meta.color } : {}} />
                    <span className="flex-1 text-left truncate">{n}</span>
                    <span className="text-xs opacity-60">{c}</span>
                  </button>
                  {prog && prog.total > 0 && (
                    <div className="mx-3 mt-0.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.08)" }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                  )}
                </div>
              );
            })}</div>
          </Section>
        )}

        <Section id="hotkeys" label={t("sidebar.hotkeys")} icon={Keyboard} borderTop>
          <div className={`space-y-1.5 text-xs ${TC.textMuted}`}>
            {hotkeys.map(([k, d]) => (
              <div key={k} className="flex items-start gap-2">
                <kbd className={`px-1.5 py-0.5 rounded font-mono whitespace-nowrap flex-shrink-0 ${TC.elevated} ${TC.textSec}`}>{k}</kbd>
                <span>{d}</span>
              </div>
            ))}
          </div>
        </Section>

      </div>

      {/* ── Footer: theme / settings ── */}
      <div className={`py-2 mt-3 border-t flex items-center justify-between gap-1 flex-shrink-0 ${TC.borderClass}`}>
        <div className="flex items-center gap-0.5">
          {themeOptions.map(({ key, Icon }) => (
            <button key={key} onClick={() => setTheme(key)} title={t("footer.theme." + key)}
              className={`p-1.5 rounded transition-colors ${theme === key ? "text-sky-400 bg-sky-400/10" : `${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}`}>
              <Icon size={13} />
            </button>
          ))}
        </div>
        <button onClick={onOpenSettings} title={t("footer.settings")}
          className={`p-1.5 rounded transition-colors ${TC.textMuted} ${TC.hoverBg} hover:text-gray-200`}>
          <Settings size={13} />
        </button>
      </div>

      {/* ── Author ── */}
      <div className={`pt-1 mt-1 border-t flex justify-end ${TC.borderClass}`}>
        <span className={`text-xs ${TC.textMuted} opacity-50 cursor-pointer hover:opacity-80 transition-opacity`}
              title="https://daybov.com/"
              onClick={() => ctxOpenUrl("https://daybov.com/")}>
          …{t("footer.author")}
        </span>
      </div>
    </aside>
  );
}
