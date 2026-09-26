import { ArrowUp, BrainCircuit, Check, ChevronDown, Mic, Pencil, Search, Square, Trash2 } from "lucide-react";
import { FormEvent, KeyboardEvent, lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Message, Session, StreamingResponse } from "../types";
import { ReasoningPanel } from "./ReasoningPanel";
import { AgentActivityList } from "./AgentActivityList";
import { AgentApprovalCards } from "./AgentApprovalCard";

const MarkdownMessage = lazy(() => import("./MarkdownMessage").then((module) => ({
  default: module.MarkdownMessage,
})));

interface Props {
  messages: Message[];
  sessions: Session[];
  currentSessionId: string;
  busy: boolean;
  switchingSession: boolean;
  streamingResponse: StreamingResponse | null;
  onSend: (text: string, deep?: boolean) => Promise<void>;
  onMic: () => void;
  onCancel: () => void;
  onSessionSelect: (sessionId: string) => void;
  onSessionRename: (sessionId: string, title: string) => Promise<void>;
  onSessionDelete: (sessionId: string) => Promise<void>;
  onResolveApproval: (approvalId: string, decision: "approve" | "deny", scope?: "once" | "task", chooseDirectory?: boolean) => void;
  onOpenMemoryTrace: (messageId: string) => void;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatSessionTime(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function messageReasoning(message: Message) {
  try {
    const metadata = JSON.parse(message.metadata_json || "{}");
    return {
      content: String(metadata.reasoningContent || ""),
      durationMs: Number(metadata.reasoningDurationMs || 0),
    };
  } catch {
    return { content: "", durationMs: 0 };
  }
}

function hasMemoryTrace(message: Message) {
  try {
    return Boolean(JSON.parse(message.metadata_json || "{}").retrievalId);
  } catch {
    return false;
  }
}

export function ChatPanel({
  messages, sessions, currentSessionId, busy, switchingSession, streamingResponse,
  onSend, onMic, onCancel, onSessionSelect, onSessionRename, onSessionDelete, onResolveApproval, onOpenMemoryTrace,
}: Props) {
  const [text, setText] = useState("");
  const [deep, setDeep] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionContext, setSessionContext] = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ sessionId: string; originalTitle: string; title: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sessionPickerRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const stickToBottomRef = useRef(true);
  const initializedRef = useRef(false);
  const interactionLocked = busy || switchingSession;

  useEffect(() => {
    initializedRef.current = false;
    stickToBottomRef.current = true;
    setText("");
    setDeep(false);
    setSessionOpen(false);
    setSessionContext(null);
    setRenameDialog(null);
  }, [currentSessionId]);

  useEffect(() => {
    if (!renameDialog) return undefined;
    const frame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renameDialog?.sessionId]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || (initializedRef.current && !stickToBottomRef.current)) return;

    const frame = window.requestAnimationFrame(() => {
      list.scrollTo({
        top: list.scrollHeight,
        behavior: initializedRef.current && !streamingResponse ? "smooth" : "auto",
      });
      initializedRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentSessionId, messages.length, busy, streamingResponse?.reasoningContent.length, streamingResponse?.content.length, streamingResponse?.activities.length, streamingResponse?.approvals.length]);

  useEffect(() => {
    if (!sessionOpen) return undefined;
    const closeOnOutside = (event: PointerEvent) => {
      if (!sessionPickerRef.current?.contains(event.target as Node)) {
        setSessionOpen(false);
        setSessionContext(null);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setSessionOpen(false);
        setSessionContext(null);
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [sessionOpen]);

  const updateScrollPosition = () => {
    const list = listRef.current;
    if (!list) return;
    stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 72;
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const value = text.trim();
    if (!value || interactionLocked) return;
    stickToBottomRef.current = true;
    setText("");
    await onSend(value, deep);
    setDeep(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const contextSession = sessions.find((session) => session.id === sessionContext?.sessionId);

  const openRenameDialog = () => {
    if (!contextSession) return;
    setRenameDialog({
      sessionId: contextSession.id,
      originalTitle: contextSession.title,
      title: contextSession.title,
    });
    setSessionContext(null);
    setSessionOpen(false);
  };

  const submitRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renameDialog) return;
    const title = renameDialog.title.trim();
    if (!title || title === renameDialog.originalTitle) {
      setRenameDialog(null);
      return;
    }
    const sessionId = renameDialog.sessionId;
    setRenameDialog(null);
    await onSessionRename(sessionId, title);
  };

  const deleteContextSession = async () => {
    if (!contextSession) return;
    setSessionContext(null);
    const confirmed = window.confirm(`确定删除会话“${contextSession.title}”吗？\n\n只会删除这段会话及其消息，已经形成的长期记忆不会被删除。`);
    if (!confirmed) return;
    setSessionOpen(false);
    await onSessionDelete(contextSession.id);
  };

  return (
    <section className="chat-panel">
      <header className="panel-header">
        <div className="chat-header-left">
          <div className="session-title-row">
            <h1>对话</h1>
            <div className="session-picker" ref={sessionPickerRef}>
              <button
                type="button"
                className={`session-picker-trigger ${sessionOpen ? "open" : ""}`}
                aria-haspopup="listbox"
                aria-expanded={sessionOpen}
                disabled={interactionLocked}
                onClick={() => setSessionOpen((value) => !value)}
              >
                <span>{switchingSession ? "正在切换…" : currentSession?.title || "历史会话"}</span>
                <ChevronDown size={14} />
              </button>
              {sessionOpen && (
                <div className="session-menu" role="listbox" aria-label="历史会话">
                  {sessions.map((session) => {
                    const active = session.id === currentSessionId;
                    return (
                      <button
                        type="button"
                        className={`session-option ${active ? "active" : ""}`}
                        key={session.id}
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          setSessionContext(null);
                          setSessionOpen(false);
                          if (!active) onSessionSelect(session.id);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSessionContext({
                            sessionId: session.id,
                            x: Math.min(event.clientX, window.innerWidth - 170),
                            y: Math.min(event.clientY, window.innerHeight - 100),
                          });
                        }}
                      >
                        <span className="session-option-check">{active && <Check size={14} />}</span>
                        <span className="session-option-body">
                          <strong>{session.title}</strong>
                          <small>{formatSessionTime(session.last_message_at || session.started_at)} · {session.message_count} 条消息</small>
                          {session.preview && <span>{session.preview.replace(/\s+/g, " ")}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {sessionOpen && sessionContext && contextSession && (
                <div
                  className="session-context-menu"
                  role="menu"
                  aria-label={`${contextSession.title} 会话操作`}
                  style={{ left: sessionContext.x, top: sessionContext.y }}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <button type="button" role="menuitem" onClick={openRenameDialog}>
                    <Pencil size={14} />
                    重命名
                  </button>
                  <button type="button" role="menuitem" className="danger" onClick={() => void deleteContextSession()}>
                    <Trash2 size={14} />
                    删除会话
                  </button>
                </div>
              )}
            </div>
          </div>
          <span className="message-count">{messages.length} 条消息</span>
        </div>
        <button
          className={`deep-toggle ${deep ? "active" : ""}`}
          title="深度回忆"
          onClick={() => setDeep((current) => !current)}
        >
          <Search size={16} />
          深度回忆
        </button>
      </header>

      {renameDialog && (
        <div
          className="session-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRenameDialog(null);
          }}
        >
          <form className="session-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="session-rename-title" onSubmit={submitRename}>
            <h2 id="session-rename-title">重命名会话</h2>
            <label htmlFor="session-rename-input">会话名称</label>
            <input
              ref={renameInputRef}
              id="session-rename-input"
              value={renameDialog.title}
              maxLength={80}
              onChange={(event) => setRenameDialog((current) => current ? { ...current, title: event.target.value } : null)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setRenameDialog(null);
                }
              }}
            />
            <div className="session-dialog-actions">
              <button type="button" onClick={() => setRenameDialog(null)}>取消</button>
              <button type="submit" className="primary" disabled={!renameDialog.title.trim()}>保存</button>
            </div>
          </form>
        </div>
      )}

      <div ref={listRef} className="message-list" onScroll={updateScrollPosition}>
        {messages.map((message) => {
          const reasoning = message.role === "assistant" ? messageReasoning(message) : null;
          return (
            <article key={message.id} className={`message ${message.role}`}>
              <div className="message-meta">
                <span>{message.role === "user" ? "你" : "Pet"}</span>
                <time>{formatTime(message.created_at)}</time>
                {message.modality === "voice" && <Mic size={13} />}
                {message.role === "assistant" && hasMemoryTrace(message) && (
                  <button className="message-memory-button" title="查看本次回复的记忆上下文" onClick={() => onOpenMemoryTrace(message.id)}>
                    <BrainCircuit size={13} />
                  </button>
                )}
              </div>
              {reasoning?.content && <ReasoningPanel content={reasoning.content} durationMs={reasoning.durationMs} />}
              {message.role === "assistant"
                ? (
                  <Suspense fallback={<p>{message.content}</p>}>
                    <MarkdownMessage content={message.content} />
                  </Suspense>
                )
                : <p>{message.content}</p>}
            </article>
          );
        })}
        {busy && streamingResponse && (streamingResponse.reasoningContent || streamingResponse.content || streamingResponse.activities.length || streamingResponse.approvals.length) && (
          <article className="message assistant streaming-message">
            <div className="message-meta"><span>Pet</span><time>正在回答</time></div>
            <ReasoningPanel
              content={streamingResponse.reasoningContent}
              active
              answerStarted={Boolean(streamingResponse.content)}
              startedAt={streamingResponse.startedAt}
            />
            <AgentActivityList activities={streamingResponse.activities} />
            <AgentApprovalCards approvals={streamingResponse.approvals} onResolve={onResolveApproval} />
            {streamingResponse.content && (
              <Suspense fallback={<p>{streamingResponse.content}</p>}>
                <MarkdownMessage content={streamingResponse.content} />
              </Suspense>
            )}
          </article>
        )}
        {busy && !streamingResponse?.reasoningContent && !streamingResponse?.content && !streamingResponse?.activities.length && !streamingResponse?.approvals.length && (
          <div className="thinking-row" aria-label="正在思考">
            <span /><span /><span />
          </div>
        )}
      </div>

      <form className="composer" onSubmit={submit}>
        <textarea
          value={text}
          rows={1}
          placeholder="输入消息"
          aria-label="输入消息"
          disabled={interactionLocked}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="composer-icon" title="语音输入" onClick={onMic} disabled={interactionLocked}>
          <Mic size={19} />
        </button>
        {busy
          ? <button type="button" className="send-button cancel-run" title="停止 Agent" onClick={onCancel}><Square size={15} /></button>
          : <button type="submit" className="send-button" title="发送" disabled={interactionLocked || !text.trim()}><ArrowUp size={19} /></button>}
      </form>
    </section>
  );
}
