/**
 * @file QuickEntry.jsx
 * Inline task-creation input with tokenised chips and autocomplete suggestions.
 * Recognises shorthand prefixes (@persona, #tag, !priority, /list, ^due, *recurrence,
 * >>dependency) and commits them as visual pills. Remaining text becomes the task title.
 * Autocomplete dropdown appears while typing a recognised prefix and navigates with
 * Arrow keys, Tab, and Enter.
 */
import { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import { useApp } from "./AppContext.jsx";
import {
  parseShorthand,
  getSuggestions,
  getTokenType,
  tryCommitToken,
  buildFromChips,
  CHIP_STYLE,
} from "../parse/quickEntry.js";
import { TokenChip, ChipPill } from "./common.jsx";
import { swapLayout } from "../core/layout.js";

export function QuickEntry({ onAdd }) {
  const { t, TC, lists, tags, flows, personas, settings } = useApp();
  const skipToken = (commit) => !commit || (commit.tokenType === "list" && hasListChip) || (commit.tokenType === "url" && settings?.autoExtractUrl === false);
  // chips  — committed token pills shown inside the input field
  // inputText — the text currently being typed (title + any uncommitted token)
  const [chips,       setChips]       = useState([]);
  const [inputText,   setInputText]   = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSugg, setSelectedSugg] = useState(0);
  const inputRef = useRef(null);

  const hasListChip = chips.some(c => c.type === "list");

  useEffect(() => {
    const priorityLabels = { "1": t("priority.1"), "2": t("priority.2"), "3": t("priority.3"), "4": t("priority.4") };
    setSuggestions(getSuggestions(inputText, { lists, tags, flows, personas, priorityLabels, hasListChip }));
    setSelectedSugg(0);
  }, [inputText, lists, tags, flows, personas, t, hasListChip]);

  // Commit a chip and update inputText accordingly.
  const commitToken = (tokenType, raw, remainingText) => {
    setChips(prev => [...prev, { type: tokenType, raw }]);
    setInputText(remainingText ? remainingText + " " : "");
  };

  // Apply an autocomplete suggestion: replace last word, then try to commit.
  const applySuggestion = (sugg) => {
    const words = inputText.split(/\s+/);
    words[words.length - 1] = sugg.replace;
    const joined = words.join(" ");
    const commit = tryCommitToken(joined);
    if (commit) {
      commitToken(commit.tokenType, commit.raw, commit.newText);
    } else {
      setInputText(joined + " ");
    }
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const handleChange = (e) => {
    const val = e.target.value;
    // When a space is typed and the previous word is a recognisable token → commit it,
    // unless it's a list token and a list chip already exists (only one list allowed).
    if (val.endsWith(" ")) {
      const commit = tryCommitToken(val.trimEnd());
      if (commit && !skipToken(commit)) {
        commitToken(commit.tokenType, commit.raw, commit.newText);
        return;
      }
    }
    setInputText(val);
  };

  const handleKeyDown = (e) => {
    // Backspace on empty text field → pop last chip back to text for editing.
    if (e.key === "Backspace" && inputText === "" && chips.length > 0) {
      e.preventDefault();
      const last = chips[chips.length - 1];
      setChips(prev => prev.slice(0, -1));
      setInputText(last.raw);
      return;
    }
    // Suggestion navigation.
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedSugg(i => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedSugg(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        applySuggestion(suggestions[selectedSugg]);
        return;
      }
      if (e.key === "Enter" && inputText.split(/\s+/).pop()?.match(/^[@#!\/^*]|^>>/) ) {
        e.preventDefault();
        applySuggestion(suggestions[selectedSugg]);
        return;
      }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      document.getElementById(e.shiftKey ? "search-input" : "task-list")?.focus();
      return;
    }
    if (e.key === "Enter") {
      // Try to commit any pending token before submitting.
      // Skip if it's a list token and a list chip already exists.
      let title = inputText.trim();
      let allChips = chips;
      const commit = tryCommitToken(title);
      if (commit && !skipToken(commit)) {
        allChips = [...chips, { type: commit.tokenType, raw: commit.raw }];
        title = commit.newText.trim();
      }
      if (!title) return; // title is required
      e.preventDefault();
      const d = buildFromChips(allChips);
      onAdd({ title, list: d.list || null, tags: d.tags,
              personas: d.personas,
              priority: d.priority || 4, due: d.due, recurrence: d.recurrence,
              flowId: d.flowId, dependsOn: d.dependsOn, url: d.url || null, status: "inbox" });
      setChips([]);
      setInputText("");
    }
    if (e.key === "Escape") setSuggestions([]);
  };

  const removeChip = (idx) => {
    setChips(prev => prev.filter((_, i) => i !== idx));
    inputRef.current?.focus();
  };

  const isEmpty = chips.length === 0 && !inputText;

  return (
    <div data-guide="create-task" className="relative">
      {/* Input row with inline chips */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex flex-wrap items-center gap-1.5 min-h-[44px] border rounded-lg px-4 py-2 cursor-text
          focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 transition-all ${TC.input}`}
      >
        <Plus size={18} className="text-gray-400 flex-shrink-0" />
        {chips.map((chip, idx) => (
          <ChipPill key={idx} chip={chip} onRemove={() => removeChip(idx)} />
        ))}
        <input
          ref={inputRef}
          id="quick-entry"
          autoComplete="off"
          value={inputText}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isEmpty ? t("qe.placeholder") : ""}
          className={`flex-1 min-w-[8rem] bg-transparent outline-none text-sm font-mono ${TC.inputText}`}
        />
      </div>
      {/* Autocomplete dropdown */}
      {suggestions.length > 0 && (
        <div className={`absolute z-50 top-full mt-1 left-0 right-0 border rounded-lg shadow-xl overflow-hidden ${TC.surface} ${TC.borderClass}`}>
          {suggestions.map((s, i) => (
            <button key={s.label} onClick={() => applySuggestion(s)}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${i === selectedSugg ? TC.elevated : TC.hoverBg}`}>
              <TokenChip token={{ type: s.type, value: s.label }} />
              {s.desc && <span className={`text-xs ${TC.textMuted}`}>{s.desc}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
