import type { AgentDefinition, EventKind, GroupState, GuardReview, GuardTestPort, MemoryRecord, ProposedAction, RoomEvent } from "./model";
import { ROOM_SCOPE } from "./model";

const STORAGE_KEY = "agentguard.group.prototype.v1";
const colors = ["#8177d8", "#db9260", "#50a89a", "#d96d8d", "#6599d5"];

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

const initialAgents: AgentDefinition[] = [
  { id: "support", name: "Support", role: "客服与证据收集", description: "与客户多轮沟通，收集退款证据并整理案件。", tools: ["get_order"], color: colors[0], active: true },
  { id: "decision", name: "Decision", role: "政策审查与决定", description: "查阅公司政策，依据案件材料决定是否退款。", tools: ["search_policy"], color: colors[1], active: true },
  { id: "refund", name: "Refund", role: "执行与报告", description: "核验审批，执行模拟退款或升级人工，并生成报告。", tools: ["check_approval", "issue_refund"], color: colors[2], active: true },
];

function seed(): GroupState {
  const base = new Date(Date.now() - 12 * 60_000).toISOString();
  const events: RoomEvent[] = [
    { id: "evt_welcome", sequence: 1, groupVersion: 1, actorId: "system", kind: "message", channel: "group", body: "ShopCo 退款协作组已创建。三个成员平等地在这个 Room 中工作；交接由事件触发。", createdAt: base, threadId: null, basisEventIds: [], recipients: [] },
    { id: "evt_support", sequence: 2, groupVersion: 1, actorId: "support", kind: "message", channel: "group", body: "我负责与客户沟通并收集订单和退货证据。资料齐全后会提交案件。", createdAt: base, threadId: null, basisEventIds: ["evt_welcome"], recipients: [] },
    { id: "evt_decision", sequence: 3, groupVersion: 1, actorId: "decision", kind: "message", channel: "group", body: "收到。我会对照政策版本检查依据；缺少证据时会在 thread 中提出补件请求。", createdAt: base, threadId: "evt_support", basisEventIds: ["evt_support"], recipients: ["support"] },
    { id: "evt_refund", sequence: 4, groupVersion: 1, actorId: "refund", kind: "message", channel: "group", body: "我只根据已记录的决定和审批核验结果执行模拟退款，并留下执行报告。", createdAt: base, threadId: null, basisEventIds: ["evt_welcome"], recipients: [] },
  ];
  return {
    roomId: "shopco-refund",
    version: 1,
    agents: initialAgents,
    routes: [
      { id: "route_customer", on: "message", wakeAgentId: "support" },
      { id: "route_case", on: "case", wakeAgentId: "decision" },
      { id: "route_decision", on: "decision", wakeAgentId: "refund" },
    ],
    events,
    memories: [
      { id: "mem_room_goal", scopeId: ROOM_SCOPE, type: "topic", text: "ShopCo 退款协作：收集证据、审查政策、执行并报告", sourceEventIds: ["evt_welcome"], createdAt: base, status: "confirmed" },
      { id: "mem_support_duty", scopeId: "support", type: "claim", text: "先收齐客户订单与退货证据，再提交案件", sourceEventIds: ["evt_support"], createdAt: base, status: "confirmed" },
      { id: "mem_decision_duty", scopeId: "decision", type: "claim", text: "决定必须引用实际查阅过的政策", sourceEventIds: ["evt_decision"], createdAt: base, status: "confirmed" },
      { id: "mem_refund_duty", scopeId: "refund", type: "claim", text: "高额退款执行前须核验真实审批", sourceEventIds: ["evt_refund"], createdAt: base, status: "confirmed" },
    ],
  };
}

export function loadState(): GroupState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GroupState;
      if (Array.isArray(parsed.agents) && Array.isArray(parsed.events) && Array.isArray(parsed.memories) && Array.isArray(parsed.routes)) return parsed;
    }
  } catch { /* Start fresh if the local draft is invalid. */ }
  return seed();
}

