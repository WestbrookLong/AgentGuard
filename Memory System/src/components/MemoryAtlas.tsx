import {
  Activity, BrainCircuit, CheckCircle2, CircleAlert, Clock3, Database, EyeOff,
  GitBranch, LayoutDashboard, ListTodo, RefreshCw, Search, Share2, ShieldCheck,
  Sparkles, Table2, Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MemoryGraph, MemoryOverview, MemoryTimeline } from "../types";
import { MemoryDetailPanel } from "./MemoryDetailPanel";
import { MemoryGraphCanvas } from "./MemoryGraphCanvas";
import { MemoryTimelineView } from "./MemoryTimelineView";

type View = "overview" | "map" | "timeline" | "review" | "developer";

interface Props {
  initialNodeId?: string | null;
  onOpenData: () => void;
  notify: (message: string, error?: boolean) => void;
  onDashboardRefresh: () => Promise<void>;
}

const views: Array<{ id: View; label: string; icon: typeof Sparkles }> = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "map", label: "关系图", icon: Share2 },
  { id: "timeline", label: "时间线", icon: Clock3 },
  { id: "review", label: "复核", icon: ShieldCheck },
  { id: "developer", label: "开发", icon: Wrench },
];

const categoryLabels: Record<string, string> = {
  facts: "事实",
  preferences: "偏好",
  goals: "目标",
  constraints: "约束",
  habits: "习惯",
};

function text(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (row[key] !== null && row[key] !== undefined && row[key] !== "") return String(row[key]);
  return "";
}

