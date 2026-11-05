"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CloseIcon } from "./icons";

interface CommandItem {
  id: string;
  title: string;
  category: "Navigation" | "Quick Action";
  url?: string;
  action?: () => void;
  shortcut?: string;
}

export function CommandMenu({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: CommandItem[] = useMemo(
    () => [
      { id: "nav-weight", title: "Weigh-ins & Body Weight", category: "Navigation", url: "/", shortcut: "1" },
      { id: "nav-gym", title: "Gym & Workout Logger", category: "Navigation", url: "/gym", shortcut: "2" },
      { id: "nav-food", title: "Food, Nutrition & Macros", category: "Navigation", url: "/food", shortcut: "3" },
      { id: "nav-money", title: "Expenses", category: "Navigation", url: "/money", shortcut: "4" },
      { id: "nav-todos", title: "Tasks", category: "Navigation", url: "/todos", shortcut: "5" },
      { id: "nav-wishlist", title: "Wishlist", category: "Navigation", url: "/wishlist", shortcut: "6" },
      { id: "action-food-ai", title: "Open Food AI Assistant", category: "Quick Action", url: "/food" },
    ],
    [],
  );

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const lower = query.toLowerCase();
    return commands.filter(
      (c) => c.title.toLowerCase().includes(lower) || c.category.toLowerCase().includes(lower),
    );
  }, [commands, query]);

  const handleSelect = useCallback(
    (item: CommandItem) => {
      onClose();
      if (item.url) router.push(item.url);
      else if (item.action) item.action();
    },
    [onClose, router],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === 0 ? filteredCommands.length - 1 : prev - 1,
        );
      } else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
        e.preventDefault();
        handleSelect(filteredCommands[selectedIndex]);
      }
    },
    [filteredCommands, handleSelect, onClose, selectedIndex],
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command Menu"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="command-palette-card" onClick={(e) => e.stopPropagation()}>
        <div className="command-search-row">
          <input
            type="text"
            className="command-input"
            placeholder="Search screens, actions, habits... (Esc to close)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            autoFocus
          />
          <button
            type="button"
            className="delete-icon-btn"
            onClick={onClose}
            aria-label="Close command menu"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="command-list" role="listbox">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((item, idx) => (
              <div
                key={item.id}
                role="option"
                aria-selected={idx === selectedIndex}
                className={`command-item ${idx === selectedIndex ? "selected" : ""}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div>
                  <span className="command-item-title">{item.title}</span>
                  <span className="command-item-category">{item.category}</span>
                </div>
                {item.shortcut && <kbd className="command-kbd">{item.shortcut}</kbd>}
              </div>
            ))
          ) : (
            <div className="command-empty">No matching screens found.</div>
          )}
        </div>

        <div className="command-footer">
          <span>
            Use <kbd className="command-kbd">↑</kbd> <kbd className="command-kbd">↓</kbd> to navigate, <kbd className="command-kbd">↵</kbd> to select
          </span>
          <kbd className="command-kbd">esc</kbd>
        </div>
      </div>
    </div>
  );
}
