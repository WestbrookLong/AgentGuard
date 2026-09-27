import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, BrainCircuit, CheckCircle2, ChevronRight, CircleHelp, FileUp, GitBranch, LayoutGrid, MessageCircle, MessageSquare, MoreHorizontal, Plus, RotateCcw, Send, Settings2, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import type { AgentDefinition, EventKind, GroupState, GuardReview, RoomEvent } from "./model";
import { addAgent, addRoute, appendAction, loadState, remember, removeRoute, resetState, saveState, simulateCustomerMessage, simulateEvidence, updateAgent } from "./runtime";
import { MemoryView } from "./MemoryView";
import { api, type APIConfig } from "./api";

type Page = "room" | "agents" | "memory";

const kindLabel: Record<RoomEvent["kind"], string> = {
  message: "消息", evidence: "客户证据", case: "案件交接", policy: "政策查阅", decision: "审核决定", tool: "工具调用", report: "执行报告", memory: "记忆更新",
};

function time(value: string) { return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); }

function Person({ id, agents, small = false }: { id: string; agents: AgentDefinition[]; small?: boolean }) {
  const agent = agents.find((item) => item.id === id);
  const name = agent?.name || ({ customer: "客户", human: "你", system: "System" }[id] || id);
  return <span className={`person ${small ? "small" : ""}`}><span className="avatar" style={{ background: agent?.color || (id === "customer" ? "#347ead" : id === "system" ? "#545b6d" : "#775fc5") }}>{name.slice(0, 1).toUpperCase()}</span><span>{name}</span></span>;
}

function EventCard({ event, state, threadCount = 0, onThread, selected }: { event: RoomEvent; state: GroupState; threadCount?: number; onThread?: () => void; selected?: boolean }) {
  return <article id={`event-${event.id}`} className={`event-card ${selected ? "focused" : ""}`}>
    <div className="event-head"><Person id={event.actorId} agents={state.agents} /><span className="event-kind">{kindLabel[event.kind]}</span><time>{time(event.createdAt)}</time><span className="event-number">#{event.sequence}</span></div>
    <p>{event.body}</p>
    <div className="event-foot">
      {event.recipients.length > 0 && <span>→ {event.recipients.map((id) => state.agents.find((agent) => agent.id === id)?.name || id).join(", ")}</span>}
      {event.basisEventIds.length > 0 && <span>依据 {event.basisEventIds.map((id) => `#${state.events.find((item) => item.id === id)?.sequence || "?"}`).join(" · ")}</span>}
      {onThread && <button onClick={onThread}><MessageCircle size={14} />{threadCount ? `${threadCount} 条回复` : "开启 thread"}<ChevronRight size={13} /></button>}
    </div>
  </article>;
}

