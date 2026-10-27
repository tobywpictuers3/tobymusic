import { useEffect, useMemo, useState } from "react";
import { hybridSync, SyncUiState } from "@/lib/hybridSync";
import { Cloud, CloudOff, AlertTriangle, Loader2, Check } from "lucide-react";

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - t) / 1000));

  if (diffSec < 10) return "הרגע";
  if (diffSec < 60) return `לפני ${diffSec} שנ׳`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `לפני ${diffMin} דק׳`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `לפני ${diffHr} ש׳`;
  const diffDay = Math.floor(diffHr / 24);
  return `לפני ${diffDay} ימים`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export default function SyncStatusBadge() {
  const [state, setState] = useState<SyncUiState>(() => hybridSync.getSyncState());
  const [, setTick] = useState(0);

  useEffect(() => {
    return hybridSync.subscribeSyncState(setState);
  }, []);

  // Re-render every 30s to update relative times
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  const view = useMemo(() => {
    // Offline has priority
    if (!state.isOnline) {
      return {
        icon: <CloudOff className="w-4 h-4" />,
        text: state.lastLocalSaveAt
          ? `אופליין — נשמר מקומית ${formatRelative(state.lastLocalSaveAt)}`
          : "אין חיבור לאינטרנט",
        className: "text-yellow-300",
      };
    }

    if (state.isSyncing) {
      return {
        icon: <Loader2 className="w-4 h-4 animate-spin" />,
        text: "שומר לענן…",
        className: "text-blue-300",
      };
    }

    if (state.lastError) {
      return {
        icon: <AlertTriangle className="w-4 h-4" />,
        text: state.lastLocalSaveAt
          ? `סנכרון נכשל — נשמר מקומית ${formatRelative(state.lastLocalSaveAt)}`
          : "סנכרון לענן נכשל",
        className: "text-red-300",
        title: state.lastError,
      };
    }

    if (state.lastCloudSyncAt) {
      return {
        icon: <Check className="w-4 h-4" />,
        text: `אומת בדרופבוקס ${formatRelative(state.lastCloudSyncAt)} (${formatTime(state.lastCloudSyncAt)})`,
        className: "text-green-300",
      };
    }

    if (state.lastLocalSaveAt) {
      return {
        icon: <Cloud className="w-4 h-4" />,
        text: `נשמר מקומית ${formatRelative(state.lastLocalSaveAt)} — ממתין לענן`,
        className: "text-yellow-300",
      };
    }

    return {
      icon: <Cloud className="w-4 h-4" />,
      text: "טרם בוצע סנכרון",
      className: "text-muted-foreground",
    };
  }, [state]);

  return (
    <div
      className={`inline-flex items-center gap-2 text-xs ${view.className}`}
      title={(view as any).title || undefined}
    >
      {view.icon}
      <span>{view.text}</span>
    </div>
  );
}
