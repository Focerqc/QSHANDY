import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import {
  Copy,
  Check,
  Image as ImageIcon,
  FileText,
  X,
  Sparkles,
  Upload,
  Trash2,
  Camera,
} from "lucide-react";
import { commands } from "@/bindings";
import "./TranscriptionCardDeck.css";

const formatShortcutDisplay = (rawBinding?: string) => {
  if (!rawBinding) return "Ctrl+Alt+V";
  return rawBinding
    .split("+")
    .map((part) => {
      const p = part.trim().toLowerCase();
      if (p === "ctrl") return "Ctrl";
      if (p === "alt" || p === "option") return "Alt";
      if (p === "shift") return "Shift";
      if (p === "command" || p === "cmd" || p === "super") return "Cmd";
      if (p === "plus" || p === "=") return "+";
      return p.toUpperCase();
    })
    .join("+");
};

export interface CardItem {
  id: string;
  text: string;
  timestamp: number;
  screenshot?: string; // base64 data URL
  screenshotBlob?: Blob;
}

interface TranscriptionCardDeckProps {
  cards: CardItem[];
  selectedCardId: string | null;
  onSelectCard: (id: string) => void;
  onRemoveCard: (id: string) => void;
  onClearAll: () => void;
  onUpdateCardText: (id: string, newText: string) => void;
  onAttachScreenshot: (id: string, dataUrl: string, blob: Blob) => void;
  onRemoveScreenshot: (id: string) => void;
}

