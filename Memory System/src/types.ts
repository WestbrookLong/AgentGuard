export type Route = "chat" | "history" | "memory" | "memory-data" | "logs" | "settings";
export type ThemeMode = "light" | "dark" | "system";

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  modality: string;
  token_estimate: number;
  metadata_json: string;
  created_at: string;
  session_title?: string;
}

export interface Session {
  id: string;
  title: string;
  started_at: string;
  ended_at?: string;
  message_count: number;
  last_message_at?: string;
  preview?: string;
}

export interface Settings {
  petName: string;
  themeMode: ThemeMode;
  chatBaseUrl: string;
  transcriptionBaseUrl: string;
  chatModel: string;
  transcriptionModel: string;
  memoryModel: string;
  compressionModel: string;
  contextWindowTokens: string;
  reservedOutputTokens: string;
  contextSoftThreshold: string;
  contextTargetRatio: string;
  memoryBatchSize: string;
  embeddingEnabled: boolean;
  remoteEmbeddingConsent: boolean;
  embeddingBaseUrl: string;
  embeddingModel: string;
  embeddingDimension: string;
  embeddingBatchSize: string;
  hybridRetrievalEnabled: boolean;
  rerankerEnabled: boolean;
  rerankerModel: string;
  rerankerTimeoutMs: string;
  claimSemanticGovernanceEnabled: boolean;
  temperature: string;
  autoSpeak: boolean;
  petServerPort: string;
  petServerExternalUrl: string;
  agentEnabled: boolean;
  agentWorkspaceRoot: string;
  agentMaxSteps: string;
  agentTimeoutSeconds: string;
  agentAllowedExecutables: string;
  agentDirectoryGrants: DirectoryGrant[];
  systemPrompt: string;
  hasApiKey: boolean;
  apiKey?: string;
}

export interface Dashboard {
  messages: number;
  events: number;
  memories: number;
  candidates: number;
  claimSlots: number;
  claimTransitions: number;
  logs: number;
  retrievals: number;
  retrievalStages: number;
  contextSnapshots: number;
  memoryExtractions: number;
  contextCompactions: number;
  topics: number;
  openLoops: number;
  continuityUpdates: number;
  topicHealthWarnings: number;
  topicRebuilds: number;
  topicMergeCandidates: number;
  continuityFeedback: number;
  continuityEvalRuns: number;
  agentTasks: number;
  agentRuns: number;
  toolExecutions: number;
  approvals: number;
  capabilityGrants: number;
  embeddings: number;
  embeddingJobs: number;
  claimNeighborCandidates: number;
  memoryGovernanceActions: number;
  databasePath: string;
}

export type MemoryNodeType = "identity" | "claim" | "slot" | "topic" | "topic_item" | "open_loop" | "event" | "state" | "retrieval" | "governance";

export interface MemoryVisualNode {
  id: string;
  rawId: string;
  type: MemoryNodeType;
  label: string;
  summary?: string;
  status?: string;
  temporalState?: string;
  epistemicBasis?: string;
  confidence?: number;
  start?: string | null;
  end?: string | null;
  date?: string | null;
  hidden?: boolean;
  synthetic?: boolean;
  meta?: Record<string, unknown>;
}

export interface MemoryVisualEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
  confidence?: number;
  date?: string;
  inferred?: boolean;
  directed?: boolean;
}

export interface MemoryGraph {
  generatedAt: string;
  mode: "local" | "global" | "developer";
  focusId: string;
  asOf?: string | null;
  nodes: MemoryVisualNode[];
  edges: MemoryVisualEdge[];
  truncated: boolean;
  totals: { nodes: number; edges: number };
}

export interface MemoryOverview {
  generatedAt: string;
  asOf?: string | null;
  stats: {
    currentClaims: number;
    disputedClaims: number;
    candidateClaims: number;
    activeTopics: number;
    openLoops: number;
    hidden: number;
    pendingNeighbors: number;
  };
  groupedClaims: Record<string, Array<Record<string, unknown>>>;
  topics: Array<Record<string, unknown>>;
  openLoops: Array<Record<string, unknown>>;
  days: Array<Record<string, unknown>>;
  states: Array<Record<string, unknown>>;
  recentChanges: Array<Record<string, unknown>>;
  reviewQueue: Array<Record<string, unknown>>;
}

