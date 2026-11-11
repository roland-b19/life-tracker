"use client";

import { useState } from "react";
import { Navigation } from "../components/navigation";
import { ListBox, RowActions } from "../components/lists";
import { PlusIcon } from "../components/icons";
import { Modal } from "../components/modal";
import { useToast } from "../components/toast";
import { connectClaudeAction, disconnectClaudeAction, restoreClaudeConnectionAction } from "@/app/actions/claude-connection";
import { formatDMY } from "@/lib/format-date";

interface SettingsClientProps {
  userName: string;
  initialConnectedAt: string | null;
}

export function SettingsClient({ userName, initialConnectedAt }: SettingsClientProps) {
  const [connectedAt, setConnectedAt] = useState(initialConnectedAt);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const { showToast } = useToast();

  function openForm() {
    setErrorMsg("");
    setToken("");
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setBusy(true);
    try {
      const res = await connectClaudeAction({ token });
      if (!res.connectedAt) {
        setErrorMsg(res.error ?? "Failed to connect Claude");
        return;
      }
      const before = connectedAt;
      setConnectedAt(res.connectedAt);
      showToast({
        message: before ? "Saved the new Claude token" : "Connected Claude",
        type: "success",
        actionLabel: "Undo",
        onAction: () => undo(before, res.previous, res.connectedAt),
      });
      setToken("");
      setIsModalOpen(false);
    } catch {
      setErrorMsg("Failed to connect Claude");
    } finally {
      setBusy(false);
    }
  }

  type Previous = { tokenEncrypted: string; connectedAt: string } | null;

  // Puts the earlier connection back: the stored (still encrypted) token, or none when there was none.
  async function undo(before: string | null, previous: Previous, now: string | null) {
    setConnectedAt(before);
    const ok = await (previous ? restoreClaudeConnectionAction(previous) : disconnectClaudeAction()).then(
      () => true,
      () => false,
    );
    if (!ok) {
      setConnectedAt(now);
      showToast({ message: "Failed to undo", type: "warning" });
    }
  }

  async function handleDisconnect() {
    const before = connectedAt;
    setConnectedAt(null);
    try {
      const { previous } = await disconnectClaudeAction();
      showToast({
        message: "Disconnected Claude",
        type: "success",
        actionLabel: "Undo",
        onAction: () => undo(before, previous, null),
      });
    } catch {
      setConnectedAt(before);
      showToast({ message: "Failed to disconnect Claude", type: "warning" });
    }
  }

  return (
    <main>
      <Navigation userName={userName} />

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="surface" aria-labelledby="claude-title">
            <div className="section-head">
              <h2 id="claude-title" className="section-title">
                Claude
              </h2>
              {/* Always rendered, so the header keeps its shape once connected. */}
              <button
                type="button"
                className="btn-sm tint"
                onClick={openForm}
                style={connectedAt ? { visibility: "hidden" } : undefined}
                aria-hidden={connectedAt ? true : undefined}
                tabIndex={connectedAt ? -1 : undefined}
              >
                <PlusIcon size={14} />
                Connect Claude
              </button>
            </div>

            <ListBox className="entries">
              {connectedAt === null ? (
                <p className="empty-note">
                  Not connected.
                </p>
              ) : (
                <div className="entry-row item-row">
                  <strong className="item-name">Claude account</strong>
                  <div className="item-meta">
                    <span className="muted number-tabular">Connected {formatDMY(connectedAt)}</span>
                  </div>
                  <RowActions className="item-actions" onEdit={openForm} onDelete={handleDisconnect} editLabel="Replace the Claude token" deleteLabel="Disconnect Claude" deleteTitle="Disconnect" />
                </div>
              )}
            </ListBox>
          </section>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={connectedAt ? "Edit token" : "Connect Claude"}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-stack">
            <p className="muted move-hint">
              Run claude setup-token in a terminal and paste the token it prints. The Assistant then uses your Claude
              plan.
            </p>
            <label>
              Token
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                maxLength={600}
                required
              />
            </label>

            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}
          </div>

          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !token.trim()}>
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
