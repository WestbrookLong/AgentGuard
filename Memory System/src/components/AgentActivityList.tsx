import { CheckCircle2, FileSearch, FolderOpen, Globe2, LoaderCircle, Search, XCircle } from "lucide-react";
import type { AgentToolEvent } from "../types";

interface Props { activities: AgentToolEvent[]; }

const labels: Record<string, string> = {
  web_search: "搜索网页",
  web_read: "读取网页",
  filesystem_list: "查看文件",
  filesystem_read: "读取文件",
  filesystem_search: "搜索文件",
  filesystem_write: "写入文件",
  filesystem_replace: "修改文件",
  filesystem_create_directory: "创建目录",
  process_execute: "执行命令",
};

function ToolIcon({ tool }: { tool: string }) {
  if (tool === "web_search") return <Search size={14} />;
  if (tool === "web_read") return <Globe2 size={14} />;
  if (tool === "filesystem_list") return <FolderOpen size={14} />;
  return <FileSearch size={14} />;
}

function detail(activity: AgentToolEvent) {
  const args = activity.arguments || {};
  return String(args.query || args.url || args.path || args.executable || activity.result?.summary || "Agent 操作");
}

export function AgentActivityList({ activities }: Props) {
  if (!activities.length) return null;
  return (
    <div className="agent-activities" aria-label="Agent 工具活动">
      {activities.map((activity) => {
        const complete = activity.type === "tool_completed";
        const ok = activity.result?.ok !== false;
        return (
          <div className={`agent-activity ${complete ? (ok ? "complete" : "failed") : "running"}`} key={activity.tool_call_id}>
            <ToolIcon tool={activity.tool} />
            <div>
              <strong>{labels[activity.tool] || activity.tool}</strong>
              <span title={detail(activity)}>{detail(activity)}</span>
            </div>
            {!complete ? <LoaderCircle className="spin" size={14} /> : ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          </div>
        );
      })}
    </div>
  );
}
