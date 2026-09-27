import type { GroupState, GuardReview, ProposedAction } from "./model";

export interface APIConfig {
  provider: "qwen";
  configured: boolean;
  default_model: string;
  base_url: string;
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, body === undefined ? undefined : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("本地 Python API 未运行。请在 prototype 目录执行 python local_api.py");
  }
  let data: Record<string, unknown>;
  try { data = await response.json() as Record<string, unknown>; }
  catch { throw new Error("本地 Python API 返回格式不正确；请确认服务已启动"); }
  if (!response.ok) throw new Error(String(data.error || `API 请求失败 (${response.status})`));
  return data as T;
}

export const api = {
  config: () => request<APIConfig>("/api/config"),
  saveConfig: (apiKey: string, defaultModel: string, baseUrl: string) => request<APIConfig>("/api/config", { ...(apiKey.trim() ? { api_key: apiKey } : {}), default_model: defaultModel, base_url: baseUrl }),
  testConnection: () => request<{ ok: boolean }>("/api/test-connection", {}),
  policy: () => request<{ policy_id: string; text: string }>("/api/policy"),
  invoke: (state: GroupState, agentId: string, triggerEventId: string, threadRootId?: string) => request<{ actions: ProposedAction[]; model: string }>("/api/invoke", { state, agent_id: agentId, trigger_event_id: triggerEventId, ...(threadRootId ? { thread_root_id: threadRootId } : {}) }),
  uploadEvidence: (filename: string, content: string) => request<{ evidence_id: string; filename: string; sha256: string; claims: Record<string, unknown>; verification: { verified: boolean; reason: string } }>("/api/evidence/upload", { filename, content }),
  resetSimulation: () => request<{ ok: boolean }>("/api/sim/reset", {}),
  ledger: () => request<{ refunds: Array<{ refund_id: string; order_id: string; amount: number; currency: string }> }>("/api/sim/ledger"),
  reviewRoom: (state: GroupState, mode: "observe" | "enforce" = "observe") => request<GuardReview>("/api/guard/review", { state, mode }),
};
