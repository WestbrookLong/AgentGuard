import {
  CheckCircle2, Clock3, Eye, EyeOff, FileText, GitBranch, MessageSquareQuote,
  Pencil, ShieldAlert, Trash2, X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

interface Props {
  nodeId: string | null;
  detail: Record<string, unknown> | null;
  loading?: boolean;
  onClose: () => void;
  onGovern: (action: "confirm" | "correct" | "hide" | "unhide" | "delete", correctedText?: string) => Promise<void>;
}

function value(record: Record<string, unknown>, key: string) {
  const item = record[key];
  return item === null || item === undefined || item === "" ? null : String(item);
}

function formatDate(input: unknown) {
  if (!input) return "—";
  const date = new Date(String(input));
  return Number.isNaN(date.getTime()) ? String(input) : date.toLocaleString("zh-CN");
}

function basisLabel(basis: string | null) {
  return {
    stated_by_user: "用户明确表达",
    observed_by_agent: "Pet 观察",
    inferred: "Pet 推测",
    mutually_confirmed: "双方确认",
    tool_verified: "工具验证",
    unknown_legacy: "旧数据来源不完整",
  }[basis || ""] || basis || "未标注";
}

export function MemoryDetailPanel({ nodeId, detail, loading, onClose, onGovern }: Props) {
  const [correcting, setCorrecting] = useState(false);
  const [correctedText, setCorrectedText] = useState("");
  const [busy, setBusy] = useState(false);
  const record = (detail?.record || {}) as Record<string, unknown>;
  const type = String(detail?.type || nodeId?.split(":")[0] || "");
  const policy = (detail?.policy || null) as Record<string, unknown> | null;
  const hidden = policy?.surface_policy === "do_not_surface";
  const evidence = useMemo(() => (detail?.evidence || []) as Array<Record<string, unknown>>, [detail]);
  const transitions = useMemo(() => (detail?.transitions || []) as Array<Record<string, unknown>>, [detail]);
  const relations = useMemo(() => (detail?.relations || []) as Array<Record<string, unknown>>, [detail]);
  const retrievals = useMemo(() => (detail?.retrievals || []) as Array<Record<string, unknown>>, [detail]);
  const label = value(record, "canonical_text") || value(record, "title") || value(record, "description")
    || value(record, "content") || value(record, "label") || "记忆详情";

  const run = async (action: "confirm" | "correct" | "hide" | "unhide" | "delete", text?: string) => {
    setBusy(true);
    try {
      await onGovern(action, text);
      setCorrecting(false);
      setCorrectedText("");
    } finally {
      setBusy(false);
    }
  };

  const submitCorrection = (event: FormEvent) => {
    event.preventDefault();
    if (correctedText.trim()) void run("correct", correctedText.trim());
  };

  if (!nodeId) {
    return (
      <aside className="memory-detail-panel empty">
        <div className="memory-empty"><GitBranch size={23} /><span>选择一条记忆查看来源和变化。</span></div>
      </aside>
    );
  }

  return (
    <aside className="memory-detail-panel">
      <header>
        <span className={`memory-type-badge type-${type}`}>{type.replace("_", " ")}</span>
        <button title="关闭详情" onClick={onClose}><X size={17} /></button>
      </header>
      {loading && <div className="memory-loading"><span /><span /><span /></div>}
      {!loading && detail && (
        <div className="memory-detail-scroll">
          <h2>{label}</h2>
          <div className="memory-detail-meta">
            {value(record, "status") && <span className={`status-${value(record, "status")}`}>{value(record, "status")}</span>}
            {value(record, "temporal_state") && <span><Clock3 size={12} />{value(record, "temporal_state")}</span>}
            {value(record, "epistemic_basis") && <span>{basisLabel(value(record, "epistemic_basis"))}</span>}
            {record.confidence !== undefined && <span>{Math.round(Number(record.confidence) * 100)}% 置信</span>}
          </div>

          {value(record, "overview") && <p className="memory-detail-summary">{value(record, "overview")}</p>}
          {value(record, "current_position") && (
            <section className="memory-detail-section">
              <h3>当前位置</h3><p>{value(record, "current_position")}</p>
            </section>
          )}

          {type === "claim" && (
            <div className="memory-governance-actions">
              <button onClick={() => void run("confirm")} disabled={busy}><CheckCircle2 size={15} />确认</button>
              <button onClick={() => setCorrecting(true)} disabled={busy}><Pencil size={15} />纠正</button>
              <button onClick={() => void run(hidden ? "unhide" : "hide")} disabled={busy}>
                {hidden ? <Eye size={15} /> : <EyeOff size={15} />}{hidden ? "恢复" : "隐藏"}
              </button>
              <button className="danger" onClick={() => {
                if (window.confirm("确定删除这条派生记忆吗？原始聊天记录会保留。")) void run("delete");
              }} disabled={busy}><Trash2 size={15} />删除</button>
            </div>
          )}
          {type !== "claim" && ["topic", "topic_item", "open_loop", "event"].includes(type) && (
            <div className="memory-governance-actions">
              <button onClick={() => void run(hidden ? "unhide" : "hide")} disabled={busy}>
                {hidden ? <Eye size={15} /> : <EyeOff size={15} />}{hidden ? "恢复" : "不再主动提起"}
              </button>
            </div>
          )}

          {correcting && (
            <form className="memory-correction-form" onSubmit={submitCorrection}>
              <label>纠正后的记忆</label>
              <textarea autoFocus rows={3} value={correctedText} onChange={(event) => setCorrectedText(event.target.value)} />
              <div>
                <button type="button" onClick={() => setCorrecting(false)}>取消</button>
                <button type="submit" className="primary" disabled={!correctedText.trim() || busy}>应用纠正</button>
              </div>
            </form>
          )}

          <dl className="memory-fact-list">
            {[
              ["事实槽", record.slot_predicate || record.predicate],
              ["认识来源", basisLabel(value(record, "epistemic_basis"))],
              ["生效时间", formatDate(record.valid_from || record.asserted_at || record.created_at)],
              ["结束时间", record.valid_to ? formatDate(record.valid_to) : "仍然有效"],
              ["最近确认", formatDate(record.last_confirmed_at)],
              ["作用域", [record.scope_type, record.scope_id].filter(Boolean).join(" / ")],
            ].filter(([, item]) => item && item !== "—").map(([key, item]) => (
              <div key={String(key)}><dt>{String(key)}</dt><dd>{String(item)}</dd></div>
            ))}
          </dl>

          {evidence.length > 0 && (
            <section className="memory-detail-section">
              <h3><MessageSquareQuote size={14} />证据 <span>{evidence.length}</span></h3>
              <div className="memory-evidence-list">
                {evidence.map((item, index) => (
                  <article key={String(item.id || item.event_id || index)}>
                    <div><span>{String(item.event_type || item.relation || "event")}</span><time>{formatDate(item.occurred_at || item.created_at)}</time></div>
                    <p>{String(item.content || item.message_content || "")}</p>
                    {Boolean(item.message_content) && item.message_content !== item.content && <blockquote>{String(item.message_content)}</blockquote>}
                  </article>
                ))}
              </div>
            </section>
          )}

          {transitions.length > 0 && (
            <section className="memory-detail-section">
              <h3><GitBranch size={14} />变化记录 <span>{transitions.length}</span></h3>
              <div className="memory-transition-list">
                {transitions.map((item) => (
                  <div key={String(item.id)}>
                    <b>{String(item.transition_type)}</b>
                    <p>{[item.from_text, item.to_text].filter(Boolean).map(String).join(" → ")}</p>
                    <time>{formatDate(item.effective_at || item.created_at)}</time>
                  </div>
                ))}
              </div>
            </section>
          )}

          {relations.length > 0 && (
            <section className="memory-detail-section">
              <h3><ShieldAlert size={14} />关系 <span>{relations.length}</span></h3>
              {relations.map((item) => (
                <p className="memory-relation-row" key={String(item.source_claim_id) + String(item.target_claim_id) + String(item.relation)}>
                  <b>{String(item.relation)}</b>{String(item.source_text || "")} → {String(item.target_text || "")}
                </p>
              ))}
            </section>
          )}

          {retrievals.length > 0 && (
            <section className="memory-detail-section">
              <h3><FileText size={14} />提供给回复 <span>{retrievals.length}</span></h3>
              {retrievals.slice(0, 8).map((item) => (
                <div className="memory-retrieval-row" key={String(item.id)}>
                  <span>{String(item.query)}</span><time>{formatDate(item.created_at)}</time>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
