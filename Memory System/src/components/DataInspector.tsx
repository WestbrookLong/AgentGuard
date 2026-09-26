import { CheckCircle2, Database, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dashboard } from "../types";

type InspectorKind = "history" | "memory" | "logs";

interface Props {
  kind: InspectorKind;
  dashboard: Dashboard;
  onDashboard: (dashboard: Dashboard) => void;
  notify: (message: string) => void;
}

const tabs: Record<InspectorKind, Array<{ id: string; label: string }>> = {
  history: [
    { id: "messages", label: "消息" },
    { id: "sessions", label: "会话" },
    { id: "retrievals", label: "检索" },
    { id: "retrieval_stages", label: "检索阶段" },
    { id: "snapshots", label: "上下文快照" },
  ],
  memory: [
    { id: "memories", label: "记忆" },
    { id: "events", label: "事件" },
    { id: "topics", label: "主题" },
    { id: "topic_items", label: "讨论演化" },
    { id: "open_loops", label: "开放循环" },
    { id: "days", label: "每日摘要" },
    { id: "extractions", label: "智能提取" },
    { id: "claim_relations", label: "记忆关系" },
    { id: "claim_slots", label: "事实槽位" },
    { id: "claim_transitions", label: "事实变动线" },
    { id: "state_documents", label: "持续状态" },
    { id: "state_revisions", label: "状态修订" },
    { id: "topic_aliases", label: "主题别名" },
    { id: "topic_merge_candidates", label: "合并候选" },
    { id: "claim_neighbor_candidates", label: "Claim 邻居" },
    { id: "memory_governance_actions", label: "用户治理" },
  ],
  logs: [
    { id: "logs", label: "运行日志" },
    { id: "agent_tasks", label: "Agent 任务" },
    { id: "agent_runs", label: "Agent 运行" },
    { id: "tool_executions", label: "工具调用" },
    { id: "approval_requests", label: "审批请求" },
    { id: "capability_grants", label: "能力授权" },
    { id: "policy_decisions", label: "策略决策" },
    { id: "compactions", label: "压缩运行" },
    { id: "continuity_runs", label: "连续性更新" },
    { id: "topic_health", label: "主题健康" },
    { id: "topic_rebuilds", label: "主题重建" },
    { id: "continuity_feedback", label: "连续性反馈" },
    { id: "continuity_evals", label: "评分评测" },
    { id: "continuity_profiles", label: "评分 Profile" },
    { id: "embedding_profiles", label: "Embedding Profile" },
    { id: "embeddings", label: "向量索引" },
    { id: "embedding_jobs", label: "索引任务" },
    { id: "memory_object_policies", label: "记忆策略" },
    { id: "retrieval_profiles", label: "检索 Profile" },
    { id: "reranker_profiles", label: "重排 Profile" },
  ],
};

