"use client";

import { useState } from "react";
import { AddButton, Card, Dashboard, DashboardMain, EmptyNote, Field, FormModal, Page } from "../components/blocks";
import { AppearanceCard } from "../components/appearance-card";
import { ListBox, RowActions } from "../components/lists";
import { undoWith, useToast } from "../components/toast";
import { connectClaudeAction, disconnectClaudeAction, restoreClaudeConnectionAction } from "@/actions/claude-connection";
import { isClaudeEnabled } from "@/lib/features";
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
      if (!res.success) {
        setErrorMsg(res.error);
        return;
      }
      const before = connectedAt;
      setConnectedAt(res.connectedAt);
      showToast({
        message: before ? "Saved the new Claude token" : "Connected Claude",
        type: "success",
        onUndo: undo(before, res.previous, res.connectedAt),
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
  const undo = (before: string | null, previous: Previous, now: string | null) =>
    undoWith(showToast, async () => {
      setConnectedAt(before);
      const ok = await (previous ? restoreClaudeConnectionAction(previous) : disconnectClaudeAction()).then(
        (res) => res.success,
        () => false,
      );
      if (!ok) setConnectedAt(now);
      return ok;
    });

  async function handleDisconnect() {
    const before = connectedAt;
    setConnectedAt(null);
    try {
      const answer = await disconnectClaudeAction();
      if (!answer.success) throw new Error(answer.error);
      const { previous } = answer;
      showToast({
        message: "Disconnected Claude",
        type: "success",
        onUndo: undo(before, previous, null),
      });
    } catch {
      setConnectedAt(before);
      showToast({ message: "Failed to disconnect Claude", type: "warning" });
    }
  }

  return (
    <Page userName={userName}>
      <Dashboard>
        <DashboardMain>
          <AppearanceCard />
          {isClaudeEnabled() && (
            <Card
              id="claude-title"
              title="Claude"
              end={
                // Always rendered, so the header keeps its shape once connected.
                <AddButton
                  onClick={openForm}
                  style={connectedAt ? { visibility: "hidden" } : undefined}
                  aria-hidden={connectedAt ? true : undefined}
                  tabIndex={connectedAt ? -1 : undefined}
                >
                  Connect Claude
                </AddButton>
              }
            >
              <ListBox className="entries">
                {connectedAt === null ? (
                  <EmptyNote>Not connected.</EmptyNote>
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
            </Card>
          )}
        </DashboardMain>
      </Dashboard>

      <FormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={connectedAt ? "Edit token" : "Connect Claude"}
        onSubmit={handleSubmit}
        error={errorMsg}
        busy={busy}
        canSubmit={!!token.trim()}
      >
        <p className="muted move-hint">
          Run claude setup-token in a terminal and paste the token it prints. The Assistant then uses your Claude plan.
        </p>
        <Field
          label="Token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          maxLength={600}
          required
        />
      </FormModal>
    </Page>
  );
}
