"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { webhooksApi } from "@/lib/api";
import {
  Webhook, Plus, Trash2, CheckCircle, XCircle, Clock,
  RefreshCw, ChevronDown, ChevronUp, Copy, AlertTriangle, Zap,
} from "lucide-react";

const EVENT_TYPES = [
  "document.uploaded", "document.indexed", "document.deleted",
  "sync.started", "sync.completed", "sync.failed",
  "agent.task_completed", "agent.task_failed",
  "graph.populated", "alert.risk_detected",
];

function DeliveryRow({ delivery, webhookId }: { delivery: any; webhookId: string }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();
  const retryMutation = useMutation({
    mutationFn: () => webhooksApi.retry(webhookId, delivery.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-deliveries", webhookId] }),
  });

  const ok = delivery.status_code >= 200 && delivery.status_code < 300;

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        {ok
          ? <CheckCircle size={13} color="#22c55e" style={{ flexShrink: 0 }} />
          : <XCircle size={13} color="#ef4444" style={{ flexShrink: 0 }} />}
        <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0, width: 130, fontVariantNumeric: "tabular-nums" }}>
          {new Date(delivery.delivered_at ?? delivery.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: ok ? "#22c55e" : "#ef4444", background: ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`, borderRadius: 4, padding: "1px 7px", flexShrink: 0 }}>
          {delivery.status_code ?? "—"}
        </span>
        <span style={{ flex: 1, fontSize: 11, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {delivery.event_type}
        </span>
        {delivery.duration_ms && (
          <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>{delivery.duration_ms}ms</span>
        )}
        {!ok && (
          <button onClick={e => { e.stopPropagation(); retryMutation.mutate(); }} disabled={retryMutation.isPending}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, border: "1px solid rgba(124,58,237,0.3)", background: "rgba(124,58,237,0.1)", color: "#a78bfa", cursor: "pointer" }}>
            {retryMutation.isPending ? <RefreshCw size={10} style={{ animation: "spin 0.8s linear infinite" }} /> : <RefreshCw size={10} />} Retry
          </button>
        )}
        {expanded ? <ChevronUp size={12} color="var(--text-3)" /> : <ChevronDown size={12} color="var(--text-3)" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "8px 14px 12px 40px", display: "flex", flexDirection: "column", gap: 8 }}>
              {delivery.request_body && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>Request Body</p>
                  <pre style={{ fontSize: 10, color: "#e6edf3", background: "#0d1117", borderRadius: 6, padding: "8px 10px", margin: 0, overflowX: "auto", border: "1px solid var(--border)", maxHeight: 140 }}>
                    {typeof delivery.request_body === "string" ? delivery.request_body : JSON.stringify(delivery.request_body, null, 2)}
                  </pre>
                </div>
              )}
              {delivery.response_body && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>Response</p>
                  <pre style={{ fontSize: 10, color: ok ? "#86efac" : "#fca5a5", background: ok ? "#0a2d14" : "#2d0a0a", borderRadius: 6, padding: "8px 10px", margin: 0, overflowX: "auto", border: `1px solid ${ok ? "#22c55e30" : "#ef444430"}`, maxHeight: 100 }}>
                    {typeof delivery.response_body === "string" ? delivery.response_body : JSON.stringify(delivery.response_body, null, 2)}
                  </pre>
                </div>
              )}
              {delivery.error && (
                <p style={{ fontSize: 11, color: "#ef4444", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "6px 10px", margin: 0 }}>{delivery.error}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WebhookCard({ webhook, onDelete }: { webhook: any; onDelete: () => void }) {
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: deliveriesData } = useQuery({
    queryKey: ["webhook-deliveries", webhook.id],
    queryFn: () => webhooksApi.deliveries(webhook.id),
    enabled: showDeliveries,
  });

  const deliveries: any[] = deliveriesData?.deliveries ?? [];
  const successRate = deliveriesData?.success_rate ?? null;

  function copySecret() {
    if (webhook.secret) navigator.clipboard.writeText(webhook.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isActive = webhook.is_active ?? webhook.active ?? true;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface-1)" }}>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Webhook size={16} color="#7c3aed" />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {webhook.name ?? "Unnamed"}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.06em",
                background: isActive ? "rgba(34,197,94,0.12)" : "rgba(107,114,128,0.12)",
                color: isActive ? "#22c55e" : "#6b7280",
                border: `1px solid ${isActive ? "rgba(34,197,94,0.25)" : "rgba(107,114,128,0.2)"}`,
              }}>{isActive ? "Active" : "Disabled"}</span>
            </div>

            <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 8 }}>
              {webhook.url}
            </div>

            {/* Event type chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(webhook.events ?? []).map((ev: string) => (
                <span key={ev} style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, background: "rgba(124,58,237,0.08)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.15)" }}>
                  {ev}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {webhook.secret && (
              <button onClick={copySecret} title="Copy secret"
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", color: copied ? "#22c55e" : "var(--text-3)", fontSize: 11 }}>
                <Copy size={11} /> {copied ? "Copied!" : "Secret"}
              </button>
            )}
            <button onClick={() => setShowDeliveries(v => !v)}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", color: "var(--text-2)", fontSize: 11 }}>
              <Clock size={11} /> Deliveries
              {showDeliveries ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <button onClick={onDelete}
              style={{ padding: "5px 7px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)", cursor: "pointer", color: "#ef4444", display: "flex" }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showDeliveries && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
            <div style={{ borderTop: "1px solid var(--border)" }}>
              <div style={{ padding: "8px 14px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)" }}>
                  Delivery History ({deliveries.length})
                </span>
                {successRate !== null && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: successRate >= 90 ? "#22c55e" : successRate >= 70 ? "#f59e0b" : "#ef4444" }}>
                    {successRate.toFixed(0)}% success rate
                  </span>
                )}
              </div>
              {deliveries.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center" }}>
                  <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>No deliveries yet — events will appear here as they fire</p>
                </div>
              ) : (
                deliveries.slice(0, 20).map((d: any, i: number) => (
                  <DeliveryRow key={d.id ?? i} delivery={d} webhookId={webhook.id} />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CreateWebhookModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set(["document.uploaded"]));
  const [error, setError] = useState("");

  const toggle = (ev: string) => setSelectedEvents(prev => {
    const next = new Set(prev);
    next.has(ev) ? next.delete(ev) : next.add(ev);
    return next;
  });

  const mutation = useMutation({
    mutationFn: () => webhooksApi.create({ name, url, events: [...selectedEvents] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks"] }); onClose(); },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Failed to create webhook"),
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, width: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)", margin: "0 0 20px" }}>New Webhook</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 5 }}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="My Webhook"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 13, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 5 }}>Endpoint URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-server.com/webhook"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 13, boxSizing: "border-box" }} />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>Events to subscribe</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {EVENT_TYPES.map(ev => {
                const on = selectedEvents.has(ev);
                return (
                  <button key={ev} onClick={() => toggle(ev)} style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${on ? "rgba(124,58,237,0.5)" : "var(--border)"}`,
                    background: on ? "rgba(124,58,237,0.12)" : "var(--surface-2)",
                    color: on ? "#a78bfa" : "var(--text-2)",
                  }}>{ev}</button>
                );
              })}
            </div>
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: "#ef4444", marginBottom: 12 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!name.trim() || !url.trim() || selectedEvents.size === 0 || mutation.isPending}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Creating…" : "Create Webhook"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function WebhooksPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["webhooks"],
    queryFn: webhooksApi.list,
    refetchInterval: 15_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const webhooks: any[] = data?.webhooks ?? data ?? [];
  const totalDeliveries: number = data?.total_deliveries ?? 0;
  const successRate: number = data?.overall_success_rate ?? 0;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <Webhook size={20} color="#7c3aed" /> Webhooks
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            Push event subscriptions · {totalDeliveries.toLocaleString()} deliveries · {successRate.toFixed(0)}% success
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={14} /> New Webhook
        </button>
      </motion.div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Webhooks",  value: webhooks.length, color: "#7c3aed" },
          { label: "Total Deliveries", value: totalDeliveries, color: "#10b981" },
          { label: "Success Rate",    value: `${successRate.toFixed(1)}%`, color: successRate >= 90 ? "#22c55e" : successRate >= 70 ? "#f59e0b" : "#ef4444" },
        ].map(({ label, value, color }) => (
          <motion.div key={label}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: "14px 18px", borderRadius: 12, background: "var(--surface-1)", border: `1px solid ${color}25`, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.6 }} />
            <div style={{ fontSize: 24, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{label}</div>
          </motion.div>
        ))}
      </div>

      {/* Event reference */}
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
          <Zap size={12} color="#3b82f6" />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6" }}>Available Events</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {EVENT_TYPES.map(ev => (
            <span key={ev} style={{ fontSize: 10, fontFamily: "monospace", padding: "2px 7px", borderRadius: 4, background: "rgba(59,130,246,0.1)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.2)" }}>
              {ev}
            </span>
          ))}
        </div>
      </div>

      {/* Webhook list */}
      {isLoading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, gap: 10, color: "var(--text-3)" }}>
          <RefreshCw size={16} style={{ animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 13 }}>Loading webhooks…</span>
        </div>
      ) : webhooks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-1)" }}>
          <Webhook size={40} color="var(--text-3)" style={{ margin: "0 auto 14px" }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: "0 0 8px" }}>No webhooks configured</p>
          <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 24px" }}>Subscribe to platform events and receive real-time push notifications.</p>
          <button onClick={() => setShowCreate(true)}
            style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Create First Webhook
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {webhooks.map((w: any, i: number) => (
            <WebhookCard key={w.id ?? i} webhook={w}
              onDelete={() => { if (confirm(`Delete webhook "${w.name}"?`)) deleteMutation.mutate(w.id); }} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && <CreateWebhookModal onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </div>
  );
}
