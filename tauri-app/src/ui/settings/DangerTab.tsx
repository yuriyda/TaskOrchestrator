/**
 * @file DangerTab.tsx
 * Danger tab for SettingsDialog: Clear All data and Purge Google Drive sync file.
 * Extracted from SettingsDialog to reduce component size.
 */
import { useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import { useApp } from "../AppContext";

interface DangerTabProps {
  gdriveConnected: boolean;
  onClearAll: () => Promise<void>;
  onGdriveCheckSyncFile?: () => Promise<any>;
  onGdrivePurgeSyncFile?: () => Promise<void>;
  onClose: () => void;
}

export function DangerTab({ gdriveConnected, onClearAll, onGdriveCheckSyncFile, onGdrivePurgeSyncFile, onClose }: DangerTabProps) {
  const { t, TC } = useApp();
  const [clearStep, setClearStep] = useState(0);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [purgeStep, setPurgeStep] = useState(0);
  const [purgeConfirmText, setPurgeConfirmText] = useState("");
  const [dangerStatus, setDangerStatus] = useState<string | null>(null);

  return (
    <div>
      <h2 className="text-base font-semibold mb-4 text-red-400">{t("settings.danger.title")}</h2>
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className={`font-medium text-sm mb-1 ${TC.text}`}>{t("settings.danger.clearAll")}</div>
            <div className={`text-xs mb-3 ${TC.textMuted}`}>{t("settings.danger.clearAllDesc")}</div>
            {clearStep === 0 && (
              <button onClick={() => setClearStep(1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-sm transition-colors">
                <Trash2 size={14} />{t("settings.danger.clearBtn")}
              </button>
            )}
            {clearStep === 1 && (
              <div className="space-y-3">
                <div className={`text-sm font-medium ${TC.text}`}>{t("settings.danger.confirm1")}</div>
                <div>
                  <div className={`text-xs mb-1.5 ${TC.textMuted}`}>{t("settings.danger.confirm2")}</div>
                  <input value={clearConfirmText}
                    onChange={e => setClearConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className={`border rounded px-2 py-1.5 text-sm w-40 outline-none focus:border-red-500 ${TC.input} ${TC.inputText}`} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (clearConfirmText === "DELETE") {
                        onClearAll();
                        setClearStep(0);
                        setClearConfirmText("");
                        onClose();
                      }
                    }}
                    disabled={clearConfirmText !== "DELETE"}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${clearConfirmText === "DELETE" ? "bg-red-600 hover:bg-red-500 text-white" : "opacity-40 bg-gray-700 text-gray-400 cursor-not-allowed"}`}>
                    {t("settings.danger.confirmBtn")}
                  </button>
                  <button
                    onClick={() => { setClearStep(0); setClearConfirmText(""); }}
                    className={`px-3 py-1.5 rounded text-sm ${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200 transition-colors`}>
                    {t("settings.danger.cancelBtn")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Purge Google Drive sync file */}
      {onGdrivePurgeSyncFile && gdriveConnected && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 mt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className={`font-medium text-sm mb-1 ${TC.text}`}>{t("settings.danger.purgeDrive")}</div>
              <div className={`text-xs mb-3 ${TC.textMuted}`}>{t("settings.danger.purgeDriveDesc")}</div>
              {purgeStep === 0 && (
                <button onClick={async () => {
                  try {
                    const exists = await onGdriveCheckSyncFile?.();
                    if (!exists) {
                      setDangerStatus(t("settings.danger.purgeDriveEmpty"));
                    } else {
                      setPurgeStep(1);
                      setDangerStatus(null);
                    }
                  } catch (e: any) {
                    setDangerStatus(`${t("sync.gdriveError")}: ${e.message}`);
                  }
                }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-sm transition-colors">
                  <Trash2 size={14} />{t("settings.danger.purgeDriveBtn")}
                </button>
              )}
              {purgeStep === 1 && (
                <div className="space-y-3">
                  <div className={`text-sm font-medium ${TC.text}`}>{t("settings.danger.confirm1")}</div>
                  <div>
                    <div className={`text-xs mb-1.5 ${TC.textMuted}`}>{t("settings.danger.confirm2")}</div>
                    <input value={purgeConfirmText}
                      onChange={e => setPurgeConfirmText(e.target.value)}
                      placeholder="DELETE"
                      className={`border rounded px-2 py-1.5 text-sm w-40 outline-none focus:border-red-500 ${TC.input} ${TC.inputText}`} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (purgeConfirmText === "DELETE") {
                          try {
                            await onGdrivePurgeSyncFile();
                            setDangerStatus(t("settings.danger.purgeDriveDone"));
                          } catch (e: any) {
                            setDangerStatus(`${t("sync.gdriveError")}: ${e.message}`);
                          }
                          setPurgeStep(0);
                          setPurgeConfirmText("");
                        }
                      }}
                      disabled={purgeConfirmText !== "DELETE"}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${purgeConfirmText === "DELETE" ? "bg-red-600 hover:bg-red-500 text-white" : "opacity-40 bg-gray-700 text-gray-400 cursor-not-allowed"}`}>
                      {t("settings.danger.confirmBtn")}
                    </button>
                    <button
                      onClick={() => { setPurgeStep(0); setPurgeConfirmText(""); }}
                      className={`px-3 py-1.5 rounded text-sm ${TC.elevated} ${TC.textSec} ${TC.hoverBg} hover:text-gray-200 transition-colors`}>
                      {t("settings.danger.cancelBtn")}
                    </button>
                  </div>
                </div>
              )}
              {dangerStatus && (
                <div className={`text-xs mt-3 px-3 py-2 rounded-md ${TC.surface} ${TC.textMuted}`}>{dangerStatus}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