export interface MemoryTimelineEntry {
  id: string;
  rawId: string;
  track: "events" | "topics" | "claims" | "open_loops" | "changes";
  type: MemoryNodeType;
  label: string;
  status?: string;
  temporalState?: string;
  epistemicBasis?: string;
  start: string;
  end?: string | null;
  meta?: Record<string, unknown>;
}

export interface MemoryTimeline {
  generatedAt: string;
  from: string | null;
  to: string | null;
  entries: MemoryTimelineEntry[];
}

export interface MemoryTrace {
  type: "retrieval";
  id: string;
  retrieval: Record<string, unknown> & {
    query: string;
    mode: string;
    score_version: string;
    created_at: string;
    route: Record<string, unknown>;
  };
  userMessage?: Message | null;
  assistantMessage?: Message | null;
  claims: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  topics: Array<Record<string, unknown>>;
  topicItems: Array<Record<string, unknown>>;
  openLoops: Array<Record<string, unknown>>;
  stages: Array<Record<string, unknown>>;
  caveat: string;
}

export interface Bootstrap {
  settings: Settings;
  session: Session;
  messages: Message[];
  sessions: Session[];
  dashboard: Dashboard;
}

export interface ChatResult {
  userMessage: Message;
  assistantMessage: Message;
  retrieval: {
    id: string;
    tokenEstimate: number;
    selectedClaimIds: string[];
    selectedEventIds: string[];
  };
  dashboard: Dashboard;
  sessions: Session[];
}

export interface ChatStreamEvent {
  requestId: string;
  reasoningContentDelta?: string;
  contentDelta?: string;
  agentEvent?: AgentEvent;
}

export interface AgentToolEvent {
  type: "tool_started" | "tool_completed";
  step: number;
  tool_call_id: string;
  tool: string;
  arguments?: Record<string, unknown>;
  result?: {
    ok: boolean;
    summary?: string;
    error?: string;
    duration_ms?: number;
    provenance?: Record<string, unknown>;
  };
}

export interface AgentApprovalEvent {
  type: "approval_required" | "approval_resolved";
  approval_id: string;
  step?: number;
  tool_call_id?: string;
  tool?: string;
  operation?: string;
  risk?: "medium" | "high";
  resource_kind?: "path" | "command";
  requested_path?: string;
  suggested_root?: string;
  sensitive?: boolean;
  reason?: string;
  preview?: {
    path?: string;
    kind?: string;
    diff?: string;
    diff_truncated?: boolean;
    proposed_chars?: number;
    existing_content_unavailable?: boolean;
    proposed_preview?: string;
    proposed_preview_truncated?: boolean;
  };
  command?: { executable: string; args: string[]; cwd: string; signature: string };
  decision?: string;
}

export type AgentEvent = AgentToolEvent | AgentApprovalEvent;

export interface DirectoryGrant {
  id: string;
  root_path: string;
  operations: string[];
  scope: string;
  allow_sensitive: boolean;
  expires_at?: string | null;
}

export interface StreamingResponse {
  requestId: string;
  reasoningContent: string;
  content: string;
  startedAt: number;
  activities: AgentToolEvent[];
  approvals: AgentApprovalEvent[];
}

export interface VoicePayload {
  bytes: ArrayBuffer;
  mimeType: string;
}

