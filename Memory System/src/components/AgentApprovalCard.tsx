import { AlertTriangle, Check, FolderOpen, ShieldAlert, X } from "lucide-react";
import type { AgentApprovalEvent } from "../types";

interface Props {
  approvals: AgentApprovalEvent[];
  onResolve: (approvalId: string, decision: "approve" | "deny", scope?: "once" | "task", chooseDirectory?: boolean) => void;
}

function title(approval: AgentApprovalEvent) {
  if (approval.operation === "execute") return "请求执行命令";
  if (approval.operation === "write") return "请求写入文件";
  if (approval.operation === "sensitive_read") return "请求读取敏感内容";
  return "请求读取外部目录";
}

export function AgentApprovalCards({ approvals, onResolve }: Props) {
  if (!approvals.length) return null;
  return <div className="agent-approvals">{approvals.map((approval) => (
    <section className={`agent-approval ${approval.risk === "high" ? "high-risk" : ""}`} key={approval.approval_id}>
      <header>
        {approval.risk === "high" ? <ShieldAlert size={17} /> : <AlertTriangle size={17} />}
        <strong>{title(approval)}</strong>
      </header>
      {approval.command
        ? <pre>{approval.command.executable} {approval.command.args.join(" ")}\n{approval.command.cwd}</pre>
        : <code>{approval.requested_path}</code>}
      {approval.reason && <p>{approval.reason}</p>}
      {approval.preview?.existing_content_unavailable && <p>现有文件尚未获得读取授权，当前只能展示拟写入内容规模。</p>}
      {approval.preview?.proposed_preview && <pre className="approval-diff">{approval.preview.proposed_preview}</pre>}
      {approval.preview?.diff && <pre className="approval-diff">{approval.preview.diff}</pre>}
      <div className="approval-actions">
        <button type="button" onClick={() => onResolve(approval.approval_id, "deny")}><X size={14} />拒绝</button>
        {approval.resource_kind === "path" && approval.operation !== "write" && (
          <button type="button" onClick={() => onResolve(approval.approval_id, "approve", "task", true)}><FolderOpen size={14} />改选目录</button>
        )}
        <button type="button" onClick={() => onResolve(approval.approval_id, "approve", "once")}><Check size={14} />仅本次</button>
        {approval.operation !== "execute" && approval.operation !== "write" && <button type="button" className="primary" onClick={() => onResolve(approval.approval_id, "approve", "task")}><Check size={14} />当前任务</button>}
      </div>
    </section>
  ))}</div>;
}
