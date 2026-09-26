import { Activity, Bot, Check, FolderPlus, KeyRound, Moon, PlugZap, QrCode, Save, Smartphone, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { applyThemeMode, normalizeThemeMode } from "../theme";
import type { MobilePairingState, Settings } from "../types";

interface Props {
  settings: Settings;
  onSaved: (settings: Settings) => void;
  notify: (message: string) => void;
}

export function SettingsView({ settings, onSaved, notify }: Props) {
  const [form, setForm] = useState<Settings>({ ...settings, apiKey: "" });
  const [busy, setBusy] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [tested, setTested] = useState(false);
  const [runtime, setRuntime] = useState<{ ok: boolean; runtime_version?: string; mode?: string; error?: string } | null>(null);
  const [mobileState, setMobileState] = useState<MobilePairingState | null>(null);
  const [pairing, setPairing] = useState<{ id: string; expiresAt: string; qrDataUrl: string; serverUrl: string } | null>(null);

  useEffect(() => setForm({ ...settings, apiKey: "" }), [settings]);
  useEffect(() => () => applyThemeMode(settings.themeMode), [settings.themeMode]);
  useEffect(() => {
    window.pet.agentRuntimeHealth()
      .then((result) => setRuntime(result))
      .catch((error) => setRuntime({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => window.pet.getMobilePairingState().then((value) => {
      if (active) setMobileState(value);
    }).catch(() => undefined);
    void refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const update = (key: keyof Settings, value: string | boolean) => {
    setTested(false);
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "themeMode") applyThemeMode(normalizeThemeMode(value));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload: Partial<Settings> = { ...form };
      if (!form.apiKey) delete payload.apiKey;
      const saved = await window.pet.saveSettings(payload);
      onSaved(saved);
      notify("设置已保存。");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      await window.pet.testConnection(form);
      setTested(true);
      notify("模型接口连接正常。");
    } finally {
      setBusy(false);
    }
  };

  const addDirectory = async () => {
    const result = await window.pet.addAgentDirectory();
    setForm((current) => ({ ...current, agentDirectoryGrants: result.grants }));
  };

  const revokeDirectory = async (id: string) => {
    const result = await window.pet.revokeAgentGrant(id);
    setForm((current) => ({ ...current, agentDirectoryGrants: result.grants }));
  };

  const createPairing = async () => {
    setPairingBusy(true);
    try {
      const result = await window.pet.createMobilePairing();
      setPairing(result);
      setMobileState(await window.pet.getMobilePairingState());
      notify("公网连接已自动建立，请用 Pet Android 扫码。");
    } catch (error) {
      notify(`自动建立公网连接失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPairingBusy(false);
    }
  };

  const decidePairing = async (id: string, approved: boolean) => {
    await window.pet.confirmMobilePairing({ id, approved });
    setMobileState(await window.pet.getMobilePairingState());
    if (approved) {
      setPairing(null);
      notify("手机设备已配对。");
    }
  };

  const revokeMobileDevice = async (id: string) => {
    await window.pet.revokeMobileDevice(id);
    setMobileState(await window.pet.getMobilePairingState());
    notify("手机设备连接已撤销。");
  };

  return (
    <main className="settings-page">
      <header className="settings-header">
        <h1>设置</h1>
        <span>{settings.hasApiKey ? "模型密钥已安全保存" : "尚未配置模型密钥"}</span>
      </header>
      <form className="settings-form" onSubmit={save}>
        <section>
          <h2><Smartphone size={15} /> 手机连接</h2>
          <div className={`mobile-tunnel-status ${mobileState?.tunnel.status || "stopped"}`}>
            <div>
              <b>自动公网连接</b>
              <span>{mobileState?.tunnel.status === "online"
                ? "Cloudflare Quick Tunnel 已连接"
                : mobileState?.tunnel.status === "downloading"
                  ? "首次使用，正在准备 Cloudflare 连接组件"
                  : mobileState?.tunnel.status === "connecting"
                    ? "正在申请临时 HTTPS 公网地址"
                    : mobileState?.tunnel.status === "error"
                      ? `连接失败：${mobileState.tunnel.error}`
                      : "生成二维码时会自动建立，无需填写域名"}</span>
            </div>
            <code>{mobileState?.tunnel.url || "等待生成"}</code>
          </div>
          <div className="form-grid compact">
            <label>
              <span>本机服务端口</span>
              <input type="number" min="1024" max="65535" value={form.petServerPort} onChange={(event) => update("petServerPort", event.target.value)} />
            </label>
            <div className="mobile-server-status">
              <span>本机服务</span>
              <code>{mobileState?.server.localUrl || "正在检查…"}</code>
            </div>
          </div>
          <p className="setting-hint">Pet 会参考 FlowVoice 的方式自动复用或下载 cloudflared，并在后台创建临时 HTTPS 地址。端口修改后仍需重启 Pet；关闭 Pet 后临时公网地址会失效。</p>
          <button type="button" className="secondary-button" onClick={() => void createPairing()} disabled={pairingBusy}>
            <QrCode size={16} />{pairingBusy ? "正在建立公网连接…" : "自动连接并生成二维码"}
          </button>

          {pairing && (
            <div className="mobile-pairing-card">
              <button type="button" className="mobile-pairing-close" onClick={() => setPairing(null)}><X size={16} /></button>
              <img src={pairing.qrDataUrl} alt="Pet 手机配对二维码" />
              <div>
                <b>用 Pet Android 扫描</b>
                <span>二维码两分钟内有效，只能使用一次。</span>
                <code>{pairing.serverUrl}</code>
              </div>
            </div>
          )}

          {(mobileState?.pairings || []).filter((item) => item.status === "claimed").map((item) => (
            <div className="mobile-approval-card" key={item.id}>
              <div>
                <b>{item.device?.name || "Android 设备"}</b>
                <span>申请连接这台电脑</span>
              </div>
              <button type="button" className="secondary-button" onClick={() => void decidePairing(item.id, false)}>拒绝</button>
              <button type="button" className="command-button" onClick={() => void decidePairing(item.id, true)}>允许</button>
            </div>
          ))}

          <div className="mobile-device-list">
            {(mobileState?.devices || []).filter((device) => device.status === "active").map((device) => (
              <div className="mobile-device-row" key={device.id}>
                <Smartphone size={17} />
                <div>
                  <b>{device.name}</b>
                  <span>上次连接：{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString("zh-CN") : "尚未连接"}</span>
                </div>
                <button type="button" title="断开设备" onClick={() => void revokeMobileDevice(device.id)}><Trash2 size={15} /></button>
              </div>
            ))}
            {mobileState && !mobileState.devices.some((device) => device.status === "active") && (
              <p className="setting-hint">尚未配对手机设备。</p>
            )}
          </div>
        </section>

        <section>
          <h2>外观</h2>
          <label>
            <span><Moon size={15} />主题</span>
            <select
              value={form.themeMode}
              onChange={(event) => update("themeMode", event.target.value)}
            >
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
          <p className="setting-hint">切换后立即预览，保存设置后会在下次启动时继续使用。</p>
        </section>

        <section>
          <h2><Bot size={15} /> 只读 Agent</h2>
          <label className="check-field agent-toggle-field">
            <span>启用 Agent Loop</span>
            <input type="checkbox" checked={form.agentEnabled} onChange={(event) => update("agentEnabled", event.target.checked)} />
            <span className="toggle" aria-hidden="true" />
          </label>
          <label>
            <span>允许读取的工作区</span>
            <input value={form.agentWorkspaceRoot} onChange={(event) => update("agentWorkspaceRoot", event.target.value)} placeholder="例如 D:\\Users\\你\\Projects" />
          </label>
          <div className="form-grid compact">
            <label>
              <span>最大步骤数</span>
              <input type="number" min="1" max="12" value={form.agentMaxSteps} onChange={(event) => update("agentMaxSteps", event.target.value)} />
            </label>
            <label>
              <span>总超时（秒）</span>
              <input type="number" min="30" max="600" step="30" value={form.agentTimeoutSeconds} onChange={(event) => update("agentTimeoutSeconds", event.target.value)} />
            </label>
          </div>
          <p className="setting-hint">工作区内普通读取可自动执行；外部目录、敏感内容、每次文件写入和每条命令都会暂停并要求人工审批。读取授权不会自动升级为写入或执行权限。</p>
          <div className={`runtime-health ${runtime?.ok ? "healthy" : "unhealthy"}`}>
            <Activity size={15} />
            {runtime === null ? "正在检查 Agent Runtime…" : runtime.ok ? `Runtime ${runtime.runtime_version} · ${runtime.mode}` : `Runtime 不可用：${runtime.error}`}
          </div>
          <label>
            <span>允许执行的程序</span>
            <input value={form.agentAllowedExecutables} onChange={(event) => update("agentAllowedExecutables", event.target.value)} placeholder="git,npm,npx,node,python" />
          </label>
          <div className="grant-heading">
            <span>持久读取授权</span>
            <button type="button" className="secondary-button" onClick={() => void addDirectory()}><FolderPlus size={15} />添加目录</button>
          </div>
          <div className="grant-list">
            {form.agentDirectoryGrants.length === 0 && <p className="setting-hint">暂无额外目录；运行时也可以按任务临时审批。</p>}
            {form.agentDirectoryGrants.map((grant) => (
              <div className="grant-item" key={grant.id}>
                <code title={grant.root_path}>{grant.root_path}</code>
                <button type="button" title="撤销授权" onClick={() => void revokeDirectory(grant.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2>身份</h2>
          <label>
            <span>名字</span>
            <input value={form.petName} onChange={(event) => update("petName", event.target.value)} />
          </label>
          <label>
            <span>核心提示</span>
            <textarea rows={5} value={form.systemPrompt} onChange={(event) => update("systemPrompt", event.target.value)} />
          </label>
        </section>

        <section>
          <h2>模型</h2>
          <div className="form-grid">
            <label>
              <span>文本模型地址</span>
              <input value={form.chatBaseUrl} onChange={(event) => update("chatBaseUrl", event.target.value)} />
            </label>
            <label>
              <span>语音转写地址</span>
              <input value={form.transcriptionBaseUrl} onChange={(event) => update("transcriptionBaseUrl", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              <span>聊天模型</span>
              <input value={form.chatModel} onChange={(event) => update("chatModel", event.target.value)} />
            </label>
            <label>
              <span>转写模型</span>
              <input value={form.transcriptionModel} onChange={(event) => update("transcriptionModel", event.target.value)} />
            </label>
          </div>
          <label>
            <span><KeyRound size={15} /> API Key</span>
            <input
              type="password"
              value={form.apiKey || ""}
              placeholder={settings.hasApiKey ? "已保存，留空保持不变" : "输入密钥"}
              autoComplete="off"
              onChange={(event) => update("apiKey", event.target.value)}
            />
          </label>
          <div className="form-grid compact">
            <label>
              <span>Temperature</span>
              <input type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={(event) => update("temperature", event.target.value)} />
            </label>
            <label className="check-field">
              <span>自动朗读回复</span>
              <input type="checkbox" checked={form.autoSpeak} onChange={(event) => update("autoSpeak", event.target.checked)} />
              <span className="toggle" aria-hidden="true" />
            </label>
          </div>
        </section>

        <section>
          <h2>智能记忆</h2>
          <div className="form-grid">
            <label>
              <span>记忆提取模型</span>
              <input value={form.memoryModel} onChange={(event) => update("memoryModel", event.target.value)} />
            </label>
            <label>
              <span>上下文压缩模型</span>
              <input value={form.compressionModel} onChange={(event) => update("compressionModel", event.target.value)} />
            </label>
          </div>
          <div className="form-grid compact">
            <label>
              <span>上下文窗口 Tokens</span>
              <input type="number" min="4096" step="1024" value={form.contextWindowTokens} onChange={(event) => update("contextWindowTokens", event.target.value)} />
            </label>
            <label>
              <span>预留输出 Tokens</span>
              <input type="number" min="512" step="512" value={form.reservedOutputTokens} onChange={(event) => update("reservedOutputTokens", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              <span>压缩触发比例</span>
              <input type="number" min="0.5" max="0.9" step="0.05" value={form.contextSoftThreshold} onChange={(event) => update("contextSoftThreshold", event.target.value)} />
            </label>
            <label>
              <span>压缩目标比例</span>
              <input type="number" min="0.25" max="0.65" step="0.05" value={form.contextTargetRatio} onChange={(event) => update("contextTargetRatio", event.target.value)} />
            </label>
          </div>
          <label>
            <span>后台提取批大小</span>
            <input type="number" min="2" max="24" step="1" value={form.memoryBatchSize} onChange={(event) => update("memoryBatchSize", event.target.value)} />
          </label>
          <div className="form-grid compact">
            <label className="check-field">
              <span>启用语义索引</span>
              <input type="checkbox" checked={form.embeddingEnabled} onChange={(event) => update("embeddingEnabled", event.target.checked)} />
              <span className="toggle" aria-hidden="true" />
            </label>
            <label className="check-field">
              <span>启用混合检索</span>
              <input type="checkbox" checked={form.hybridRetrievalEnabled} onChange={(event) => update("hybridRetrievalEnabled", event.target.checked)} />
              <span className="toggle" aria-hidden="true" />
            </label>
            <label className="check-field">
              <span>启用条件重排</span>
              <input type="checkbox" checked={form.rerankerEnabled} onChange={(event) => update("rerankerEnabled", event.target.checked)} />
              <span className="toggle" aria-hidden="true" />
            </label>
            <label className="check-field">
              <span>启用 Claim 语义治理</span>
              <input type="checkbox" checked={form.claimSemanticGovernanceEnabled} onChange={(event) => update("claimSemanticGovernanceEnabled", event.target.checked)} />
              <span className="toggle" aria-hidden="true" />
            </label>
            <label className="check-field">
              <span>允许发送记忆文本</span>
              <input type="checkbox" checked={form.remoteEmbeddingConsent} onChange={(event) => update("remoteEmbeddingConsent", event.target.checked)} />
              <span className="toggle" aria-hidden="true" />
            </label>
          </div>
          <label>
            <span>Embedding 模型地址</span>
            <input value={form.embeddingBaseUrl} onChange={(event) => update("embeddingBaseUrl", event.target.value)} />
          </label>
          <div className="form-grid">
            <label>
              <span>Embedding 模型</span>
              <input value={form.embeddingModel} onChange={(event) => update("embeddingModel", event.target.value)} />
            </label>
            <label>
              <span>向量维度</span>
              <input type="number" min="64" max="4096" step="64" value={form.embeddingDimension} onChange={(event) => update("embeddingDimension", event.target.value)} />
            </label>
          </div>
          <div className="form-grid compact">
            <label>
              <span>Reranker 模型</span>
              <input value={form.rerankerModel} onChange={(event) => update("rerankerModel", event.target.value)} />
            </label>
            <label>
              <span>Reranker 超时 ms</span>
              <input type="number" min="500" max="15000" step="500" value={form.rerankerTimeoutMs} onChange={(event) => update("rerankerTimeoutMs", event.target.value)} />
            </label>
          </div>
        </section>

        <div className="settings-actions">
          <button type="button" className="secondary-button" onClick={test} disabled={busy}>
            {tested ? <Check size={17} /> : <PlugZap size={17} />}
            {tested ? "连接正常" : "测试连接"}
          </button>
          <button type="submit" className="command-button" disabled={busy}>
            <Save size={17} />保存
          </button>
        </div>
      </form>
    </main>
  );
}