export interface PetApi {
  bootstrap(): Promise<Bootstrap>;
  sendMessage(payload: { requestId: string; sessionId: string; text: string; modality: "text" | "voice"; deep?: boolean }): Promise<ChatResult>;
  cancelChat(requestId: string): Promise<{ cancelled: boolean }>;
  resolveAgentApproval(payload: { requestId: string; approvalId: string; decision: "approve" | "deny"; scope?: "once" | "task"; chooseDirectory?: boolean }): Promise<{ resolved: boolean; decision: string }>;
  agentRuntimeHealth(): Promise<{ ok: boolean; runtime_version: string; protocol: number; mode: string; capabilities: string[] }>;
  addAgentDirectory(): Promise<{ cancelled: boolean; grants: DirectoryGrant[] }>;
  revokeAgentGrant(id: string): Promise<{ grants: DirectoryGrant[] }>;
  onChatStream(callback: (event: ChatStreamEvent) => void): () => void;
  onMobileSync(callback: (event: MobileSyncEvent) => void): () => void;
  syncChatState(sessionId: string): Promise<{ messages: Message[]; sessions: Session[]; dashboard: Dashboard }>;
  newChat(): Promise<{ session: Session; messages: Message[]; sessions: Session[] }>;
  switchSession(sessionId: string): Promise<{ session: Session; messages: Message[]; sessions: Session[] }>;
  renameSession(payload: { sessionId: string; title: string }): Promise<{ session: Session; sessions: Session[] }>;
  deleteSession(sessionId: string): Promise<{ session: Session; messages: Message[]; sessions: Session[] }>;
  transcribe(payload: VoicePayload): Promise<{ text: string }>;
  getRecords(payload: { type: string; search?: string; limit?: number }): Promise<Record<string, unknown>[]>;
  getDashboard(): Promise<Dashboard>;
  consolidate(date?: string): Promise<Record<string, unknown>>;
  scanTopics(): Promise<{ candidateIds: string[]; adjudications: Record<string, unknown>[] }>;
  reindexEmbeddings(): Promise<{ queued: number; processed: number; failed: number }>;
  scanClaimNeighbors(): Promise<{ candidateIds: string[]; adjudications: Record<string, unknown>[] }>;
  getMemoryOverview(payload?: { asOf?: string | null }): Promise<MemoryOverview>;
  getMemoryGraph(payload?: { focusId?: string; depth?: number; mode?: "local" | "global" | "developer"; includeSimilarity?: boolean; includeRetrieval?: boolean; asOf?: string | null; limit?: number }): Promise<MemoryGraph>;
  getMemoryTimeline(payload?: { from?: string | null; to?: string | null; limit?: number }): Promise<MemoryTimeline>;
  getMemoryNodeDetail(nodeId: string): Promise<Record<string, unknown> | null>;
  getMemoryTrace(payload: { messageId?: string; retrievalId?: string }): Promise<MemoryTrace | null>;
  getMemoryDiagnostics(): Promise<Record<string, unknown>>;
  governMemory(payload: { action: "confirm" | "correct" | "hide" | "unhide" | "delete"; objectType: string; objectId: string; correctedText?: string; reason?: string }): Promise<Record<string, unknown>>;
  evaluateContinuity(): Promise<{ runId: string; recommendation: { action: string; safe: boolean } }>;
  continuityProfileAction(payload: { action: "stage" | "promote"; profileId: string }): Promise<{ applied: boolean; reason?: string }>;
  openExternal(url: string): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Partial<Settings>): Promise<Settings>;
  testConnection(settings: Partial<Settings>): Promise<{ ok: boolean }>;
  createMobilePairing(): Promise<{ id: string; expiresAt: string; uri: string; qrDataUrl: string; serverUrl: string }>;
  getMobilePairingState(): Promise<MobilePairingState>;
  confirmMobilePairing(payload: { id: string; approved: boolean }): Promise<{ status: string; deviceId?: string }>;
  revokeMobileDevice(id: string): Promise<{ revoked: boolean }>;
}

export interface MobileSyncEvent {
  id?: number;
  type: string;
  data?: {
    sessionId?: string;
    clientType?: "android" | "desktop";
    [key: string]: unknown;
  };
}

export interface MobileDevice {
  id: string;
  name: string;
  platform: string;
  status: string;
  tool_profile: string;
  client_version?: string | null;
  paired_at: string;
  last_seen_at?: string | null;
  revoked_at?: string | null;
}

export interface MobilePairingState {
  server: { host: string; port: number; localUrl: string; externalUrl: string };
  tunnel: {
    running: boolean;
    status: "stopped" | "downloading" | "connecting" | "online" | "error";
    url: string;
    error: string;
    automatic: boolean;
  };
  pairings: Array<{
    id: string;
    expiresAt: string;
    status: string;
    device?: { name: string; platform: string; clientVersion?: string } | null;
  }>;
  devices: MobileDevice[];
}
