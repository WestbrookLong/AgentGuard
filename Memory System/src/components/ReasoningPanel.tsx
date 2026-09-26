import { Brain, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  content: string;
  active?: boolean;
  answerStarted?: boolean;
  startedAt?: number;
  durationMs?: number;
}

export function ReasoningPanel({ content, active = false, answerStarted = true, startedAt, durationMs }: Props) {
  const [expanded, setExpanded] = useState(active && !answerStarted);
  const [elapsed, setElapsed] = useState(durationMs || 0);
  const collapsedForAnswer = useRef(false);

  useEffect(() => {
    if (!active || answerStarted || !startedAt) return undefined;
    const update = () => setElapsed(Date.now() - startedAt);
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [active, answerStarted, startedAt]);

  useEffect(() => {
    if (active && answerStarted && !collapsedForAnswer.current) {
      collapsedForAnswer.current = true;
      setExpanded(false);
    }
  }, [active, answerStarted]);

  if (!content) return null;
  const seconds = Math.max(1, Math.round((durationMs || elapsed) / 1000));
  const label = active && !answerStarted ? `正在思考 · ${seconds} 秒` : durationMs || elapsed ? `已思考 ${seconds} 秒` : "查看思考过程";

  return (
    <div className={`reasoning-panel ${active && !answerStarted ? "active" : ""}`}>
      <button
        type="button"
        className="reasoning-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <Brain size={15} />
        <span>{label}</span>
        <ChevronDown className={expanded ? "expanded" : ""} size={15} />
      </button>
      {expanded && <div className="reasoning-content">{content}</div>}
    </div>
  );
}
