import { AlertCircle, CheckCircle2 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { DataInspector } from "./components/DataInspector";
import { MemoryTraceDrawer } from "./components/MemoryTraceDrawer";
import { Navigation } from "./components/Navigation";
import { PetStage } from "./components/PetStage";
import { SettingsView } from "./components/SettingsView";
import { useVoiceConversation } from "./hooks/useVoiceConversation";
import { watchThemeMode } from "./theme";
import type { Bootstrap, Dashboard, Message, Route, Session, Settings, StreamingResponse } from "./types";

const MemoryAtlas = lazy(() => import("./components/MemoryAtlas").then((module) => ({ default: module.MemoryAtlas })));

interface Toast {
  id: number;
  message: string;
  error: boolean;
}

export default function App() {
  const [route, setRoute] = useState<Route>("chat");
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [streamingResponse, setStreamingResponse] = useState<StreamingResponse | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [switchingSession, setSwitchingSession] = useState(false);
  const [traceMessageId, setTraceMessageId] = useState<string | null>(null);
  const [memoryFocusId, setMemoryFocusId] = useState<string | null>(null);

  const notify = useCallback((message: string, error = false) => {
    const next = { id: Date.now(), message, error };
    setToast(next);
    window.setTimeout(() => setToast((current) => current?.id === next.id ? null : current), 3600);
  }, []);

  useEffect(() => {
    window.pet.bootstrap()
      .then((data) => {
        setBoot(data);
        setMessages(data.messages);
        setSessions(data.sessions);
        setSettings(data.settings);
        setDashboard(data.dashboard);
      })
      .catch((error) => notify(error instanceof Error ? error.message : String(error), true));
  }, [notify]);

  useEffect(() => window.pet.onChatStream((event) => {
    const agentEvent = event.agentEvent;
    setStreamingResponse((current) => current?.requestId === event.requestId
      ? {
        ...current,
        reasoningContent: current.reasoningContent + (event.reasoningContentDelta || ""),
        content: current.content + (event.contentDelta || ""),
        activities: agentEvent && ["tool_started", "tool_completed"].includes(agentEvent.type)
          ? [...current.activities.filter((activity) => activity.tool_call_id !== (agentEvent as typeof current.activities[number]).tool_call_id), agentEvent as typeof current.activities[number]]
          : current.activities,
        approvals: agentEvent?.type === "approval_required"
          ? [...current.approvals.filter((approval) => approval.approval_id !== agentEvent.approval_id), agentEvent]
          : agentEvent?.type === "approval_resolved"
            ? current.approvals.filter((approval) => approval.approval_id !== agentEvent.approval_id)
            : current.approvals,
      }
      : current);
  }), []);

  useEffect(() => window.pet.onMobileSync((event) => {
    if (event.type !== "chat.run.completed" || event.data?.clientType !== "android" || !boot?.session.id) return;
    void window.pet.syncChatState(boot.session.id).then((state) => {
      setMessages(state.messages);
      setSessions(state.sessions);
      setDashboard(state.dashboard);
      setBoot((current) => current ? { ...current, messages: state.messages, sessions: state.sessions } : current);
    }).catch((error) => notify(error instanceof Error ? error.message : String(error), true));
  }), [boot?.session.id, notify]);

  useEffect(() => {
    if (!settings) return undefined;
    return watchThemeMode(settings.themeMode);
  }, [settings]);

  const send = useCallback(async (text: string, modality: "text" | "voice", deep = false) => {
    if (busy) return undefined;
    const requestId = window.crypto.randomUUID();
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      session_id: boot?.session.id || "",
      role: "user",
      content: text,
      modality,
      token_estimate: 0,
      metadata_json: "{}",
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setStreamingResponse({ requestId, reasoningContent: "", content: "", activities: [], approvals: [], startedAt: Date.now() });
    setBusy(true);
    try {
      const result = await window.pet.sendMessage({ requestId, sessionId: boot?.session.id || "", text, modality, deep });
      setMessages((current) => [
        ...current.filter((message) => message.id !== tempId),
        result.userMessage,
        result.assistantMessage,
      ]);
      setDashboard(result.dashboard);
      setSessions(result.sessions);
      setBoot((current) => current ? { ...current, sessions: result.sessions } : current);
      setStreamingResponse(null);
      return result.assistantMessage.content;
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== tempId));
      setStreamingResponse(null);
      notify(error instanceof Error ? error.message : String(error), true);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [boot?.session.id, busy, notify]);

  const cancel = useCallback(async () => {
    if (streamingResponse?.requestId) await window.pet.cancelChat(streamingResponse.requestId);
  }, [streamingResponse?.requestId]);

  const resolveApproval = useCallback(async (approvalId: string, decision: "approve" | "deny", scope: "once" | "task" = "once", chooseDirectory = false) => {
    if (!streamingResponse?.requestId) return;
    try {
      await window.pet.resolveAgentApproval({ requestId: streamingResponse.requestId, approvalId, decision, scope, chooseDirectory });
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    }
  }, [notify, streamingResponse?.requestId]);

  const voice = useVoiceConversation({
    autoSpeak: settings?.autoSpeak ?? true,
    onTranscript: (text) => send(text, "voice"),
    onError: (message) => notify(message, true),
  });

  const newChat = async () => {
    if (busy || switchingSession) return;
    try {
      const result = await window.pet.newChat();
      setMessages(result.messages);
      setSessions(result.sessions);
      setBoot((current) => current ? { ...current, session: result.session, messages: result.messages, sessions: result.sessions } : current);
      setRoute("chat");
      setDashboard(await window.pet.getDashboard());
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    }
  };

  const switchChat = async (sessionId: string) => {
    if (busy || switchingSession || sessionId === boot?.session.id) return;
    setSwitchingSession(true);
    try {
      const result = await window.pet.switchSession(sessionId);
      setMessages(result.messages);
      setSessions(result.sessions);
      setStreamingResponse(null);
      setBoot((current) => current ? { ...current, session: result.session, messages: result.messages, sessions: result.sessions } : current);
      setRoute("chat");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setSwitchingSession(false);
    }
  };

  const renameChat = async (sessionId: string, title: string) => {
    if (busy || switchingSession) return;
    try {
      const result = await window.pet.renameSession({ sessionId, title });
      setSessions(result.sessions);
      setBoot((current) => current ? {
        ...current,
        session: current.session.id === sessionId ? { ...current.session, title: result.session.title } : current.session,
        sessions: result.sessions,
      } : current);
      notify("会话已重命名。");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    }
  };

  const deleteChat = async (sessionId: string) => {
    if (busy || switchingSession) return;
    setSwitchingSession(true);
    try {
      const result = await window.pet.deleteSession(sessionId);
      setMessages(result.messages);
      setSessions(result.sessions);
      setStreamingResponse(null);
      setBoot((current) => current ? {
        ...current, session: result.session, messages: result.messages, sessions: result.sessions,
      } : current);
      setRoute("chat");
      notify("会话已删除，长期记忆已保留。");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setSwitchingSession(false);
    }
  };

  if (!boot || !settings || !dashboard) {
    return <div className="app-loading"><span /><span /><span /></div>;
  }

  return (
    <div className="app-shell">
      <Navigation route={route} onRoute={setRoute} onNewChat={() => void newChat()} />

      {route === "chat" && (
        <main className="conversation-view">
          <PetStage
            name={settings.petName}
            status={busy && voice.status === "idle" ? "thinking" : voice.status}
            level={voice.level}
            continuous={voice.continuous}
            onMic={() => void voice.toggleManual()}
            onContinuous={(enabled) => void voice.setContinuous(enabled)}
            disabled={busy && voice.status === "idle"}
          />
          <ChatPanel
            messages={messages}
            sessions={sessions}
            currentSessionId={boot.session.id}
            busy={busy}
            switchingSession={switchingSession}
            streamingResponse={streamingResponse}
            onSend={(text, deep) => send(text, "text", deep).then(() => undefined)}
            onMic={() => void voice.toggleManual()}
            onCancel={() => void cancel()}
            onSessionSelect={(sessionId) => void switchChat(sessionId)}
            onSessionRename={renameChat}
            onSessionDelete={deleteChat}
            onResolveApproval={(approvalId, decision, scope, chooseDirectory) => void resolveApproval(approvalId, decision, scope, chooseDirectory)}
            onOpenMemoryTrace={setTraceMessageId}
          />
          <div className="dev-stats" aria-label="开发状态">
            <span><b>{dashboard.events}</b> 事件</span>
            <span><b>{dashboard.memories}</b> 记忆</span>
            <span><b>{dashboard.retrievals}</b> 检索</span>
          </div>
        </main>
      )}

      {route === "history" && (
        <DataInspector kind="history" dashboard={dashboard} onDashboard={setDashboard} notify={notify} />
      )}
      {route === "memory" && (
        <Suspense fallback={<div className="app-loading"><span /><span /><span /></div>}>
          <MemoryAtlas
            initialNodeId={memoryFocusId}
            onOpenData={() => setRoute("memory-data")}
            notify={notify}
            onDashboardRefresh={async () => setDashboard(await window.pet.getDashboard())}
          />
        </Suspense>
      )}
      {route === "memory-data" && (
        <DataInspector kind="memory" dashboard={dashboard} onDashboard={setDashboard} notify={notify} />
      )}
      {route === "logs" && (
        <DataInspector kind="logs" dashboard={dashboard} onDashboard={setDashboard} notify={notify} />
      )}
      {route === "settings" && (
        <SettingsView settings={settings} onSaved={setSettings} notify={notify} />
      )}

      {toast && (
        <div className={`toast ${toast.error ? "error" : "success"}`} role="status">
          {toast.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          {toast.message}
        </div>
      )}
      <MemoryTraceDrawer
        messageId={traceMessageId}
        onClose={() => setTraceMessageId(null)}
        onOpenNode={(nodeId) => {
          setTraceMessageId(null);
          setMemoryFocusId(nodeId);
          setRoute("memory");
        }}
      />
    </div>
  );
}