export const TranscriptionCardDeck: React.FC<TranscriptionCardDeckProps> = ({
  cards,
  selectedCardId,
  onSelectCard,
  onRemoveCard,
  onClearAll,
  onUpdateCardText,
  onAttachScreenshot,
  onRemoveScreenshot,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const rawShortcut =
    settings?.bindings?.["paste_selected_card"]?.current_binding ||
    "ctrl+alt+v";
  const shortcutLabel = formatShortcutDisplay(rawShortcut);

  const rawScreenshotShortcut =
    settings?.bindings?.["trigger_screenshot_tool"]?.current_binding ||
    "ctrl+plus";
  const screenshotShortcutLabel = formatShortcutDisplay(rawScreenshotShortcut);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<
    "all" | "text" | "image" | "pasted" | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [activeCardForFile, setActiveCardForFile] = useState<string | null>(
    null,
  );

  // Auto-scroll the sidebar list to the bottom so newest card is in view
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [cards.length]);

  // Trigger file picker for specific card
  const triggerFilePicker = (cardId: string) => {
    setActiveCardForFile(cardId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeCardForFile) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onAttachScreenshot(activeCardForFile, reader.result, file);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  // Direct paste (Ctrl+V) handler on cards or textarea
  const handleCardPaste = (cardId: string, e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          e.stopPropagation();
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              onAttachScreenshot(cardId, reader.result, file);
            }
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
  };

  // Copy Text Only
  const handleCopyTextOnly = async (card: CardItem) => {
    try {
      await navigator.clipboard.writeText(card.text);
      triggerFeedback(card.id, "text");
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  // Copy Image Only
  const handleCopyImageOnly = async (card: CardItem) => {
    if (!card.screenshot) return;
    try {
      let blob = card.screenshotBlob;
      if (!blob) {
        const res = await fetch(card.screenshot);
        blob = await res.blob();
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type.includes("png") ? blob.type : "image/png"]: blob,
        }),
      ]);
      triggerFeedback(card.id, "image");
    } catch (err) {
      console.error("Failed to copy image:", err);
    }
  };

  const triggerFeedback = (
    cardId: string,
    type: "all" | "text" | "image" | "pasted",
  ) => {
    setCopiedId(cardId);
    setCopiedType(type);
    setTimeout(() => {
      setCopiedId(null);
      setCopiedType(null);
    }, 1800);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (cards.length === 0) return null;

  const activeCard =
    cards.find((c) => c.id === selectedCardId) || cards[cards.length - 1];

  return (
    <div className="cards-deck-container split-layout">
      {/* Hidden File Input for image picking */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/*"
        onChange={handleFileChange}
      />

      {/* Left Sidebar List for Previous Transcriptions */}
      <div className="deck-sidebar">
        <div className="deck-sidebar-header">
          <div className="deck-title-group">
            <span className="deck-title">{t("cards.title")}</span>
            <span className="deck-badge">{cards.length}</span>
          </div>
          <button
            className="deck-btn-ghost"
            onClick={onClearAll}
            title={t("cards.clear")}
          >
            <Trash2 size={12} />
            <span>{t("cards.clear")}</span>
          </button>
        </div>

        <div className="deck-sidebar-list" ref={listRef}>
          {cards.map((card) => {
            const isSelected = activeCard.id === card.id;
            return (
              <div
                key={card.id}
                className={`deck-sidebar-item ${isSelected ? "selected-active" : ""}`}
                onClick={() => onSelectCard(card.id)}
                onPaste={(e) => handleCardPaste(card.id, e)}
              >
                <div className="sidebar-item-top">
                  <span className="sidebar-item-time">
                    {formatTime(card.timestamp)}
                  </span>
                  <div className="sidebar-item-actions">
                    {isSelected && (
                      <span
                        className="sidebar-active-dot"
                        title={t("cards.activeForPaste", {
                          shortcut: shortcutLabel,
                        })}
                      />
                    )}
                    <button
                      className="sidebar-item-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveCard(card.id);
                      }}
                      title="Dismiss card"
                    >
                      <X size={11} />
                    </button>
                  </div>
                </div>

                <div className="sidebar-item-text">
                  {card.text.trim() || t("cards.notesPlaceholder")}
                </div>

                {card.screenshot && (
                  <div className="sidebar-item-img-badge">
                    <ImageIcon size={10} />
                    <span>{t("cards.imageBadge")}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Center Active Card Editor */}
      <div className="deck-main-card">

        <div
          className="deck-card selected-active"
          onPaste={(e) => handleCardPaste(activeCard.id, e)}
        >
          <div className="card-top">
            <div className="card-top-left">
              <span className="card-time">
                {formatTime(activeCard.timestamp)}
              </span>
              <span
                className="card-active-pill"
                title={t("cards.activeForPaste", {
                  shortcut: shortcutLabel,
                })}
              >
                <Sparkles size={11} />
                {t("cards.activeForPaste", { shortcut: shortcutLabel })}
              </span>
            </div>

            <button
              className="card-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveCard(activeCard.id);
              }}
              title="Dismiss card"
            >
              <X size={13} />
            </button>
          </div>

          {/* Editable Transcription & Notes Textarea */}
          <div className="card-input-wrapper">
            <textarea
              className="card-textarea"
              value={activeCard.text}
              placeholder={t("cards.notesPlaceholder")}
              rows={Math.max(
                3,
                Math.min(7, Math.ceil(activeCard.text.length / 42)),
              )}
              onClick={(e) => e.stopPropagation()}
              onFocus={() => onSelectCard(activeCard.id)}
              onChange={(e) => onUpdateCardText(activeCard.id, e.target.value)}
              onPaste={(e) => handleCardPaste(activeCard.id, e)}
            />
          </div>

          {/* Screenshot Attachment Slot */}
          {activeCard.screenshot && (
            <div
              className="card-screenshot-area"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="card-screenshot-preview">
                <img
                  src={activeCard.screenshot}
                  alt="Attached Screenshot"
                  className="card-screenshot-img"
                />
                <div className="card-screenshot-actions">
                  <button
                    className="card-screenshot-replace-btn"
                    onClick={() => triggerFilePicker(activeCard.id)}
                    title={t("cards.replace")}
                  >
                    <Upload size={11} />
                    <span>{t("cards.replace")}</span>
                  </button>
                  <button
                    className="card-screenshot-remove"
                    onClick={() => onRemoveScreenshot(activeCard.id)}
                    title="Remove image"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="card-footer" onClick={(e) => e.stopPropagation()}>
            <div className="card-btn-group">
              <button
                className="card-btn-icon-only"
                onClick={() => {
                  commands.triggerScreenshotHotkey().catch((err) => {
                    console.error("Failed to trigger screenshot hotkey:", err);
                  });
                }}
                title={`Trigger Screenshot Tool (${screenshotShortcutLabel})`}
              >
                <Camera size={13} />
              </button>
              {!activeCard.screenshot && (
                <button
                  className="card-btn-icon-only"
                  onClick={() => triggerFilePicker(activeCard.id)}
                  title="Attach image"
                >
                  <ImageIcon size={13} />
                </button>
              )}
              <button
                className={`card-btn-icon-only ${copiedId === activeCard.id && copiedType === "text" ? "active" : ""}`}
                onClick={() => handleCopyTextOnly(activeCard)}
                title="Copy text only"
              >
                {copiedId === activeCard.id && copiedType === "text" ? (
                  <Check size={13} />
                ) : (
                  <FileText size={13} />
                )}
              </button>
              {activeCard.screenshot && (
                <button
                  className={`card-btn-icon-only ${copiedId === activeCard.id && copiedType === "image" ? "active" : ""}`}
                  onClick={() => handleCopyImageOnly(activeCard)}
                  title="Copy image only"
                >
                  {copiedId === activeCard.id && copiedType === "image" ? (
                    <Check size={13} />
                  ) : (
                    <ImageIcon size={13} />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