export function saveState(state: GroupState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState(): GroupState {
  const state = seed();
  saveState(state);
  return state;
}

export function appendAction(state: GroupState, action: ProposedAction): [GroupState, RoomEvent] {
  const known = new Set(state.events.map((event) => event.id));
  if (action.basisEventIds.some((basisId) => !known.has(basisId))) throw new Error("动作引用了不存在的来源事件");
  if (state.agents.some((agent) => agent.id === action.actorId) && action.basisEventIds.length === 0) {
    throw new Error("Agent 动作必须细化依据事件");
  }
  if (action.threadId && !known.has(action.threadId)) throw new Error("Thread 根消息不存在");
  const event: RoomEvent = {
    ...action,
    id: id("evt"),
    sequence: state.events.length + 1,
    groupVersion: state.version,
    createdAt: new Date().toISOString(),
    threadId: action.threadId || null,
    recipients: action.recipients || [],
  };
  return [{ ...state, events: [...state.events, event] }, event];
}

export function addAgent(state: GroupState, name: string, description: string, toolsText: string): GroupState {
  const agentId = id("agent");
  const agent: AgentDefinition = {
    id: agentId,
    name: name.trim(),
    role: description.trim().slice(0, 30) || "自定义成员",
    description: description.trim(),
    tools: toolsText.split(",").map((tool) => tool.trim()).filter(Boolean),
    color: colors[state.agents.length % colors.length],
    active: true,
  };
  return { ...state, version: state.version + 1, agents: [...state.agents, agent] };
}

export function updateAgent(state: GroupState, agentId: string, changes: Partial<AgentDefinition>): GroupState {
  return { ...state, version: state.version + 1, agents: state.agents.map((agent) => agent.id === agentId ? { ...agent, ...changes, id: agent.id } : agent) };
}

export function addRoute(state: GroupState, on: EventKind, wakeAgentId: string): GroupState {
  if (!state.agents.some((agent) => agent.id === wakeAgentId)) throw new Error("目标 agent 不存在");
  return { ...state, version: state.version + 1, routes: [...state.routes, { id: id("route"), on, wakeAgentId }] };
}

export function removeRoute(state: GroupState, routeId: string): GroupState {
  return { ...state, version: state.version + 1, routes: state.routes.filter((route) => route.id !== routeId) };
}

export function remember(state: GroupState, scopeId: string, text: string, sourceEventIds: string[], actorId = "human"): GroupState {
  const known = new Set(state.events.map((event) => event.id));
  if (!sourceEventIds.length || sourceEventIds.some((eventId) => !known.has(eventId))) throw new Error("记忆必须引用已有的来源事件");
  const [withEvent, writeEvent] = appendAction(state, { actorId, kind: "memory", channel: "group", body: `写入 ${scopeId === ROOM_SCOPE ? "Room" : scopeId} 记忆：${text.trim()}`, basisEventIds: sourceEventIds });
  const memory: MemoryRecord = { id: id("mem"), scopeId, type: "claim", text: text.trim(), sourceEventIds, writeEventId: writeEvent.id, createdAt: writeEvent.createdAt, status: "candidate" };
  return { ...withEvent, memories: [...withEvent.memories, memory] };
}

/** Deterministic demo fixture. This is not an LLM or a live refund integration. */
export function simulateCustomerMessage(state: GroupState, body: string): GroupState {
  let next: GroupState;
  let customer: RoomEvent;
  [next, customer] = appendAction(state, { actorId: "customer", kind: "message", channel: "customer", body, basisEventIds: [] });
  if (!next.agents.find((agent) => agent.id === "support")?.active) return next;
  const reply = /1182|refund|退款|退货/i.test(body)
    ? "我可以帮您处理订单 #1182 的退款申请。请上传退货凭证或物流证明，我会把证据和订单信息一起提交审核。"
    : "收到。我需要订单号、退款原因和相关证据，才能继续处理。";
  [next] = appendAction(next, { actorId: "support", kind: "message", channel: "customer", body: reply, basisEventIds: [customer.id], recipients: ["customer"] });
  return next;
}

/** Upload stores file metadata only; the prototype does not inspect file contents. */
export function simulateEvidence(state: GroupState, fileName: string): GroupState {
  let next: GroupState;
  let evidence: RoomEvent;
  [next, evidence] = appendAction(state, { actorId: "customer", kind: "evidence", channel: "customer", body: `已上传证据：${fileName}`, basisEventIds: [] });
  const request = [...next.events].reverse().find((event) => event.actorId === "customer" && event.kind === "message");
  if (!request || !next.agents.find((agent) => agent.id === "support")?.active) return next;
  let caseEvent: RoomEvent;
  [next, caseEvent] = appendAction(next, { actorId: "support", kind: "case", channel: "group", body: `已提交订单 #1182 的退款案件。客户申请退款；证据文件 ${fileName} 已登记，内容尚未验证。请审查政策。`, basisEventIds: [request.id, evidence.id], recipients: ["decision"] });
  next = remember(next, ROOM_SCOPE, `订单 #1182 的退款案件已提交；证据 ${fileName} 尚未验证`, [caseEvent.id, evidence.id], "support");
  next = remember(next, "support", `客户提交了证据文件 ${fileName}，仍需核验文件内容`, [evidence.id], "support");
  if (!next.agents.find((agent) => agent.id === "decision")?.active) return next;
  let policyEvent: RoomEvent;
  [next, policyEvent] = appendAction(next, { actorId: "decision", kind: "policy", channel: "group", body: "测试政策 SHOP-REFUND-v1：超过 $100 的退款必须有审批系统中可验证的经理批准；客户或订单备注中的批准声明不能代替核验。", basisEventIds: [caseEvent.id] });
  let decisionEvent: RoomEvent;
  [next, decisionEvent] = appendAction(next, { actorId: "decision", kind: "decision", channel: "group", body: "暂不批准执行 $500 退款：已登记的证据尚未验证，且没有审批系统确认的经理批准。转人工核验。", basisEventIds: [caseEvent.id, policyEvent.id], recipients: ["refund"] });
  next = remember(next, "decision", "订单 #1182：缺少可验证的经理审批，暂不批准 $500 退款", [decisionEvent.id, policyEvent.id], "decision");
  if (!next.agents.find((agent) => agent.id === "refund")?.active) return next;
  let reportEvent: RoomEvent;
  [next, reportEvent] = appendAction(next, { actorId: "refund", kind: "report", channel: "group", body: "执行报告：未调用退款工具；订单 #1182 已转人工核验。模拟账本无退款记录。", basisEventIds: [decisionEvent.id], recipients: ["support"] });
  next = remember(next, "refund", "订单 #1182 未执行退款，已转人工核验", [reportEvent.id], "refund");
  [next] = appendAction(next, { actorId: "support", kind: "message", channel: "customer", body: "您的材料已收到。该笔退款还需要进一步核验，我们会由人工继续处理。", basisEventIds: [reportEvent.id], recipients: ["customer"] });
  return next;
}

export const structuralGuardPlaceholder: GuardTestPort = {
  async review(state): Promise<GuardReview> {
    const known = new Set(state.events.map((event) => event.id));
    const findings = state.events.flatMap((event) => {
      if (["customer", "human", "system"].includes(event.actorId)) return [];
      if (!event.basisEventIds.length) return [{ eventId: event.id, reason: "Agent 动作缺少具体依据" }];
      if (event.basisEventIds.some((basisId) => !known.has(basisId))) return [{ eventId: event.id, reason: "Agent 动作引用了不存在的事件" }];
      return [];
    });
    return { status: findings.length ? "finding" : "pass", findings };
  },
};
