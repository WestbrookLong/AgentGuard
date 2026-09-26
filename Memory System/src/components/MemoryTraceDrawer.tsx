import { BrainCircuit, ChevronRight, Clock3, Database, Route, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { MemoryTrace } from "../types";

interface Props {
  messageId: string | null;
  onClose: () => void;
  onOpenNode?: (nodeId: string) => void;
}

function TraceGroup({ title, type, rows, onOpenNode }: {
  title: string;
  type: string;
  rows: Array<Record<string, unknown>>;
  onOpenNode?: (nodeId: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <section className="trace-group">
      <h3>{title}<span>{rows.length}</span></h3>
      <div>
        {rows.map((row) => {
          const label = String(row.canonical_text || row.title || row.description || row.content || row.id);
          return (
            <button key={String(row.id)} onClick={() => onOpenNode?.(`${type}:${row.id}`)}>
              <span>{label}</span>
              <small>{String(row.status || row.temporal_state || row.event_type || "")}</small>
              {onOpenNode && <ChevronRight size={14} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function MemoryTraceDrawer({ messageId, onClose, onOpenNode }: Props) {
  const [trace, setTrace] = useState<MemoryTrace | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!messageId) {
      setTrace(null);
      return;
    }
    setLoading(true);
    window.pet.getMemoryTrace({ messageId })
      .then(setTrace)
      .finally(() => setLoading(false));
  }, [messageId]);

  if (!messageId) return null;
  return (
    <div className="memory-trace-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="memory-trace-drawer" role="dialog" aria-modal="true" aria-label="本次回复的记忆上下文">
        <header>
          <div><BrainCircuit size={19} /><h2>回复记忆</h2></div>
          <button title="关闭" onClick={onClose}><X size={18} /></button>
        </header>
        {loading && <div className="memory-loading"><span /><span /><span /></div>}
        {!loading && !trace && <div className="memory-empty">这条回复没有可用的检索记录。</div>}
        {trace && (
          <div className="memory-trace-content">
            <section className="trace-query">
              <span><Route size={14} />{String(trace.retrieval.route?.intent || "unknown")}</span>
              <h3>{trace.retrieval.query}</h3>
              <div>
                <span><Clock3 size={13} />{new Date(trace.retrieval.created_at).toLocaleString("zh-CN")}</span>
                <span><Database size={13} />{trace.retrieval.score_version}</span>
              </div>
            </section>
            <p className="trace-caveat">{trace.caveat}</p>
            <TraceGroup title="事实记忆" type="claim" rows={trace.claims} onOpenNode={onOpenNode} />
            <TraceGroup title="主题" type="topic" rows={trace.topics} onOpenNode={onOpenNode} />
            <TraceGroup title="未完成事项" type="open_loop" rows={trace.openLoops} onOpenNode={onOpenNode} />
            <TraceGroup title="事件" type="event" rows={trace.events} onOpenNode={onOpenNode} />
            <details className="trace-stages">
              <summary>检索阶段 <span>{trace.stages.length}</span></summary>
              {trace.stages.map((stage) => (
                <div key={String(stage.id)}>
                  <b>{String(stage.stage)}</b>
                  <span>{String(stage.status)} · {String(stage.duration_ms)} ms</span>
                </div>
              ))}
            </details>
          </div>
        )}
      </aside>
    </div>
  );
}
