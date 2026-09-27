export type ActorId = "customer" | "human" | "system" | string;
export type EventKind = "message" | "evidence" | "case" | "policy" | "decision" | "tool" | "report" | "memory";
export type Channel = "group" | "customer";

/** A recorded tool execution. The Room keeps this as one chat item; Guard
 * expands it into a call and result when running an offline review. */
export interface ToolTrace {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  description: string;
  tools: string[];
  color: string;
  active: boolean;
  model?: string;
}

export interface RoomEvent {
  id: string;
  sequence: number;
  groupVersion: number;
  actorId: ActorId;
  kind: EventKind;
  channel: Channel;
  body: string;
  createdAt: string;
  threadId: string | null;
  basisEventIds: string[];
  recipients: string[];
  toolTrace?: ToolTrace;
}

export interface MemoryRecord {
  id: string;
  scopeId: string;
  type: "claim" | "topic" | "open_loop";
  text: string;
  sourceEventIds: string[];
  writeEventId?: string;
  createdAt: string;
  status: "candidate" | "confirmed";
}

export interface GroupState {
  roomId: string;
  version: number;
  agents: AgentDefinition[];
  routes: RouteRule[];
  events: RoomEvent[];
  memories: MemoryRecord[];
}

export interface RouteRule {
  id: string;
  on: EventKind;
  wakeAgentId: string;
}

/** Natural language configuration is drafted offline, validated, then versioned. */
export interface GroupDraft {
  description: string;
  agents: AgentDefinition[];
  routes: RouteRule[];
  assumptions: string[];
}

export interface GroupGenerator {
  propose(description: string): Promise<GroupDraft>;
}

export interface ProposedAction {
  actorId: string;
  kind: EventKind;
  channel: Channel;
  body: string;
  basisEventIds: string[];
  recipients?: string[];
  threadId?: string | null;
  toolTrace?: ToolTrace;
}

export interface AgentTurn {
  roomId: string;
  groupVersion: number;
  agentId: string;
  newEventIds: string[];
  visibleEvents: RoomEvent[];
  ownMemory: MemoryRecord[];
  roomMemory: MemoryRecord[];
}

export interface AgentAdapter {
  describe(): AgentDefinition;
  invoke(turn: AgentTurn): Promise<ProposedAction[]>;
}

export interface GuardReview {
  status: "pass" | "finding";
  findings: Array<{ eventId: string; reason: string }>;
  mode?: "observe" | "enforce";
  report?: { verdict: "safe" | "blocked" | "completed" | "incomplete"; violations: Array<{ room_event_id?: string; path_event_ids?: string[]; reason: string }> };
}

/** Offline test integration point. The live room does not consult this port. */
export interface GuardTestPort {
  review(state: GroupState): Promise<GuardReview>;
}

export const ROOM_SCOPE = "room";