function formatDate(value: unknown, compact = false) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", compact
    ? { month: "short", day: "numeric" }
    : { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function confidence(row: Record<string, unknown>) {
  return Math.round(Number(row.confidence || 0) * 100);
}

export function MemoryAtlas({ initialNodeId, onOpenData, notify, onDashboardRefresh }: Props) {
  const [view, setView] = useState<View>("overview");
  const [overview, setOverview] = useState<MemoryOverview | null>(null);
  const [graph, setGraph] = useState<MemoryGraph | null>(null);
  const [timeline, setTimeline] = useState<MemoryTimeline | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [graphMode, setGraphMode] = useState<"local" | "global">("local");
  const [depth, setDepth] = useState(2);
  const [includeSimilarity, setIncludeSimilarity] = useState(false);
  const [includeRetrieval, setIncludeRetrieval] = useState(false);
  const [search, setSearch] = useState("");
  const [asOf, setAsOf] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const asOfIso = asOf ? new Date(`${asOf}T23:59:59`).toISOString() : null;
  const loadOverview = useCallback(async () => setOverview(await window.pet.getMemoryOverview({ asOf: asOfIso })), [asOfIso]);
  const loadGraph = useCallback(async (focus = selectedId || "identity:user") => {
    setGraph(await window.pet.getMemoryGraph({
      focusId: focus,
      depth,
      mode: graphMode,
      includeSimilarity,
      includeRetrieval,
      asOf: asOfIso,
      limit: graphMode === "global" ? 360 : 240,
    }));
  }, [asOfIso, depth, graphMode, includeRetrieval, includeSimilarity, selectedId]);
  const loadTimeline = useCallback(async () => setTimeline(await window.pet.getMemoryTimeline({
    from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : null,
    to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : null,
  })), [fromDate, toDate]);
  const loadDiagnostics = useCallback(async () => setDiagnostics(await window.pet.getMemoryDiagnostics()), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadOverview(),
        view === "map" ? loadGraph() : Promise.resolve(),
        view === "timeline" ? loadTimeline() : Promise.resolve(),
        view === "developer" ? loadDiagnostics() : Promise.resolve(),
      ]);
      await onDashboardRefresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setLoading(false);
    }
  }, [loadDiagnostics, loadGraph, loadOverview, loadTimeline, notify, onDashboardRefresh, view]);

  useEffect(() => {
    void refresh();
  }, [view, asOf, fromDate, toDate, graphMode, depth, includeSimilarity, includeRetrieval]);

  const selectNode = useCallback(async (nodeId: string, switchToMap = false) => {
    setSelectedId(nodeId);
    setDetailLoading(true);
    if (switchToMap) setView("map");
    try {
      setDetail(await window.pet.getMemoryNodeDetail(nodeId));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialNodeId) return;
    void selectNode(initialNodeId, true);
  }, [initialNodeId, selectNode]);

  useEffect(() => {
    if (view === "map") void loadGraph();
  }, [selectedId]);

  const govern = async (action: "confirm" | "correct" | "hide" | "unhide" | "delete", correctedText?: string) => {
    if (!selectedId) return;
    const [objectType, ...rest] = selectedId.split(":");
    const objectId = rest.join(":");
    try {
      const result = await window.pet.governMemory({ action, objectType, objectId, correctedText });
      notify({
        confirm: "记忆已确认。",
        correct: "纠正已形成新的证据与记忆版本。",
        hide: "这条记忆不会再被主动召回。",
        unhide: "这条记忆已恢复普通召回。",
        delete: "派生记忆已删除，原始聊天仍保留。",
      }[action]);
      if (action === "delete") {
        setSelectedId(null);
        setDetail(null);
      } else {
        const nextId = action === "correct" && (result.result as Record<string, unknown>)?.claimId
          ? `claim:${String((result.result as Record<string, unknown>).claimId)}`
          : selectedId;
        setSelectedId(nextId);
        setDetail(await window.pet.getMemoryNodeDetail(nextId));
      }
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    }
  };

  const searchableNodes = useMemo(() => {
    const claims = Object.values(overview?.groupedClaims || {}).flat().map((row) => ({
      id: `claim:${String(row.id)}`, label: text(row, "canonical_text"), type: "claim",
    }));
    const topics = (overview?.topics || []).map((row) => ({
      id: `topic:${String(row.id)}`, label: text(row, "title"), type: "topic",
    }));
    const loops = (overview?.openLoops || []).map((row) => ({
      id: `open_loop:${String(row.id)}`, label: text(row, "description"), type: "open_loop",
    }));
    if (!search.trim()) return [];
    return [...claims, ...topics, ...loops].filter((item) => item.label.toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  }, [overview, search]);

  const stats = overview?.stats;
  const recentRetrievals = ((diagnostics?.retrieval as Record<string, unknown> | undefined)?.recent || []) as Array<Record<string, unknown>>;
  const recentStages = ((diagnostics?.retrieval as Record<string, unknown> | undefined)?.recentStages || []) as Array<Record<string, unknown>>;
  const neighbors = ((diagnostics?.governance as Record<string, unknown> | undefined)?.neighbors || []) as Array<Record<string, unknown>>;

  return (
    <main className="memory-atlas">
      <header className="memory-atlas-header">
        <div>
          <span className="memory-kicker"><BrainCircuit size={15} />Memory Atlas</span>
          <h1>记忆图景</h1>
        </div>
        <div className="memory-header-actions">
          <label className="memory-asof">
            <Clock3 size={15} />
            <input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} title="查看某一天的记忆状态" />
            {asOf && <button onClick={() => setAsOf("")}>现在</button>}
          </label>
          <button className="secondary-button" onClick={onOpenData}><Table2 size={16} />数据表</button>
          <button className="memory-icon-button" title="刷新" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={17} className={loading ? "spin" : ""} />
          </button>
        </div>
      </header>

      <nav className="memory-view-tabs" aria-label="记忆视图" role="tablist">
        {views.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            <Icon size={16} /><span>{label}</span>
            {id === "review" && stats && stats.disputedClaims + stats.candidateClaims > 0 && <b>{stats.disputedClaims + stats.candidateClaims}</b>}
          </button>
        ))}
      </nav>

      {view === "overview" && (
        <div className={`memory-overview-layout ${selectedId ? "with-detail" : ""}`}>
          <div className="memory-overview-scroll">
            <section className="memory-stat-band">
              <div><strong>{stats?.currentClaims || 0}</strong><span>当前记忆</span></div>
              <div><strong>{stats?.activeTopics || 0}</strong><span>活跃主题</span></div>
              <div><strong>{stats?.openLoops || 0}</strong><span>未完成</span></div>
              <div className={(stats?.disputedClaims || 0) > 0 ? "attention" : ""}><strong>{stats?.disputedClaims || 0}</strong><span>待确认</span></div>
            </section>

            <section className="memory-band">
              <header><h2>关于你</h2><span>{asOf ? formatDate(asOfIso, true) : "当前状态"}</span></header>
              <div className="memory-claim-columns">
                {Object.entries(overview?.groupedClaims || {}).map(([category, rows]) => (
                  <div key={category} className="memory-claim-group">
                    <h3>{categoryLabels[category] || category}<span>{rows.length}</span></h3>
                    {rows.length ? rows.map((row) => (
                      <button key={String(row.id)} onClick={() => void selectNode(`claim:${row.id}`)}>
                        <span className={`memory-status-dot status-${text(row, "status")}`} />
                        <span>{text(row, "canonical_text")}</span>
                        <small>{confidence(row)}%</small>
                      </button>
                    )) : <p className="memory-subtle">暂无</p>}
                  </div>
                ))}
              </div>
            </section>

            <div className="memory-two-column">
              <section className="memory-band">
                <header><h2>正在进行</h2><span>{overview?.topics.length || 0} 个主题</span></header>
                <div className="memory-topic-list">
                  {(overview?.topics || []).slice(0, 7).map((topic) => (
                    <button key={String(topic.id)} onClick={() => void selectNode(`topic:${topic.id}`)}>
                      <div><strong>{text(topic, "title")}</strong><p>{text(topic, "current_position", "overview") || "尚未形成当前位置"}</p></div>
                      <span>{Number(topic.open_loop_count || 0)} 待办</span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="memory-band">
                <header><h2>未完成</h2><span>{overview?.openLoops.length || 0}</span></header>
                <div className="memory-loop-list">
                  {(overview?.openLoops || []).slice(0, 8).map((loop) => (
                    <button key={String(loop.id)} onClick={() => void selectNode(`open_loop:${loop.id}`)}>
                      <ListTodo size={15} />
                      <span>{text(loop, "description")}</span>
                      <small>{text(loop, "topic_title")}</small>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <section className="memory-band">
              <header><h2>记忆活动</h2><span>最近 {overview?.days.length || 0} 天</span></header>
              <div className="memory-heatmap">
                {(overview?.days || []).map((day) => {
                  const count = Number(day.event_count || 0);
                  return <button key={String(day.local_date)} className={`level-${Math.min(4, Math.ceil(count / 3))}`} title={`${day.local_date} · ${count} 个事件`} />;
                })}
              </div>
            </section>
          </div>
          {selectedId && (
            <MemoryDetailPanel nodeId={selectedId} detail={detail} loading={detailLoading}
              onClose={() => { setSelectedId(null); setDetail(null); }} onGovern={govern} />
          )}
        </div>
      )}

      {view === "map" && (
        <div className="memory-map-view">
          <div className="memory-map-toolbar">
            <div className="memory-search-wrap">
              <label><Search size={15} /><input value={search} placeholder="定位记忆或主题" onChange={(event) => setSearch(event.target.value)} /></label>
              {searchableNodes.length > 0 && (
                <div className="memory-search-results">
                  {searchableNodes.map((item) => <button key={item.id} onClick={() => {
                    setSearch("");
                    setGraphMode("local");
                    void selectNode(item.id);
                  }}><span>{item.label}</span><small>{item.type}</small></button>)}
                </div>
              )}
            </div>
            <div className="segmented-control">
              <button className={graphMode === "local" ? "active" : ""} onClick={() => setGraphMode("local")}>局部</button>
              <button className={graphMode === "global" ? "active" : ""} onClick={() => setGraphMode("global")}>全局</button>
            </div>
            {graphMode === "local" && (
              <label className="depth-stepper"><span>深度</span><button onClick={() => setDepth(Math.max(1, depth - 1))}>−</button><b>{depth}</b><button onClick={() => setDepth(Math.min(4, depth + 1))}>+</button></label>
            )}
            <label className="memory-check"><input type="checkbox" checked={includeSimilarity} onChange={(event) => setIncludeSimilarity(event.target.checked)} /><span />语义相似</label>
            <label className="memory-check"><input type="checkbox" checked={includeRetrieval} onChange={(event) => setIncludeRetrieval(event.target.checked)} /><span />回复路径</label>
          </div>
          <div className="memory-map-body">
            <MemoryGraphCanvas graph={graph} selectedId={selectedId} onSelect={(id) => void selectNode(id)} />
            <MemoryDetailPanel nodeId={selectedId} detail={detail} loading={detailLoading}
              onClose={() => { setSelectedId(null); setDetail(null); }} onGovern={govern} />
          </div>
        </div>
      )}

      {view === "timeline" && (
        <div className="memory-timeline-view">
          <div className="memory-timeline-toolbar">
            <label>开始<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
            <label>结束<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
            {(fromDate || toDate) && <button onClick={() => { setFromDate(""); setToDate(""); }}>清除范围</button>}
          </div>
          <div className="memory-timeline-body">
            <MemoryTimelineView timeline={timeline} selectedId={selectedId} onSelect={(id) => void selectNode(id)} />
            <MemoryDetailPanel nodeId={selectedId} detail={detail} loading={detailLoading}
              onClose={() => { setSelectedId(null); setDetail(null); }} onGovern={govern} />
          </div>
        </div>
      )}

      {view === "review" && (
        <div className="memory-review-view">
          <section className="memory-review-queue">
            <header><div><CircleAlert size={17} /><h2>需要复核</h2></div><span>{overview?.reviewQueue.length || 0}</span></header>
            {(overview?.reviewQueue || []).length ? (overview?.reviewQueue || []).map((claim) => (
              <button key={String(claim.id)} className={selectedId === `claim:${claim.id}` ? "active" : ""}
                onClick={() => void selectNode(`claim:${claim.id}`)}>
                <span className={`memory-status-dot status-${text(claim, "status")}`} />
                <div><strong>{text(claim, "canonical_text")}</strong><small>{text(claim, "status")} · {text(claim, "epistemic_basis")}</small></div>
                <span>{confidence(claim)}%</span>
              </button>
            )) : <div className="memory-empty"><CheckCircle2 size={22} /><span>目前没有需要确认的事实。</span></div>}
          </section>
          <section className="memory-change-stream">
            <header><div><GitBranch size={17} /><h2>最近变化</h2></div></header>
            {(overview?.recentChanges || []).map((change) => (
              <button key={String(change.id)} onClick={() => {
                if (change.objectId) void selectNode(`${String(change.objectType)}:${String(change.objectId)}`);
              }}>
                <i className={`kind-${text(change, "kind")}`} />
                <div><strong>{text(change, "action")}</strong><p>{text(change, "text")}</p></div>
                <time>{formatDate(change.createdAt, true)}</time>
              </button>
            ))}
          </section>
          <MemoryDetailPanel nodeId={selectedId} detail={detail} loading={detailLoading}
            onClose={() => { setSelectedId(null); setDetail(null); }} onGovern={govern} />
        </div>
      )}

      {view === "developer" && (
        <div className="memory-developer-view">
          <section className="developer-health-band">
            <div><Activity size={18} /><span>向量索引</span><strong>{String((diagnostics?.embeddings as Record<string, unknown>)?.ready || 0)}</strong><small>ready</small></div>
            <div><Database size={18} /><span>检索</span><strong>{String((diagnostics?.retrieval as Record<string, unknown>)?.total || 0)}</strong><small>runs</small></div>
            <div><CircleAlert size={18} /><span>降级阶段</span><strong>{String((diagnostics?.retrieval as Record<string, unknown>)?.degradedStages || 0)}</strong><small>degraded</small></div>
            <div><EyeOff size={18} /><span>隐藏对象</span><strong>{String((diagnostics?.governance as Record<string, unknown>)?.hiddenObjects || 0)}</strong><small>policy</small></div>
          </section>
          <div className="developer-columns">
            <section className="memory-band">
              <header><h2>最近检索</h2><span>{recentRetrievals.length}</span></header>
              <div className="developer-row-list">
                {recentRetrievals.map((row) => (
                  <button key={String(row.id)} onClick={() => void selectNode(`retrieval:${row.id}`)}>
                    <span>{text(row, "query")}</span><small>{text(row, "mode")} · {formatDate(row.created_at, true)}</small>
                  </button>
                ))}
              </div>
            </section>
            <section className="memory-band">
              <header><h2>检索阶段</h2><span>{recentStages.length}</span></header>
              <div className="developer-stage-list">
                {recentStages.map((row) => (
                  <div key={String(row.id)}><span className={`status-${text(row, "status")}`}>{text(row, "stage")}</span><small>{text(row, "status")} · {row.duration_ms ? `${row.duration_ms} ms` : "—"}</small></div>
                ))}
              </div>
            </section>
            <section className="memory-band developer-neighbors">
              <header><h2>Claim 语义邻居</h2><span>{neighbors.length}</span></header>
              {neighbors.map((row) => (
                <button key={String(row.id)} onClick={() => void selectNode(`claim:${row.claim_a_id}`)}>
                  <span>{text(row, "claim_a_text")}</span><b>{Math.round(Number(row.similarity || 0) * 100)}%</b><span>{text(row, "claim_b_text")}</span>
                  <small>{text(row, "relation", "status")}</small>
                </button>
              ))}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
