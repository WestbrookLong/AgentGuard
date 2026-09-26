import { useMemo, useState } from "react";
import { BrainCircuit, GitBranch, List, Plus, Search } from "lucide-react";
import type { MemoryGraph, MemoryTimeline } from "../../Memory System/src/types";
import { MemoryGraphCanvas } from "../../Memory System/src/components/MemoryGraphCanvas";
import { MemoryTimelineView } from "../../Memory System/src/components/MemoryTimelineView";
import type { GroupState } from "./model";
import { ROOM_SCOPE } from "./model";

interface Props {
  state: GroupState;
  onRemember: (scopeId: string, text: string, sourceEventIds: string[]) => void;
  onEventSelect: (eventId: string) => void;
}

export function MemoryView({ state, onRemember, onEventSelect }: Props) {
  const [scopeId, setScopeId] = useState(ROOM_SCOPE);
  const [mode, setMode] = useState<"graph" | "timeline">("graph");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [query, setQuery] = useState("");
  const scoped = useMemo(() => state.memories.filter((memory) => memory.scopeId === scopeId && memory.text.toLowerCase().includes(query.toLowerCase())), [state.memories, scopeId, query]);
  const scopeName = scopeId === ROOM_SCOPE ? "Room 共享记忆" : `${state.agents.find((agent) => agent.id === scopeId)?.name || scopeId} 的独立记忆`;
  const graph = useMemo<MemoryGraph>(() => {
    const rootId = `identity:${scopeId}`;
    const evidenceIds = [...new Set(scoped.flatMap((memory) => memory.sourceEventIds))];
    const eventMap = new Map(state.events.map((event) => [event.id, event]));
    return {
      generatedAt: new Date().toISOString(), mode: "local", focusId: rootId, truncated: false,
      totals: { nodes: scoped.length + evidenceIds.length + 1, edges: scoped.length + scoped.reduce((count, memory) => count + memory.sourceEventIds.length, 0) },
      nodes: [
        { id: rootId, rawId: scopeId, type: "identity", label: scopeName },
        ...scoped.map((memory) => ({ id: `claim:${memory.id}`, rawId: memory.id, type: memory.type, label: memory.text, status: memory.status, date: memory.createdAt })),
        ...evidenceIds.map((eventId) => ({ id: `event:${eventId}`, rawId: eventId, type: "event" as const, label: eventMap.get(eventId)?.body || eventId, date: eventMap.get(eventId)?.createdAt })),
      ],
      edges: [
        ...scoped.map((memory) => ({ id: `owns:${memory.id}`, source: rootId, target: `claim:${memory.id}`, type: "owns", directed: true })),
        ...scoped.flatMap((memory) => memory.sourceEventIds.map((eventId) => ({ id: `source:${memory.id}:${eventId}`, source: `event:${eventId}`, target: `claim:${memory.id}`, type: "evidence", directed: true }))),
      ],
    };
  }, [scoped, scopeId, scopeName, state.events]);
  const timeline = useMemo<MemoryTimeline>(() => ({
    generatedAt: new Date().toISOString(), from: null, to: null,
    entries: scoped.map((memory) => ({
      id: `claim:${memory.id}`, rawId: memory.id, track: "claims", type: memory.type,
      label: memory.text, status: memory.status, start: memory.createdAt,
    })),
  }), [scoped]);
  const selectedMemory = scoped.find((memory) => `claim:${memory.id}` === selectedId);
  const selectedEvent = selectedId?.startsWith("event:") ? state.events.find((event) => `event:${event.id}` === selectedId) : null;

  return (
    <div className="memory-page">
      <div className="page-heading"><div><span className="eyebrow">MEMORY ATLAS · REUSED VISUALIZATION</span><h1>分层记忆</h1><p>每个 agent 拥有独立记忆；Room 有自己的共享记忆。每条记忆指向来源事件。</p></div><BrainCircuit size={32} /></div>
      <div className="memory-layout">
        <aside className="memory-sidebar panel">
          <div className="sidebar-label">选择记忆范围</div>
          {[{ id: ROOM_SCOPE, name: "Room", role: "共享记忆" }, ...state.agents.map((agent) => ({ id: agent.id, name: agent.name, role: agent.role }))].map((item) => (
            <button key={item.id} className={`scope-row ${scopeId === item.id ? "active" : ""}`} onClick={() => { setScopeId(item.id); setSelectedId(null); }}>
              <span className="scope-dot" style={{ background: item.id === ROOM_SCOPE ? "#9c9aeb" : state.agents.find((agent) => agent.id === item.id)?.color }} />
              <span><strong>{item.name}</strong><small>{item.role}</small></span>
              <b>{state.memories.filter((memory) => memory.scopeId === item.id).length}</b>
            </button>
          ))}
          <div className="memory-note"><GitBranch size={16} /><span>当前雏形保存的是有来源引用的记忆记录。自动提取、合并和遗忘策略将接到后续记忆服务。</span></div>
        </aside>
        <section className="memory-main panel">
          <div className="memory-toolbar"><div><span className="eyebrow">SCOPE</span><h2>{scopeName}</h2></div><div className="segmented"><button className={mode === "graph" ? "selected" : ""} onClick={() => setMode("graph")}><GitBranch size={15} />关系图</button><button className={mode === "timeline" ? "selected" : ""} onClick={() => setMode("timeline")}><List size={15} />时间线</button></div></div>
          <label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前范围的记忆" /></label>
          <div className="memory-visual">{mode === "graph" ? <MemoryGraphCanvas graph={graph} selectedId={selectedId} onSelect={setSelectedId} /> : <MemoryTimelineView timeline={timeline} selectedId={selectedId} onSelect={setSelectedId} />}</div>
          {(selectedMemory || selectedEvent) && <div className="memory-detail"><strong>{selectedMemory?.text || selectedEvent?.body}</strong><span>来源事件</span><div>{(selectedMemory?.sourceEventIds || (selectedEvent ? [selectedEvent.id] : [])).map((eventId) => <button key={eventId} onClick={() => onEventSelect(eventId)}>#{state.events.find((event) => event.id === eventId)?.sequence || "?"} 查看原始事件</button>)}</div></div>}
        </section>
        <aside className="memory-create panel"><span className="eyebrow">ADD MEMORY</span><h3>添加候选记忆</h3><p>记忆必须引用一条真实事件。这里手动录入用于验证接口，自动整理 agent 后续接入。</p><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="这条记忆记录了什么？" rows={5} /><select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">选择来源事件</option>{[...state.events].reverse().map((event) => <option key={event.id} value={event.id}>#{event.sequence} · {event.actorId} · {event.body.slice(0, 35)}</option>)}</select><button className="primary-button" disabled={!draft.trim() || !sourceId} onClick={() => { onRemember(scopeId, draft, [sourceId]); setDraft(""); setSourceId(""); }}><Plus size={16} />保存候选记忆</button></aside>
      </div>
    </div>
  );
}
