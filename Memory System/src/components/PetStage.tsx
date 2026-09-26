import { Mic, MicOff, Radio, Volume2 } from "lucide-react";
import petIcon from "../assets/pet-icon.png";
import type { VoiceStatus } from "../hooks/useVoiceConversation";

interface Props {
  name: string;
  status: VoiceStatus;
  level: number;
  continuous: boolean;
  onMic: () => void;
  onContinuous: (enabled: boolean) => void;
  disabled: boolean;
}

const statusText: Record<VoiceStatus, string> = {
  idle: "在这里",
  listening: "正在听",
  recording: "听见你了",
  transcribing: "辨认声音",
  thinking: "想一想",
  speaking: "正在说话",
  error: "需要检查",
};

export function PetStage({ name, status, level, continuous, onMic, onContinuous, disabled }: Props) {
  const active = ["listening", "recording", "transcribing", "thinking", "speaking"].includes(status);
  return (
    <section className="pet-stage">
      <header className="pet-header">
        <div>
          <span className={`presence-dot ${active ? "active" : ""}`} />
          <span>{statusText[status]}</span>
        </div>
        <span className="pet-name">{name}</span>
      </header>

      <div className={`pet-portrait state-${status}`} style={{ "--voice-level": level } as React.CSSProperties}>
        <div className="voice-ring" />
        <img src={petIcon} alt={`${name}的临时形象`} draggable={false} />
        {status === "speaking" && <Volume2 className="speaking-mark" size={22} />}
      </div>

      <div className="voice-meter" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, index) => (
          <span key={index} style={{ height: `${8 + Math.max(0, level * 34 - Math.abs(8.5 - index) * 2)}px` }} />
        ))}
      </div>

      <div className="voice-controls">
        <button
          className={`mic-button ${status === "recording" ? "recording" : ""}`}
          title={status === "recording" ? "停止录音" : "按下说话"}
          aria-label={status === "recording" ? "停止录音" : "按下说话"}
          disabled={disabled || continuous}
          onClick={onMic}
        >
          {disabled ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        <label className="continuous-control">
          <span className="continuous-icon"><Radio size={17} /></span>
          <span>持续聆听</span>
          <input
            type="checkbox"
            checked={continuous}
            disabled={disabled}
            onChange={(event) => onContinuous(event.target.checked)}
          />
          <span className="toggle" aria-hidden="true" />
        </label>
      </div>
    </section>
  );
}

