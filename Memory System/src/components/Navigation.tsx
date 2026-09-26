import { Bug, Database, MessageCircle, Plus, Settings, Sparkles } from "lucide-react";
import type { Route } from "../types";

interface Props {
  route: Route;
  onRoute: (route: Route) => void;
  onNewChat: () => void;
}

const routes: Array<{ id: Route; label: string; icon: typeof MessageCircle }> = [
  { id: "chat", label: "对话", icon: MessageCircle },
  { id: "history", label: "记录", icon: Database },
  { id: "memory", label: "记忆", icon: Sparkles },
  { id: "logs", label: "日志", icon: Bug },
];

export function Navigation({ route, onRoute, onNewChat }: Props) {
  return (
    <nav className="nav-rail" aria-label="主导航">
      <button className="brand-mark" title="Pet" onClick={() => onRoute("chat")}>
        P
      </button>
      <button className="nav-action" title="新对话" onClick={onNewChat}>
        <Plus size={20} />
      </button>
      <div className="nav-items">
        {routes.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${route === id || (id === "memory" && route === "memory-data") ? "active" : ""}`}
            title={label}
            aria-label={label}
            onClick={() => onRoute(id)}
          >
            <Icon size={20} strokeWidth={1.8} />
          </button>
        ))}
      </div>
      <button
        className={`nav-item nav-settings ${route === "settings" ? "active" : ""}`}
        title="设置"
        aria-label="设置"
        onClick={() => onRoute("settings")}
      >
        <Settings size={20} strokeWidth={1.8} />
      </button>
    </nav>
  );
}
