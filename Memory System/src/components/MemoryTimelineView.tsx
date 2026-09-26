import { CircleDot, Flag, GitCommitHorizontal, ListTodo, MessageSquareText } from "lucide-react";
import { useMemo } from "react";
import type { MemoryTimeline, MemoryTimelineEntry } from "../types";

interface Props {
  timeline: MemoryTimeline | null;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}

const trackMeta = {
  events: { label: "事件", icon: MessageSquareText },
  topics: { label: "主题", icon: Flag },
  claims: { label: "事实变化", icon: GitCommitHorizontal },
  open_loops: { label: "未完成", icon: ListTodo },
  changes: { label: "用户治理", icon: CircleDot },
};

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
}

function entryStyle(entry: MemoryTimelineEntry, min: number, max: number) {
  const span = Math.max(1, max - min);
  const start = new Date(entry.start).getTime();
  const end = entry.end ? new Date(entry.end).getTime() : start;
  return {
    left: `${Math.max(0, Math.min(99, ((start - min) / span) * 100))}%`,
    width: entry.end ? `${Math.max(1.2, ((Math.max(start, end) - start) / span) * 100)}%` : "9px",
  };
}

export function MemoryTimelineView({ timeline, selectedId, onSelect }: Props) {
  const range = useMemo(() => {
    if (!timeline?.entries.length) return { min: Date.now() - 86400000, max: Date.now() };
    const values = timeline.entries.flatMap((entry) => [entry.start, entry.end].filter(Boolean))
      .map((value) => new Date(String(value)).getTime()).filter(Number.isFinite);
    return { min: Math.min(...values), max: Math.max(Date.now(), ...values) };
  }, [timeline]);
  const ticks = useMemo(() => Array.from({ length: 6 }, (_, index) => (
    range.min + ((range.max - range.min) * index) / 5
  )), [range]);

  if (!timeline?.entries.length) return <div className="memory-empty">还没有足够的时间数据。</div>;

  return (
    <div className="memory-timeline">
      <div className="timeline-axis">
        <span />
        <div>{ticks.map((tick) => <time key={tick}>{dateLabel(new Date(tick).toISOString())}</time>)}</div>
      </div>
      {(Object.keys(trackMeta) as Array<keyof typeof trackMeta>).map((track) => {
        const meta = trackMeta[track];
        const Icon = meta.icon;
        const entries = timeline.entries.filter((entry) => entry.track === track);
        return (
          <section className="timeline-track" key={track}>
            <header><Icon size={15} /><span>{meta.label}</span><b>{entries.length}</b></header>
            <div className="timeline-lane">
              {ticks.map((tick) => (
                <i key={tick} style={{ left: `${((tick - range.min) / Math.max(1, range.max - range.min)) * 100}%` }} />
              ))}
              {entries.map((entry, index) => (
                <button
                  key={entry.id}
                  className={`timeline-entry type-${entry.type} status-${entry.status || "unknown"} ${selectedId === entry.id ? "selected" : ""}`}
                  style={{ ...entryStyle(entry, range.min, range.max), top: `${8 + (index % 4) * 25}px` }}
                  title={`${entry.label}\n${dateLabel(entry.start)}${entry.end ? ` - ${dateLabel(entry.end)}` : ""}`}
                  onClick={() => onSelect(entry.id)}
                >
                  <span>{entry.label}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
