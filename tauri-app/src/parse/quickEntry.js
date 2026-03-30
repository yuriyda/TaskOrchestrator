/**
 * Quick-entry parser: converts shorthand tokens (@list, #tag, !priority, ^date, ~dep, *rec, >>flow, /persona)
 * into structured task data. Also provides autocomplete suggestions and chip rendering styles.
 */
import { parseDateInput } from '../core/date.js'

export const CHIP_STYLE = {
  text:       { background: "transparent",           color: "#f3f4f6", border: "none",                             padding: "2px 0"    },
  list:       { background: "rgba(52,211,153,.18)",  color: "#34d399", border: "1px solid rgba(52,211,153,.45)",  padding: "2px 8px", borderRadius: 12 },
  tag:        { background: "rgba(56,189,248,.18)",  color: "#38bdf8", border: "1px solid rgba(56,189,248,.45)",  padding: "2px 8px", borderRadius: 12 },
  priority:   { background: "rgba(251,146,60,.18)",  color: "#fb923c", border: "1px solid rgba(251,146,60,.45)",  padding: "2px 8px", borderRadius: 12 },
  due:        { background: "rgba(192,132,252,.18)", color: "#c084fc", border: "1px solid rgba(192,132,252,.45)", padding: "2px 8px", borderRadius: 12 },
  flow:       { background: "rgba(244,114,182,.18)", color: "#f472b6", border: "1px solid rgba(244,114,182,.45)", padding: "2px 8px", borderRadius: 12 },
  depends:    { background: "rgba(250,204,21,.18)",  color: "#facc15", border: "1px solid rgba(250,204,21,.45)",  padding: "2px 8px", borderRadius: 12 },
  recurrence: { background: "rgba(45,212,191,.18)",  color: "#2dd4bf", border: "1px solid rgba(45,212,191,.45)",  padding: "2px 8px", borderRadius: 12 },
  persona:    { background: "rgba(129,140,248,.18)", color: "#818cf8", border: "1px solid rgba(129,140,248,.45)", padding: "2px 8px", borderRadius: 12 },
};

export function parseShorthand(input) {
  const result = { title: "", list: null, tags: [], personas: [], priority: null, due: null, recurrence: null, flowId: null, dependsOn: null, tokens: [] };
  const titleParts = [];
  for (const p of input.split(/\s+/).filter(Boolean)) {
    if      (p.startsWith(">>"))      { result.flowId = p.slice(2);           result.tokens.push({ type: "flow",       value: p }); }
    else if (p.startsWith("@"))       { result.list = p.slice(1);             result.tokens.push({ type: "list",       value: p }); }
    else if (p.startsWith("#"))       { result.tags.push(p.slice(1));         result.tokens.push({ type: "tag",        value: p }); }
    else if (/^![1-4]$/.test(p))     { result.priority = parseInt(p[1]);     result.tokens.push({ type: "priority",   value: p }); }
    else if (p.startsWith("^"))       { const pd = parseDateInput(p.slice(1)); if (pd) { result.due = pd; result.tokens.push({ type: "due", value: p }); } else { titleParts.push(p); result.tokens.push({ type: "text", value: p }); } }
    else if (p.startsWith("~"))       { result.dependsOn = p.slice(1);        result.tokens.push({ type: "depends",    value: p }); }
    else if (p.startsWith("*"))       { result.recurrence = p.slice(1);       result.tokens.push({ type: "recurrence", value: p }); }
    else if (p.startsWith("/")  && p.length > 1) { result.personas.push(p.slice(1)); result.tokens.push({ type: "persona", value: p }); }
    else                              { titleParts.push(p);                   result.tokens.push({ type: "text",       value: p }); }
  }
  result.title = titleParts.join(" ");
  return result;
}

export function getSuggestions(input, { lists = [], tags = [], flows = [], personas = [], priorityLabels = {}, hasListChip = false } = {}) {
  const words = input.split(/\s+/);
  const last = words[words.length - 1] || "";
  if (!last) return [];
  if (last.startsWith(">>")) { const q = last.slice(2).toLowerCase(); return flows.filter(f => f.toLowerCase().includes(q)).map(f => ({ type: "flow",       label: `>>${f}`, replace: `>>${f}` })); }
  if (last.startsWith("@"))  { if (hasListChip) return []; const q = last.slice(1).toLowerCase(); return lists.filter(l => l.toLowerCase().includes(q)).map(l => ({ type: "list", label: `@${l}`, replace: `@${l}` })); }
  if (last.startsWith("#"))  { const q = last.slice(1).toLowerCase(); return tags.filter(t  => t.toLowerCase().includes(q)).map(t => ({ type: "tag",        label: `#${t}`,  replace: `#${t}` })); }
  if (last.startsWith("/")  && personas.length > 0) { const q = last.slice(1).toLowerCase(); return personas.filter(p => p.toLowerCase().includes(q)).map(p => ({ type: "persona", label: `/${p}`, replace: `/${p}` })); }
  if (last.startsWith("!"))  return ["!1","!2","!3","!4"].filter(s => s.startsWith(last)).map(s => ({ type: "priority", label: s, replace: s, desc: priorityLabels[s[1]] }));
  if (last.startsWith("^"))  return ["^today","^tomorrow","^mon","^tue","^fri"].filter(s => s.startsWith(last)).map(s => ({ type: "due",        label: s, replace: s }));
  if (last.startsWith("*"))  return ["*daily","*weekly","*monthly"].filter(s => s.startsWith(last)).map(s => ({ type: "recurrence", label: s, replace: s }));
  return [];
}

// Returns the token type for a single word, or null if it's plain text.
export function getTokenType(word) {
  if (!word) return null;
  if (word.startsWith(">>") && word.length > 2) return "flow";
  if (word.startsWith("@")  && word.length > 1) return "list";
  if (word.startsWith("#")  && word.length > 1) return "tag";
  if (/^![1-4]$/.test(word))                   return "priority";
  if (word.startsWith("^")  && word.length > 1) return "due";
  if (word.startsWith("~")  && word.length > 1) return "depends";
  if (word.startsWith("*")  && word.length > 1) return "recurrence";
  if (word.startsWith("/")  && word.length > 1) return "persona";
  return null;
}

// Tries to commit the last word of `text` as a token.
// Returns { tokenType, raw, newText } or null.
export function tryCommitToken(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const last = words[words.length - 1];
  const tokenType = getTokenType(last);
  if (!tokenType) return null;
  return { tokenType, raw: last, newText: words.slice(0, -1).join(" ") };
}

// Extracts parsed task data from an array of committed chip objects.
export function buildFromChips(chips) {
  const r = { list: null, tags: [], personas: [], priority: null, due: null, recurrence: null, flowId: null, dependsOn: null };
  for (const c of chips) {
    switch (c.type) {
      case "list":       r.list       = c.raw.slice(1);  break;
      case "tag":        r.tags.push(c.raw.slice(1));    break;
      case "persona":    r.personas.push(c.raw.slice(1)); break;
      case "priority":   r.priority   = parseInt(c.raw[1]); break;
      case "due":        r.due        = parseDateInput(c.raw.slice(1)) || null;  break;
      case "recurrence": r.recurrence = c.raw.slice(1);  break;
      case "flow":       r.flowId     = c.raw.slice(2);  break;
      case "depends":    r.dependsOn  = c.raw.slice(1);  break;
    }
  }
  return r;
}
