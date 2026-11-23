"use client";

import { useRef, useState } from "react";
import { AddButton, Card, Dashboard, DashboardMain, EmptyNote, Field, FormModal, Page, type FormOpening } from "../components/blocks";
import { AppearanceCard } from "../components/appearance-card";
import { ListBox, RowActions } from "../components/lists";
import { undoWith, useToast } from "../components/toast";
import { useOnce } from "../components/once";
import { useServerState } from "../components/server-state";
import { connectClaudeAction, disconnectClaudeAction, restoreClaudeConnectionAction } from "@/actions/claude-connection";
import { isClaudeEnabled } from "@/lib/features";
import { appDay, formatDMY } from "@/lib/format-date";

interface SettingsClientProps {
  userName: string;
  initialConnectedAt: string | null;
}

/** What a Claude toast touches (D-040): the one connection row the user has. */
const touches = ["claude_connections:*"];

export function SettingsClient({ userName, initialConnectedAt }: SettingsClientProps) {
  const [connectedAt, setConnectedAt] = useServerState(initialConnectedAt);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [token, setToken] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const { showToast } = useToast();
  // Disconnect acts once per tap burst (D-043); Save gets the same from FormModal.
  const once = useOnce();
  const tappedButton = useRef<Element | null>(null);

  function openForm() {
    setErrorMsg("");
    setToken("");
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent, { stillOpen }: FormOpening) {
    e.preventDefault();
    setErrorMsg("");
    const res = await connectClaudeAction({ token }).catch(() => null);
    if (!res?.success) {
      // A refusal shows in the form while it is on screen, else as a toast.
      const message = res?.error ?? "Failed to connect Claude";
      return stillOpen() ? setErrorMsg(message) : showToast({ message, type: "warning" });
    }
    const before = connectedAt;
    setConnectedAt(res.connectedAt);
    showToast({
      message: before ? "Saved the new Claude token" : "Connected Claude",
      type: "success",
      touches,
      onUndo: undo(before, res.previous, res.connectedAt),
    });
    if (!stillOpen()) return;
    setToken("");
    setIsModalOpen(false);
  }

  type Previous = { tokenEncrypted: string; connectedAt: string } | null;

  // Puts the earlier connection back: the stored (still encrypted) token, or none when there was none.
  const undo = (before: string | null, previous: Previous, now: string | null) =>
    undoWith(
      showToast,
      async () => {
        setConnectedAt(before);
        const back = await (previous ? restoreClaudeConnectionAction(previous) : disconnectClaudeAction()).catch(() => null);
        if (!back?.success) setConnectedAt(now);
        // A restore answers the date it stored (a future one is clamped to now).
        else if (back && "connectedAt" in back) setConnectedAt(back.connectedAt);
        return back;
      },
      (back) => (back && !back.success ? back.error : "Failed to undo"),
    );

  async function handleDisconnect() {
    const before = connectedAt;
    setConnectedAt(null);
    const answer = await disconnectClaudeAction().catch(() => null);
    if (!answer?.success) {
      setConnectedAt(before);
      return showToast({ message: answer?.error ?? "Failed to disconnect Claude", type: "warning" });
    }
    showToast({
      message: "Disconnected Claude",
      type: "success",
      touches,
      onUndo: undo(before, answer.previous, null),
    });
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
                  <div className="entry-row item-row" onClickCapture={(e) => (tappedButton.current = (e.target as Element).closest("button"))}>
                    <strong className="item-name">Claude account</strong>
                    <div className="item-meta">
                      {/* The day it was connected on in the app's time zone, not in UTC. */}
                      <span className="muted number-tabular">Connected {formatDMY(appDay(new Date(connectedAt)))}</span>
                    </div>
                    <RowActions className="item-actions" onEdit={openForm} onDelete={() => once("claude", handleDisconnect, tappedButton.current)} editLabel="Replace the Claude token" deleteLabel="Disconnect Claude" deleteTitle="Disconnect" />
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
          autoComplete="off"
          spellCheck={false}
          maxLength={600}
          required
        />
      </FormModal>
    </Page>
  );
}