const columns: Record<string, Array<{ key: string; label: string; width?: string }>> = {
  messages: [
    { key: "role", label: "角色", width: "70px" },
    { key: "content", label: "内容" },
    { key: "modality", label: "来源", width: "80px" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  sessions: [
    { key: "title", label: "会话" },
    { key: "message_count", label: "消息", width: "70px" },
    { key: "started_at", label: "开始时间", width: "170px" },
  ],
  retrievals: [
    { key: "query", label: "查询" },
    { key: "mode", label: "模式", width: "80px" },
    { key: "candidate_count", label: "候选", width: "70px" },
    { key: "token_estimate", label: "Tokens", width: "80px" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  retrieval_stages: [
    { key: "stage", label: "阶段", width: "130px" },
    { key: "status", label: "状态", width: "90px" },
    { key: "query", label: "查询" },
    { key: "input_count", label: "输入", width: "70px" },
    { key: "output_count", label: "输出", width: "70px" },
    { key: "duration_ms", label: "耗时 ms", width: "90px" },
  ],
  snapshots: [
    { key: "summary_text", label: "会话摘要" },
    { key: "source_token_count", label: "原 Tokens", width: "90px" },
    { key: "summary_token_count", label: "摘要 Tokens", width: "100px" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  memories: [
    { key: "status", label: "状态", width: "90px" },
    { key: "temporal_state", label: "时态", width: "90px" },
    { key: "canonical_text", label: "记忆" },
    { key: "valid_from", label: "生效时间", width: "150px" },
    { key: "scope_id", label: "作用域", width: "90px" },
    { key: "confidence", label: "置信度", width: "80px" },
    { key: "epistemic_basis", label: "认识来源", width: "130px" },
    { key: "evidence_count", label: "证据", width: "70px" },
  ],
  events: [
    { key: "event_type", label: "类型", width: "130px" },
    { key: "content", label: "事件" },
    { key: "activity_id", label: "活动", width: "80px" },
    { key: "local_date", label: "日期", width: "110px" },
  ],
  days: [
    { key: "local_date", label: "日期", width: "120px" },
    { key: "state", label: "状态", width: "90px" },
    { key: "summary", label: "摘要" },
    { key: "version", label: "版本", width: "70px" },
  ],
  topics: [
    { key: "status", label: "状态", width: "90px" },
    { key: "title", label: "主题", width: "180px" },
    { key: "current_position", label: "当前位置" },
    { key: "item_count", label: "演化", width: "70px" },
    { key: "open_loop_count", label: "未完成", width: "70px" },
    { key: "last_active_at", label: "最近活跃", width: "150px" },
  ],
  topic_items: [
    { key: "item_type", label: "类型", width: "140px" },
    { key: "content", label: "内容" },
    { key: "status", label: "状态", width: "90px" },
    { key: "epistemic_basis", label: "认识来源", width: "130px" },
    { key: "confidence", label: "置信度", width: "80px" },
    { key: "topic_title", label: "主题", width: "160px" },
  ],
  open_loops: [
    { key: "status", label: "状态", width: "90px" },
    { key: "description", label: "未完成事项" },
    { key: "loop_type", label: "类型", width: "100px" },
    { key: "owner", label: "责任方", width: "90px" },
    { key: "priority", label: "优先级", width: "75px" },
    { key: "topic_title", label: "主题", width: "150px" },
  ],
  extractions: [
    { key: "trigger_type", label: "触发", width: "100px" },
    { key: "status", label: "状态", width: "90px" },
    { key: "event_count", label: "事件", width: "70px" },
    { key: "claim_count", label: "Claims", width: "70px" },
    { key: "started_at", label: "时间", width: "150px" },
  ],
  claim_relations: [
    { key: "relation", label: "关系", width: "110px" },
    { key: "source_claim_id", label: "新 Claim" },
    { key: "target_claim_id", label: "关联 Claim" },
    { key: "confidence", label: "置信度", width: "80px" },
  ],
  claim_slots: [
    { key: "predicate", label: "事实槽位" },
    { key: "subject", label: "主体", width: "120px" },
    { key: "cardinality", label: "基数", width: "80px" },
    { key: "temporal_mode", label: "时间模式", width: "120px" },
    { key: "claim_count", label: "断言", width: "70px" },
    { key: "current_count", label: "当前", width: "70px" },
  ],
  claim_transitions: [
    { key: "transition_type", label: "变动类型", width: "130px" },
    { key: "from_text", label: "原事实" },
    { key: "to_text", label: "新事实" },
    { key: "effective_at", label: "生效时间", width: "150px" },
    { key: "temporal_basis", label: "时间依据", width: "140px" },
  ],
  logs: [
    { key: "level", label: "级别", width: "80px" },
    { key: "category", label: "模块", width: "100px" },
    { key: "message", label: "消息" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  agent_tasks: [
    { key: "status", label: "状态", width: "90px" },
    { key: "objective", label: "任务" },
    { key: "created_at", label: "创建时间", width: "150px" },
  ],
  agent_runs: [
    { key: "status", label: "状态", width: "90px" },
    { key: "objective", label: "任务" },
    { key: "step_count", label: "步骤", width: "70px" },
    { key: "stop_reason", label: "停止原因", width: "110px" },
    { key: "started_at", label: "开始时间", width: "150px" },
  ],
  tool_executions: [
    { key: "status", label: "状态", width: "90px" },
    { key: "tool_name", label: "工具", width: "150px" },
    { key: "arguments_json", label: "参数" },
    { key: "duration_ms", label: "耗时 ms", width: "90px" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  approval_requests: [
    { key: "status", label: "状态", width: "90px" },
    { key: "operation", label: "操作", width: "110px" },
    { key: "tool_name", label: "工具", width: "150px" },
    { key: "requested_path", label: "目标" },
    { key: "risk", label: "风险", width: "80px" },
    { key: "requested_at", label: "时间", width: "150px" },
  ],
  capability_grants: [
    { key: "status", label: "状态", width: "90px" },
    { key: "root_path", label: "授权目录" },
    { key: "operations_json", label: "能力", width: "120px" },
    { key: "scope", label: "范围", width: "100px" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  policy_decisions: [
    { key: "decision", label: "决策", width: "100px" },
    { key: "approval_id", label: "审批 ID" },
    { key: "detail_json", label: "详情" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  compactions: [
    { key: "trigger_type", label: "触发", width: "110px" },
    { key: "status", label: "状态", width: "90px" },
    { key: "input_tokens", label: "输入 Tokens", width: "100px" },
    { key: "output_tokens", label: "输出 Tokens", width: "100px" },
    { key: "started_at", label: "时间", width: "150px" },
  ],
  continuity_runs: [
    { key: "trigger_type", label: "触发", width: "150px" },
    { key: "status", label: "状态", width: "90px" },
    { key: "applied_ops_json", label: "应用操作" },
    { key: "model_version", label: "模型", width: "130px" },
    { key: "started_at", label: "时间", width: "150px" },
  ],
  state_documents: [
    { key: "state_type", label: "状态对象", width: "140px" },
    { key: "current_state_json", label: "当前状态" },
    { key: "version", label: "版本", width: "70px" },
    { key: "updated_at", label: "更新时间", width: "150px" },
  ],
  state_revisions: [
    { key: "state_type", label: "状态对象", width: "130px" },
    { key: "base_version", label: "原版本", width: "75px" },
    { key: "result_version", label: "新版本", width: "75px" },
    { key: "operations_json", label: "操作与证据" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  topic_aliases: [
    { key: "alias", label: "别名" },
    { key: "topic_title", label: "Canonical 主题" },
    { key: "source_run_id", label: "来源 Run", width: "180px" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  topic_health: [
    { key: "recommendation", label: "建议", width: "150px" },
    { key: "topic_title", label: "主题", width: "180px" },
    { key: "trigger_type", label: "触发", width: "130px" },
    { key: "findings_json", label: "发现" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  topic_rebuilds: [
    { key: "status", label: "状态", width: "90px" },
    { key: "topic_title", label: "主题", width: "180px" },
    { key: "base_version", label: "原版本", width: "75px" },
    { key: "result_version", label: "新版本", width: "75px" },
    { key: "applied_json", label: "应用结果" },
    { key: "started_at", label: "时间", width: "150px" },
  ],
  topic_merge_candidates: [
    { key: "status", label: "状态", width: "110px" },
    { key: "topic_a_title", label: "主题 A" },
    { key: "topic_b_title", label: "主题 B" },
    { key: "decision", label: "模型判断", width: "150px" },
    { key: "model_confidence", label: "置信度", width: "80px" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  claim_neighbor_candidates: [
    { key: "status", label: "状态", width: "110px" },
    { key: "claim_a_text", label: "Claim A" },
    { key: "claim_b_text", label: "Claim B" },
    { key: "similarity", label: "相似度", width: "80px" },
    { key: "relation", label: "判定", width: "140px" },
    { key: "model_confidence", label: "置信度", width: "80px" },
  ],
  continuity_feedback: [
    { key: "feedback_type", label: "反馈", width: "170px" },
    { key: "retrieval_query", label: "原查询" },
    { key: "source", label: "来源", width: "130px" },
    { key: "strength", label: "强度", width: "80px" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  continuity_evals: [
    { key: "dataset_version", label: "数据集", width: "160px" },
    { key: "baseline_profile_id", label: "Baseline", width: "180px" },
    { key: "recommendation_json", label: "建议" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  continuity_profiles: [
    { key: "status", label: "状态", width: "100px" },
    { key: "id", label: "Profile" },
    { key: "is_active", label: "Active", width: "70px" },
    { key: "is_challenger", label: "Shadow", width: "70px" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  embedding_profiles: [
    { key: "status", label: "状态", width: "90px" },
    { key: "model", label: "模型" },
    { key: "dimension", label: "维度", width: "80px" },
    { key: "document_schema_version", label: "文档 Schema", width: "180px" },
  ],
  embeddings: [
    { key: "status", label: "状态", width: "90px" },
    { key: "object_type", label: "类型", width: "100px" },
    { key: "document_preview", label: "记忆文档" },
    { key: "dimension", label: "维度", width: "70px" },
    { key: "updated_at", label: "更新时间", width: "150px" },
  ],
  embedding_jobs: [
    { key: "status", label: "状态", width: "90px" },
    { key: "object_type", label: "类型", width: "100px" },
    { key: "object_id", label: "对象" },
    { key: "attempts", label: "尝试", width: "70px" },
    { key: "error", label: "错误" },
  ],
  memory_object_policies: [
    { key: "object_type", label: "类型", width: "100px" },
    { key: "object_id", label: "对象" },
    { key: "surface_policy", label: "注入策略", width: "120px" },
    { key: "embedding_policy", label: "向量策略", width: "120px" },
    { key: "reason", label: "原因" },
  ],
  memory_governance_actions: [
    { key: "action", label: "操作", width: "100px" },
    { key: "object_type", label: "对象类型", width: "100px" },
    { key: "object_id", label: "对象 ID" },
    { key: "reason", label: "原因" },
    { key: "created_at", label: "时间", width: "150px" },
  ],
  retrieval_profiles: [
    { key: "status", label: "状态", width: "90px" },
    { key: "id", label: "Profile" },
    { key: "version", label: "检索版本", width: "160px" },
    { key: "config_json", label: "参数" },
  ],
  reranker_profiles: [
    { key: "status", label: "状态", width: "90px" },
    { key: "id", label: "Profile" },
    { key: "model", label: "模型", width: "160px" },
    { key: "config_json", label: "参数" },
  ],
};

function displayValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (key.endsWith("_at")) return new Date(String(value)).toLocaleString("zh-CN");
  if (["confidence", "importance", "stability"].includes(key)) return Number(value).toFixed(2);
  return String(value);
}

export function DataInspector({ kind, dashboard, onDashboard, notify }: Props) {
  const availableTabs = tabs[kind];
  const [active, setActive] = useState(availableTabs[0].id);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setActive(availableTabs[0].id);
  }, [kind]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.pet.getRecords({ type: active, search, limit: 250 });
      setRows(data);
      setSelected((current) => current && data.find((row) => row.id === current.id) || data[0] || null);
    } finally {
      setLoading(false);
    }
  }, [active, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 120);
    return () => window.clearTimeout(timer);
  }, [load]);

  const title = kind === "history" ? "数据记录" : kind === "memory" ? "记忆系统" : "运行日志";
  const activeColumns = useMemo(() => columns[active] || [], [active]);
  const canStageProfile = active === "continuity_profiles" && selected
    && ["candidate", "approved"].includes(String(selected.status))
    && Number(selected.is_active) !== 1 && Number(selected.is_challenger) !== 1;
  const canPromoteProfile = active === "continuity_profiles" && selected && Number(selected.is_challenger) === 1;

  const consolidate = async () => {
    setLoading(true);
    try {
      const result = await window.pet.consolidate();
      const skipped = Boolean(result.skipped);
      notify(skipped ? "今天的记忆已经是最新状态。" : "今天的记忆整理完成。");
      onDashboard(await window.pet.getDashboard());
      await load();
    } finally {
      setLoading(false);
    }
  };

  const scanTopics = async () => {
    setLoading(true);
    try {
      const result = await window.pet.scanTopics();
      notify(`主题扫描完成，新增 ${result.candidateIds.length} 个候选。`);
      onDashboard(await window.pet.getDashboard());
      if (active === "topic_merge_candidates") await load();
    } finally {
      setLoading(false);
    }
  };

  const scanClaimNeighbors = async () => {
    setLoading(true);
    try {
      const result = await window.pet.scanClaimNeighbors();
      notify(`Claim 邻居扫描完成，新增 ${result.candidateIds.length} 个候选。`);
      onDashboard(await window.pet.getDashboard());
      if (active === "claim_neighbor_candidates") await load();
    } finally {
      setLoading(false);
    }
  };

  const evaluateContinuity = async () => {
    setLoading(true);
    try {
      const result = await window.pet.evaluateContinuity();
      notify(result.recommendation.action === "keep_baseline" ? "评测完成，继续使用当前 Profile。" : "评测完成，已生成待复核 Challenger。" );
      onDashboard(await window.pet.getDashboard());
      await load();
    } finally {
      setLoading(false);
    }
  };

  const profileAction = async (action: "stage" | "promote") => {
    if (!selected?.id) return;
    setLoading(true);
    try {
      const result = await window.pet.continuityProfileAction({ action, profileId: String(selected.id) });
      notify(result.applied ? (action === "stage" ? "Challenger 已进入 Shadow。" : "Profile 已设为 Active。") : `操作未应用：${result.reason || "校验未通过"}`);
      await load();
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="inspector-page">
      <header className="inspector-header">
        <div>
          <h1>{title}</h1>
          <span className="database-path"><Database size={13} /> {dashboard.databasePath}</span>
        </div>
        {kind === "memory" && (
          <div className="inspector-actions">
            <button className="secondary-button" onClick={scanClaimNeighbors} disabled={loading}>
              <Search size={17} />
              扫描 Claim
            </button>
            <button className="secondary-button" onClick={scanTopics} disabled={loading}>
              <Search size={17} />
              扫描主题
            </button>
            <button className="command-button" onClick={consolidate} disabled={loading}>
              <RefreshCw size={17} className={loading ? "spin" : ""} />
              立即整理
            </button>
          </div>
        )}
        {kind === "logs" && active === "continuity_evals" && (
          <button className="command-button" onClick={evaluateContinuity} disabled={loading}>
            <RefreshCw size={17} className={loading ? "spin" : ""} />
            运行评测
          </button>
        )}
        {kind === "logs" && (canStageProfile || canPromoteProfile) && (
          <div className="inspector-actions">
            {canStageProfile && <button className="secondary-button" onClick={() => profileAction("stage")} disabled={loading}>设为 Shadow</button>}
            {canPromoteProfile && <button className="command-button" onClick={() => profileAction("promote")} disabled={loading}>设为 Active</button>}
          </div>
        )}
      </header>

      <div className="inspector-toolbar">
        <div className="tabs" role="tablist">
          {availableTabs.map((tab) => (
            <button key={tab.id} className={active === tab.id ? "active" : ""} onClick={() => setActive(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={16} />
          <input value={search} placeholder="搜索" onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>

      <div className="inspector-content">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {activeColumns.map((column) => <th key={column.key} style={{ width: column.width }}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={String(row.id || index)}
                  className={selected?.id === row.id ? "selected" : ""}
                  onClick={() => setSelected(row)}
                >
                  {activeColumns.map((column) => (
                    <td key={column.key} title={displayValue(column.key, row[column.key])}>
                      {column.key === "status" && <span className={`status-mark status-${row[column.key]}`} />}
                      {displayValue(column.key, row[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !rows.length && <div className="empty-state"><CheckCircle2 size={22} />暂无记录</div>}
        </div>

        <aside className="record-detail">
          <div className="detail-title">记录详情</div>
          {selected ? (
            <dl>
              {Object.entries(selected).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{typeof value === "string" && (value.startsWith("{") || value.startsWith("["))
                    ? <pre>{JSON.stringify(JSON.parse(value), null, 2)}</pre>
                    : displayValue(key, value)}</dd>
                </div>
              ))}
            </dl>
          ) : <span className="muted">选择一条记录</span>}
        </aside>
      </div>
    </main>
  );
}
