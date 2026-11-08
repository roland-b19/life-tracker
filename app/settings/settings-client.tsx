"use client";

import { useState } from "react";
import { Navigation } from "../components/navigation";
import { AutoHeight, useListMotion } from "../components/list-motion";
import { PencilIcon, PlusIcon, TrashIcon } from "../components/icons";
import { Modal, useAfterClose } from "../components/modal";
import { useToast } from "../components/toast";
import { connectClaudeAction, disconnectClaudeAction } from "@/app/actions/claude-connection";
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
  const { rowRef, enter, leave } = useListMotion();
  const { later, runAfterClose } = useAfterClose();
  const { showToast } = useToast();

  function openForm() {
    runAfterClose();
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
      const at = res.connectedAt;
      const replaced = connectedAt !== null;
      later(() => {
        if (!replaced) enter("claude");
        setConnectedAt(at);
      });
      // No Undo: the old token never reaches the browser, and a new one is one `claude setup-token` away.
      showToast({ message: replaced ? "Saved the new Claude token" : "Connected Claude", type: "success" });
      setToken("");
      setIsModalOpen(false);
    } catch {
      setErrorMsg("Failed to connect Claude");
    } finally {
      setBusy(false);
    }
  }

  function handleDisconnect() {
    const before = connectedAt;
    const done = disconnectClaudeAction().then(
      () => true,
      () => false,
    );
    const gone = new Promise<void>((resolve) =>
      leave("claude", () => {
        setConnectedAt(null);
        resolve();
      }),
    );
    // No Undo, for the same reason as a token change.
    showToast({ message: "Disconnected Claude", type: "success" });
    void Promise.all([done, gone]).then(([ok]) => {
      if (ok) return;
      enter("claude");
      setConnectedAt(before);
      showToast({ message: "Failed to disconnect Claude", type: "warning" });
    });
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

            <AutoHeight className="entries">
              {connectedAt === null ? (
                <p key="empty" ref={rowRef("empty")} className="empty-note">
                  Not connected.
                </p>
              ) : (
                <div key="claude" ref={rowRef("claude")} className="entry-row item-row">
                  <strong className="item-name">Claude account</strong>
                  <div className="item-meta">
                    <span className="muted number-tabular">Connected {formatDMY(connectedAt)}</span>
                  </div>
                  <div className="item-actions">
                    <button
                      type="button"
                      className="delete-icon-btn edit"
                      aria-label="Replace the Claude token"
                      title="Edit"
                      onClick={openForm}
                    >
                      <PencilIcon size={17} />
                    </button>
                    <button
                      type="button"
                      className="delete-icon-btn"
                      aria-label="Disconnect Claude"
                      title="Disconnect"
                      onClick={handleDisconnect}
                    >
                      <TrashIcon size={17} />
                    </button>
                  </div>
                </div>
              )}
            </AutoHeight>
          </section>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onExited={runAfterClose}
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