export default function App() {
  const [state, setState] = useState<GroupState>(loadState);
  const [page, setPage] = useState<Page>("room");
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState("");
  const [threadDraft, setThreadDraft] = useState("");
  const [customerDraft, setCustomerDraft] = useState("");
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [agentTools, setAgentTools] = useState("");
  const [agentModel, setAgentModel] = useState("");
  const [apiConfig, setApiConfig] = useState<APIConfig | null>(null);
  const [apiOpen, setApiOpen] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [defaultModelDraft, setDefaultModelDraft] = useState("qwen-plus");
  const [baseUrlDraft, setBaseUrlDraft] = useState("https://dashscope.aliyuncs.com/compatible-mode/v1");
  const [liveMode, setLiveMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [routeKind, setRouteKind] = useState<EventKind>("message");
  const [routeAgent, setRouteAgent] = useState("support");
  const [guardReview, setGuardReview] = useState<GuardReview | null>(null);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => saveState(state), [state]);
  useEffect(() => { void api.config().then((config) => { setApiConfig(config); setDefaultModelDraft(config.default_model); setBaseUrlDraft(config.base_url); }).catch(() => setApiConfig(null)); }, []);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(""), 4500); return () => clearTimeout(timer); } }, [notice]);

  const groupEvents = state.events.filter((event) => event.channel === "group" && !event.threadId);
  const threadRoot = state.events.find((event) => event.id === threadRootId) || null;
  const threadEvents = state.events.filter((event) => event.threadId === threadRootId);
  const customerEvents = state.events.filter((event) => event.channel === "customer");
  const activeCount = state.agents.filter((agent) => agent.active).length;
  const roomMemoryCount = state.memories.filter((memory) => memory.scopeId === "room").length;
  const latestReport = [...state.events].reverse().find((event) => event.kind === "report");
  const activity = useMemo(() => state.events.filter((event) => ["case", "policy", "decision", "report"].includes(event.kind)).slice(-4), [state.events]);

  function attempt(action: () => void) { try { action(); } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); } }

  function postGroup() {
    const body = groupDraft.trim(); if (!body) return;
    attempt(() => { setState((current) => appendAction(current, { actorId: "human", kind: "message", channel: "group", body, basisEventIds: [] })[0]); setGroupDraft(""); });
  }
  function postThread() {
    const body = threadDraft.trim(); if (!body || !threadRootId) return;
    attempt(() => { setState((current) => appendAction(current, { actorId: "human", kind: "message", channel: "group", body, basisEventIds: [threadRootId], threadId: threadRootId })[0]); setThreadDraft(""); });
  }
  async function runLive(initial: GroupState, triggerId: string) {
    setBusy(true);
    let working = initial;
    try {
      const invoke = async (agentId: string, eventId: string): Promise<RoomEvent[]> => {
        const result = await api.invoke(working, agentId, eventId);
        const emitted: RoomEvent[] = [];
        for (const action of result.actions) {
          if (action.actorId !== agentId) throw new Error("Agent 响应的身份与请求不符");
          if (action.kind === "report") action.basisEventIds = [...new Set([...action.basisEventIds, ...emitted.filter((item) => item.kind === "tool").map((item) => item.id)])];
          let event: RoomEvent;
          [working, event] = appendAction(working, action);
          emitted.push(event);
          setState(working);
        }
        return emitted;
      };
      const supportEvents = await invoke("support", triggerId);
      const caseEvent = supportEvents.find((event) => event.kind === "case");
      if (!caseEvent || !working.agents.find((agent) => agent.id === "decision")?.active) return;
      working = remember(working, "room", caseEvent.body, [caseEvent.id], "support");
      setState(working);
      const policy = await api.policy();
      let policyEvent: RoomEvent;
      [working, policyEvent] = appendAction(working, { actorId: "decision", kind: "policy", channel: "group", body: `${policy.policy_id}\n${policy.text}`, basisEventIds: [caseEvent.id] });
      setState(working);
      const decisionEvents = await invoke("decision", policyEvent.id);
      const decisionEvent = decisionEvents.find((event) => event.kind === "decision");
      if (!decisionEvent || !working.agents.find((agent) => agent.id === "refund")?.active) return;
      working = remember(working, "decision", decisionEvent.body, [decisionEvent.id, policyEvent.id], "decision");
      setState(working);
      const refundEvents = await invoke("refund", decisionEvent.id);
      const report = refundEvents.find((event) => event.kind === "report");
      if (report) {
        working = remember(working, "refund", report.body, [report.id], "refund");
        setState(working);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  async function postCustomer() {
    const body = customerDraft.trim(); if (!body || busy) return;
    if (liveMode && !apiConfig?.configured) { setNotice("请先在 API 配置中输入 Qwen API Key"); return; }
    setCustomerDraft("");
    if (!liveMode) { attempt(() => setState((current) => simulateCustomerMessage(current, body))); return; }
    const [next, event] = appendAction(state, { actorId: "customer", kind: "message", channel: "customer", body, basisEventIds: [] });
    setState(next);
    await runLive(next, event.id);
  }
  async function uploadEvidence(file: File | undefined) {
    if (!file || busy) return;
    if (fileRef.current) fileRef.current.value = "";
    if (!liveMode) { attempt(() => setState((current) => simulateEvidence(current, file.name))); return; }
    if (!apiConfig?.configured) { setNotice("请先在 API 配置中输入 Qwen API Key"); return; }
    const [next, event] = appendAction(state, { actorId: "customer", kind: "evidence", channel: "customer", body: `已上传证据：${file.name}（文件内容尚未读取）`, basisEventIds: [] });
    setState(next);
    await runLive(next, event.id);
  }
  function openAgentForm(agent?: AgentDefinition) {
    setEditingAgentId(agent?.id || null); setAgentName(agent?.name || ""); setAgentDescription(agent?.description || ""); setAgentTools(agent?.tools.join(", ") || ""); setAgentModel(agent?.model || ""); setShowAgentForm(true);
  }
  function saveAgent() {
    if (!agentName.trim() || !agentDescription.trim()) return;
    setState((current) => editingAgentId
      ? updateAgent(current, editingAgentId, { name: agentName.trim(), role: agentDescription.trim().slice(0, 30), description: agentDescription.trim(), tools: agentTools.split(",").map((item) => item.trim()).filter(Boolean), model: agentModel.trim() })
      : addAgent(current, agentName, agentDescription, agentTools, agentModel));
    setShowAgentForm(false);
  }
  function navigateToEvent(eventId: string) {
    const event = state.events.find((item) => item.id === eventId); if (!event) return;
    setPage("room"); setSelectedEventId(eventId);
    if (event.threadId) setThreadRootId(event.threadId);
    window.setTimeout(() => document.getElementById(`event-${eventId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }

  async function saveAPI() {
    try {
      const config = await api.saveConfig(apiKeyDraft, defaultModelDraft, baseUrlDraft);
      setApiConfig(config);
      setApiKeyDraft("");
      setApiOpen(false);
      setNotice(config.configured ? "Qwen API 已在本地服务中配置" : "请输入 API Key 完成配置");
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  }

  async function testAPI() {
    try { const result = await api.testConnection(); setNotice(result.ok ? "Qwen API 连接成功" : "Qwen API 返回了异常结果"); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  }

  return <div className="app-shell">
    <aside className="app-rail">
      <div className="brand-mark">A<span>G</span></div>
      <nav aria-label="主导航">
        <button className={page === "room" ? "active" : ""} onClick={() => setPage("room")} title="Room"><MessageSquare size={21} /></button>
        <button className={page === "agents" ? "active" : ""} onClick={() => setPage("agents")} title="Agent 成员"><Users size={21} /></button>
        <button className={page === "memory" ? "active" : ""} onClick={() => setPage("memory")} title="记忆图景"><BrainCircuit size={21} /></button>
      </nav>
      <div className="rail-bottom"><button title="Qwen API 配置" onClick={() => setApiOpen(true)}><Settings2 size={19} /></button><button title="重置本地演示" onClick={() => { setState(resetState()); setThreadRootId(null); setGuardReview(null); setNotice("演示已重置"); }}><RotateCcw size={19} /></button></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span>WORKSPACE</span><ChevronRight size={14} /><strong>ShopCo 退款协作</strong><span className="version-pill">GROUP v{state.version}</span></div><div className="top-actions"><span className="live-dot" /> 本地原型 <button onClick={() => setApiOpen(true)}><Settings2 size={16} /> Qwen API {apiConfig?.configured ? "已配置" : "配置"}</button><button onClick={() => setPage("agents")}>配置成员</button></div></header>

      {page === "room" && <div className="workspace-page">
        <div className="page-heading"><div><span className="eyebrow">FLAT AGENT GROUP</span><h1>协作 Room</h1><p>主消息流、thread 和客户测试共用一份可追溯事件记录。</p></div><div className="heading-metric"><strong>{activeCount}</strong><span>活跃成员</span></div></div>
        <div className="workspace-grid">
          <section className="group-panel panel">
            <div className="panel-header"><div className="panel-title"><LayoutGrid size={18} /><div><strong># refund-operations</strong><small>Room 主消息流 · {state.events.length} 个事件</small></div></div><button className="icon-button" title="添加成员" onClick={() => openAgentForm()}><Plus size={18} /></button></div>
            <div className="group-feed">{groupEvents.map((event) => <EventCard key={event.id} event={event} state={state} selected={selectedEventId === event.id} threadCount={state.events.filter((item) => item.threadId === event.id).length} onThread={() => { setThreadRootId(event.id); setSelectedEventId(null); }} />)}</div>
            <div className="composer"><textarea rows={2} placeholder="向整个 Group 发消息…" value={groupDraft} onChange={(event) => setGroupDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); postGroup(); } }} /><div><span>Enter 发送 · Shift+Enter 换行</span><button onClick={postGroup} disabled={!groupDraft.trim()}><Send size={16} />发送</button></div></div>
          </section>

          <section className="customer-panel panel">
            <div className="panel-header"><div className="panel-title"><MessageCircle size={18} /><div><strong>客户测试窗口</strong><small>模拟真实客服的多轮对话</small></div></div><span className="sandbox-badge">SANDBOX</span></div>
            <div className="mode-switch"><button className={!liveMode ? "selected" : ""} disabled={busy} onClick={() => setLiveMode(false)}>固定脚本</button><button className={liveMode ? "selected" : ""} disabled={busy} onClick={() => setLiveMode(true)}>Qwen 实时调用</button>{busy && <span>Agent 正在处理…</span>}</div>
            <div className="customer-feed">{customerEvents.length === 0 ? <div className="empty-customer"><Sparkles size={27} /><strong>开始一次退款对话</strong><p>发送“我想为订单 #1182 申请退款”，再上传证据文件，观察三个 agent 如何协作。</p></div> : customerEvents.map((event) => <div key={event.id} id={`event-${event.id}`} className={`customer-bubble ${event.actorId === "customer" ? "from-customer" : "from-support"} ${selectedEventId === event.id ? "focused" : ""}`}><small>{event.actorId === "customer" ? "客户" : "Support"} · {time(event.createdAt)} · #{event.sequence}</small><p>{event.body}</p></div>)}</div>
            <div className="customer-composer"><input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" hidden onChange={(event) => void uploadEvidence(event.target.files?.[0])} /><button className="attach-button" title="上传证据元数据" disabled={busy} onClick={() => fileRef.current?.click()}><FileUp size={18} /></button><input value={customerDraft} disabled={busy} placeholder="以客户身份发送消息…" onChange={(event) => setCustomerDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void postCustomer(); }} /><button onClick={() => void postCustomer()} disabled={busy || !customerDraft.trim()}><ArrowRight size={17} /></button></div>
            <div className="customer-note"><CircleHelp size={13} />{liveMode ? "由本地 Python 服务调用 Qwen；上传只记录文件名，不读取文件内容。" : "演示使用固定脚本；上传只记录文件名，不读取文件内容。"}</div>
          </section>

          <aside className="context-panel">
            <section className="panel context-card"><div className="card-heading"><span>GROUP MEMBERS</span><button onClick={() => setPage("agents")}>管理 <ChevronRight size={12} /></button></div>{state.agents.map((agent) => <div key={agent.id} className="member-row"><span className="member-dot" style={{ background: agent.color }} /><div><strong>{agent.name}</strong><small>{agent.role}</small></div><span className={`status-dot ${agent.active ? "" : "inactive"}`} /></div>)}</section>
            <section className="panel context-card"><div className="card-heading"><span>ROOM MEMORY</span><button onClick={() => setPage("memory")}>查看 <ChevronRight size={12} /></button></div><div className="memory-count"><BrainCircuit size={20} /><strong>{roomMemoryCount}</strong><span>条共享记忆</span></div><p>每个 agent 的独立记忆在「记忆图景」中切换查看。</p></section>
            <section className="panel context-card"><div className="card-heading"><span>RECENT ACTIVITY</span><Activity size={15} /></div>{activity.length ? activity.map((event) => <button key={event.id} className="activity-row" onClick={() => navigateToEvent(event.id)}><span className="activity-mark" /><span><strong>{kindLabel[event.kind]}</strong><small>{event.actorId} · #{event.sequence}</small></span></button>) : <p className="muted">等待测试运行</p>}</section>
            <section className="panel context-card guard-card"><div className="card-heading"><span>OFFLINE GUARD</span><ShieldCheck size={16} /></div><p>对当前 Room 快照运行来源追踪与退款策略检查。测试不会改写聊天或执行工具。</p><button className="outline-button" onClick={() => void api.reviewRoom(state).then(setGuardReview).catch((error) => setNotice(error instanceof Error ? error.message : String(error)))}>运行离线 Guard</button>{guardReview && <div className={`review-result ${guardReview.status}`}><CheckCircle2 size={15} />{guardReview.report?.verdict || guardReview.status} · {guardReview.findings.length} 条发现{guardReview.findings.slice(0, 3).map((finding, index) => <p key={`${finding.eventId}-${index}`}>{finding.eventId ? `${finding.eventId}: ` : ""}{finding.reason}</p>)}</div>}</section>
            {latestReport && <section className="panel context-card"><div className="card-heading"><span>LATEST REPORT</span><MoreHorizontal size={16} /></div><p>{latestReport.body}</p><button className="text-link" onClick={() => navigateToEvent(latestReport.id)}>查看报告事件 <ArrowRight size={13} /></button></section>}
          </aside>
        </div>
      </div>}

      {page === "agents" && <div className="agents-page"><div className="page-heading"><div><span className="eyebrow">GROUP CONFIGURATION</span><h1>协作成员</h1><p>成员可以增加、编辑或移出；历史事件与记忆继续保留。</p></div><button className="primary-button" onClick={() => openAgentForm()}><Plus size={17} />添加 agent</button></div><div className="agent-grid">{state.agents.map((agent) => <article className="agent-card panel" key={agent.id}><div className="agent-card-top"><span className="agent-avatar" style={{ background: agent.color }}>{agent.name.slice(0, 1).toUpperCase()}</span><span className={`agent-state ${agent.active ? "" : "off"}`}>{agent.active ? "活跃" : "已移出"}</span></div><h2>{agent.name}</h2><span className="agent-role">{agent.role}</span><p>{agent.description}</p><div className="tool-tags">{agent.tools.length ? agent.tools.map((tool) => <span key={tool}>{tool}</span>) : <span>尚未配置工具</span>}</div><div className="agent-card-bottom"><button onClick={() => openAgentForm(agent)}>编辑配置</button><button onClick={() => setState((current) => updateAgent(current, agent.id, { active: !agent.active }))}>{agent.active ? "移出 Group" : "重新加入"}</button></div></article>)}</div><section className="routes-panel panel"><div><span className="eyebrow">WAKE RULES</span><h2>唤醒规则草案</h2><p>规则已版本化；当前固定脚本尚未由这些规则驱动。</p></div><div className="route-list">{state.routes.map((route) => <div className="route-row" key={route.id}><span>事件 <b>{kindLabel[route.on]}</b></span><ArrowRight size={14} /><span>唤醒 <b>{state.agents.find((agent) => agent.id === route.wakeAgentId)?.name || route.wakeAgentId}</b></span><button title="移除规则" onClick={() => setState((current) => removeRoute(current, route.id))}><X size={14} /></button></div>)}</div><div className="route-add"><select value={routeKind} onChange={(event) => setRouteKind(event.target.value as EventKind)}>{Object.entries(kindLabel).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select><select value={routeAgent} onChange={(event) => setRouteAgent(event.target.value)}>{state.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><button className="primary-button" onClick={() => attempt(() => setState((current) => addRoute(current, routeKind, routeAgent)))}><Plus size={14} />添加规则</button></div></section><div className="config-note"><GitBranch size={18} /><div><strong>版本与接入</strong><p>每次成员或路由修改递增 Group 版本。本地雏形尚未启动真实 agent；后续适配器按统一的 describe / invoke 协议接入。</p></div></div></div>}

      {page === "memory" && <MemoryView state={state} onRemember={(scopeId, text, sources) => attempt(() => setState((current) => remember(current, scopeId, text, sources)))} onEventSelect={navigateToEvent} />}
    </div>

    {threadRoot && page === "room" && <div className="thread-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setThreadRootId(null); }}><aside className="thread-panel"><div className="thread-header"><div><span className="eyebrow">THREAD</span><h2>围绕一条消息继续讨论</h2></div><button className="icon-button" onClick={() => setThreadRootId(null)}><X size={19} /></button></div><div className="thread-feed"><EventCard event={threadRoot} state={state} selected={selectedEventId === threadRoot.id} />{threadEvents.map((event) => <EventCard key={event.id} event={event} state={state} selected={selectedEventId === event.id} />)}</div><div className="composer"><textarea rows={3} value={threadDraft} placeholder="回复这个 thread…" onChange={(event) => setThreadDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); postThread(); } }} /><div><span>回复会引用 thread 根事件</span><button onClick={postThread} disabled={!threadDraft.trim()}><Send size={15} />回复</button></div></div></aside></div>}

    {showAgentForm && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAgentForm(false); }}><div className="agent-modal panel"><div className="modal-head"><div><span className="eyebrow">AGENT MANIFEST</span><h2>{editingAgentId ? "编辑 agent" : "添加 agent"}</h2></div><button className="icon-button" onClick={() => setShowAgentForm(false)}><X size={19} /></button></div><label>名称<input value={agentName} onChange={(event) => setAgentName(event.target.value)} placeholder="例如 Evidence Reviewer" /></label><label>职责描述<textarea value={agentDescription} onChange={(event) => setAgentDescription(event.target.value)} rows={4} placeholder="描述这个 agent 负责什么、何时行动…" /></label><label>所需工具（逗号分隔）<input value={agentTools} onChange={(event) => setAgentTools(event.target.value)} placeholder="get_order, search_policy" /></label><label>模型 ID（留空使用全局默认）<input value={agentModel} onChange={(event) => setAgentModel(event.target.value)} placeholder="qwen-plus" /></label><p>核心三个 agent 可通过本地 Python 服务调用 Qwen。新成员已有通用调用接口，自动唤醒仍需接入路由执行器。</p><button className="primary-button" onClick={saveAgent} disabled={!agentName.trim() || !agentDescription.trim()}>{editingAgentId ? "保存更改" : "添加到 Group"}</button></div></div>}
    {apiOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setApiOpen(false); }}><div className="agent-modal panel"><div className="modal-head"><div><span className="eyebrow">LOCAL MODEL CONNECTION</span><h2>Qwen API 配置</h2></div><button className="icon-button" onClick={() => setApiOpen(false)}><X size={19} /></button></div><p>百炼 API Key 发送到本机 127.0.0.1:8765 服务，只在该 Python 进程内存中保存；浏览器不会持久化 Key。</p><label>百炼 Qwen API Key<input type="password" autoComplete="off" value={apiKeyDraft} onChange={(event) => setApiKeyDraft(event.target.value)} placeholder={apiConfig?.configured ? "已配置；留空保持现有 Key" : "sk-..."} /></label><label>Base URL（与 Key 地域一致）<input value={baseUrlDraft} onChange={(event) => setBaseUrlDraft(event.target.value)} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" /></label><label>默认模型 ID<input value={defaultModelDraft} onChange={(event) => setDefaultModelDraft(event.target.value)} placeholder="qwen-plus" /></label><div className="api-status">本地服务：{apiConfig ? "已连接" : "未连接"} · Key：{apiConfig?.configured ? "已配置" : "未配置"}</div><div className="api-actions"><button className="outline-button" onClick={() => void testAPI()} disabled={!apiConfig?.configured}>测试连接</button><button className="primary-button" onClick={() => void saveAPI()} disabled={!defaultModelDraft.trim() || !baseUrlDraft.trim()}>保存到本机服务</button></div></div></div>}
    {notice && <div className="toast">{notice}</div>}
  </div>;
}
