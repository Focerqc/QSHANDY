import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import {
  Check,
  Image as ImageIcon,
  FileText,
  X,
  Sparkles,
  Upload,
  Trash2,
  Camera,
  Edit3,
  Undo2,
  RotateCcw,
  Plus,
  PenTool,
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

export interface CardImage {
  id: string;
  dataUrl: string;
  blob?: Blob;
}

export interface CardItem {
  id: string;
  text: string;
  timestamp: number;
  screenshot?: string; // base64 data URL (primary)
  screenshotBlob?: Blob;
  images?: CardImage[]; // multiple pictures support
}

interface TranscriptionCardDeckProps {
  cards: CardItem[];
  selectedCardId: string | null;
  editingCardId?: string | null;
  onSelectCard: (id: string) => void;
  onStartEditing?: (id: string) => void;
  onExitEditing?: () => void;
  onRemoveCard: (id: string) => void;
  onClearAll: () => void;
  onUpdateCardText: (id: string, newText: string) => void;
  onAttachScreenshot: (id: string, dataUrl: string, blob: Blob) => void;
  onUpdateCardImages?: (
    id: string,
    images: Array<{ id: string; dataUrl: string; blob?: Blob }>,
  ) => void;
  onRemoveScreenshot: (id: string) => void;
  onUpdateCaretPosition?: (pos: number) => void;
  caretPosition?: number | null;
  pendingClearCardIds?: Set<string>;
}

const DRAW_COLORS = [
  "#ff2d87", // Hot Pink
  "#facc15", // Highlighter Yellow
  "#ef4444", // Vibrant Red
  "#06b6d4", // Cyan
  "#ffffff", // White
  "#000000", // Black
];

export const TranscriptionCardDeck: React.FC<TranscriptionCardDeckProps> = ({
  cards,
  selectedCardId,
  editingCardId,
  onSelectCard,
  onStartEditing,
  onExitEditing,
  onRemoveCard,
  onClearAll,
  onUpdateCardText,
  onAttachScreenshot,
  onUpdateCardImages,
  onRemoveScreenshot,
  onUpdateCaretPosition,
  caretPosition,
  pendingClearCardIds,
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

  // Deck Opacity Slider State
  const [deckOpacity, setDeckOpacity] = useState<number>(() => {
    const saved = localStorage.getItem("qshandy_deck_opacity");
    return saved ? Math.max(0.3, Math.min(1.0, parseFloat(saved))) : 0.95;
  });
  const [showOpacitySlider, setShowOpacitySlider] = useState<boolean>(false);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--deck-opacity",
      String(deckOpacity),
    );
    document.documentElement.style.setProperty(
      "--deck-focus-opacity",
      String(Math.min(1.0, deckOpacity + 0.05)),
    );
    localStorage.setItem("qshandy_deck_opacity", String(deckOpacity));
  }, [deckOpacity]);

  const activeCard =
    cards.find((c) => c.id === selectedCardId) || cards[cards.length - 1];
  const isCurrentCardEditing = Boolean(
    editingCardId && activeCard && editingCardId === activeCard.id,
  );
  // Only previous cards are shown in the sidebar list; the active one is displayed on the right
  const previousCards = cards.filter((c) => c.id !== activeCard?.id);

  // Selected image index per card (for viewing among multiple images)
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);

  // Drawing tool state
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);
  const [drawingImageId, setDrawingImageId] = useState<string | null>(null);
  const [drawColor, setDrawColor] = useState<string>("#ff2d87");
  const [drawTool, setDrawTool] = useState<"pen" | "highlighter">("pen");
  const [drawSize, setDrawSize] = useState<number>(3);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPointerDownRef = useRef<boolean>(false);
  const undoStackRef = useRef<ImageData[]>([]);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Restore caret position in textarea safely without triggering focus feedback loops
  useEffect(() => {
    if (
      caretPosition !== null &&
      caretPosition !== undefined &&
      textareaRef.current &&
      isCurrentCardEditing
    ) {
      try {
        textareaRef.current.setSelectionRange(caretPosition, caretPosition);
      } catch {
        // ignore
      }
    }
  }, [caretPosition, activeCard?.text, isCurrentCardEditing]);

  const handleCaretUpdate = (
    e: React.SyntheticEvent<HTMLTextAreaElement>,
  ) => {
    const target = e.currentTarget;
    const pos = target.selectionStart;
    // Don't overwrite an existing non-zero caret position if a programmatic focus fires selectionStart 0
    if (
      e.type === "focus" &&
      pos === 0 &&
      caretPosition !== null &&
      caretPosition !== undefined &&
      caretPosition > 0
    ) {
      return;
    }
    if (onUpdateCaretPosition && pos !== null && pos !== undefined) {
      onUpdateCaretPosition(pos);
    }
  };

  // Auto-scroll the sidebar list to the bottom so newest card is in view
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [cards.length]);

  // Reset active image index and drawing state when switching cards
  useEffect(() => {
    setActiveImageIndex(0);
    setIsDrawingMode(false);
    setDrawingImageId(null);
  }, [selectedCardId]);

  // Helper to get normalized images list for any card
  const getCardImages = useCallback((card?: CardItem): CardImage[] => {
    if (!card) return [];
    if (card.images && card.images.length > 0) return card.images;
    if (card.screenshot) {
      return [
        {
          id: "primary-img",
          dataUrl: card.screenshot,
          blob: card.screenshotBlob,
        },
      ];
    }
    return [];
  }, []);

  const activeImages = getCardImages(activeCard);
  const displayedImage = activeImages[activeImageIndex] || activeImages[0];

  const activeCardRef = useRef<HTMLDivElement>(null);
  const prevImageCountRef = useRef<number>(activeImages.length);

  // Auto-scroll active card down to reveal newly attached image or drawing tool
  useEffect(() => {
    if (
      activeImages.length > prevImageCountRef.current &&
      activeCardRef.current
    ) {
      activeCardRef.current.scrollTo({
        top: activeCardRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
    prevImageCountRef.current = activeImages.length;
  }, [activeImages.length]);

  useEffect(() => {
    if (isDrawingMode && activeCardRef.current) {
      activeCardRef.current.scrollTo({
        top: activeCardRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [isDrawingMode]);

  // Trigger file picker for specific card
  const triggerFilePicker = (cardId: string) => {
    setActiveCardForFile(cardId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && activeCardForFile) {
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            onAttachScreenshot(activeCardForFile, reader.result, file);
          }
        };
        reader.readAsDataURL(file);
      });
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

  const handleDeleteImage = (imgId: string) => {
    if (!activeCard) return;
    const currentList = getCardImages(activeCard);
    const updated = currentList.filter((img) => img.id !== imgId);
    if (onUpdateCardImages) {
      onUpdateCardImages(activeCard.id, updated);
    } else if (updated.length > 0) {
      onAttachScreenshot(activeCard.id, updated[0].dataUrl, updated[0].blob!);
    } else {
      onRemoveScreenshot(activeCard.id);
    }
    setActiveImageIndex(0);
  };

  // Start drawing / markup on an image
  const handleStartDrawing = (imageItem: CardImage) => {
    setDrawingImageId(imageItem.id);
    setIsDrawingMode(true);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      baseImageRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Keep native image resolution for highest quality output
      canvas.width = img.naturalWidth || 600;
      canvas.height = img.naturalHeight || 400;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        undoStackRef.current = [
          ctx.getImageData(0, 0, canvas.width, canvas.height),
        ];
      }
    };
    img.src = imageItem.dataUrl;
  };

  // Canvas Drawing Handlers
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    isPointerDownRef.current = true;
    const { x, y } = getCanvasCoords(e);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);

    if (drawTool === "highlighter") {
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = drawSize * 4;
      ctx.globalAlpha = 0.35;
      ctx.lineCap = "square";
      ctx.lineJoin = "round";
    } else {
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = drawSize;
      ctx.globalAlpha = 1.0;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
    ctx.stroke();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.closePath();

    // Push snapshot to undo stack
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > 25) {
      undoStackRef.current.shift();
    }
  };

  const handleUndoDraw = () => {
    const canvas = canvasRef.current;
    if (!canvas || undoStackRef.current.length <= 1) return;
    undoStackRef.current.pop();
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    const ctx = canvas.getContext("2d");
    if (ctx && prev) {
      ctx.putImageData(prev, 0, 0);
    }
  };

  const handleClearDraw = () => {
    const canvas = canvasRef.current;
    const baseImg = baseImageRef.current;
    if (!canvas || !baseImg) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
      undoStackRef.current = [
        ctx.getImageData(0, 0, canvas.width, canvas.height),
      ];
    }
  };

  const handleSaveDraw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !activeCard || !drawingImageId) return;

    const dataUrl = canvas.toDataURL("image/png");
    canvas.toBlob((blob) => {
      if (!blob) return;
      const currentList = getCardImages(activeCard);
      const updatedList = currentList.map((img) =>
        img.id === drawingImageId ? { ...img, dataUrl, blob } : img,
      );

      if (onUpdateCardImages) {
        onUpdateCardImages(activeCard.id, updatedList);
      } else {
        onAttachScreenshot(activeCard.id, dataUrl, blob);
      }
      setIsDrawingMode(false);
      setDrawingImageId(null);
    }, "image/png");
  };

  const handleCancelDraw = () => {
    setIsDrawingMode(false);
    setDrawingImageId(null);
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
  const handleCopyImageOnly = async (imageItem?: CardImage) => {
    if (!imageItem?.dataUrl) return;
    try {
      let blob = imageItem.blob;
      if (!blob) {
        const res = await fetch(imageItem.dataUrl);
        blob = await res.blob();
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type.includes("png") ? blob.type : "image/png"]: blob,
        }),
      ]);
      triggerFeedback(activeCard.id, "image");
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

  return (
    <div
      className={`cards-deck-container split-layout ${
        isCurrentCardEditing ? "is-editing" : ""
      } ${isDrawingMode ? "is-drawing" : ""}`}
    >
      {/* Hidden File Input for image picking */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/*"
        multiple
        onChange={handleFileChange}
      />

      {/* Left Sidebar List for Previous Transcriptions */}
      <div className="deck-sidebar">
        <div className="deck-sidebar-header">
          <div className="deck-title-group">
            <span className="deck-title">
              {t("cards.previousTitle", "Previous")}
            </span>
            <span className="deck-badge">{previousCards.length}</span>
          </div>
          <div className="deck-sidebar-actions">
            <div className="deck-opacity-control">
              <button
                className={`deck-opacity-btn ${showOpacitySlider ? "active" : ""}`}
                onClick={() => setShowOpacitySlider((prev) => !prev)}
                title="Adjust deck transparency"
              >
                <span>{Math.round(deckOpacity * 100)}%</span>
              </button>
              {showOpacitySlider && (
                <div
                  className="deck-opacity-slider-popover"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="deck-opacity-slider-label">
                    <span>Opacity</span>
                    <span>{Math.round(deckOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="100"
                    step="5"
                    value={Math.round(deckOpacity * 100)}
                    onChange={(e) =>
                      setDeckOpacity(Number(e.target.value) / 100)
                    }
                  />
                </div>
              )}
            </div>
            <button
              className="deck-btn-ghost"
              onClick={onClearAll}
              title={t("cards.clear", "Clear all")}
            >
              <Trash2 size={12} />
              <span>{t("cards.clear", "Clear")}</span>
            </button>
          </div>
        </div>

        <div className="deck-sidebar-list" ref={listRef}>
          {previousCards.length === 0 ? (
            <div className="deck-sidebar-empty">
              <span>
                {t("cards.noPrevious", "Previous cards will appear here")}
              </span>
            </div>
          ) : (
            previousCards.map((card) => {
              const isEditing = editingCardId === card.id;
              const isPendingClear = pendingClearCardIds?.has(card.id);
              const cardImgs = getCardImages(card);

              return (
                <div
                  key={card.id}
                  className={`deck-sidebar-item ${
                    isEditing ? "editing-active" : ""
                  } ${isPendingClear ? "pending-clear" : ""}`}
                  onClick={() => {
                    onSelectCard(card.id);
                    if (onExitEditing) onExitEditing();
                  }}
                  onPaste={(e) => handleCardPaste(card.id, e)}
                >
                  <div className="sidebar-item-top">
                    <span className="sidebar-item-time">
                      {formatTime(card.timestamp)}
                    </span>
                    <div className="sidebar-item-actions">
                      {isPendingClear && (
                        <span
                          className="deck-pending-badge"
                          title="Sent via Ctrl+B · Clears when popup is closed"
                        >
                          ✓ Sent
                        </span>
                      )}
                      {isEditing && (
                        <span
                          className="card-editing-pill"
                          title="Voice dictation appends here"
                        >
                          ✏️ Dictate
                        </span>
                      )}
                      <button
                        className="sidebar-item-close"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveCard(card.id);
                        }}
                        title="Dismiss card"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="sidebar-item-text">
                    {card.text.trim() || t("cards.notesPlaceholder")}
                  </div>

                  {cardImgs.length > 0 && (
                    <div className="sidebar-item-img-badge">
                      <ImageIcon size={10} />
                      <span>
                        {cardImgs.length > 1
                          ? `${cardImgs.length} Images`
                          : t("cards.imageBadge")}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Center Active Card Editor */}
      <div className="deck-main-card">
        <div
          ref={activeCardRef}
          className={`deck-card selected-active ${
            isCurrentCardEditing ? "editing-active" : ""
          } ${pendingClearCardIds?.has(activeCard.id) ? "pending-clear" : ""}`}
          onPaste={(e) => handleCardPaste(activeCard.id, e)}
        >
          <div className="card-top">
            <div className="card-top-left">
              <span className="card-time">
                {formatTime(activeCard.timestamp)}
              </span>

              {pendingClearCardIds?.has(activeCard.id) && (
                <span
                  className="deck-pending-badge"
                  title="Sent via Ctrl+B · Clears when popup is closed"
                >
                  ✓ Sent (Clears on close)
                </span>
              )}

              {isCurrentCardEditing ? (
                <div
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <span className="card-editing-pill">
                    <Edit3 size={11} />
                    {t(
                      "cards.editingActive",
                      "Appending: Voice dictation will insert here",
                    )}
                  </span>
                  {onExitEditing && (
                    <button
                      className="card-exit-edit-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExitEditing();
                      }}
                      title="Exit append mode (speech will create a new card)"
                    >
                      <X size={10} />
                      {t("cards.exitEditing", "Exit Append")}
                    </button>
                  )}
                </div>
              ) : (
                <div
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <span
                    className="card-active-pill"
                    title={t("cards.activeForPaste", {
                      shortcut: shortcutLabel,
                    })}
                  >
                    <Sparkles size={11} />
                    {t("cards.activeForPaste", { shortcut: shortcutLabel })}
                  </span>
                  {onStartEditing && (
                    <button
                      className="card-append-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartEditing(activeCard.id);
                        const curLen = activeCard.text.length;
                        const targetPos =
                          caretPosition !== null &&
                          caretPosition !== undefined &&
                          caretPosition >= 0 &&
                          caretPosition <= curLen
                            ? caretPosition
                            : curLen;
                        onUpdateCaretPosition?.(targetPos);
                        if (textareaRef.current) {
                          textareaRef.current.focus();
                          textareaRef.current.setSelectionRange(
                            targetPos,
                            targetPos,
                          );
                        }
                      }}
                      title="Dictate voice speech directly into this card"
                    >
                      <Edit3 size={10} />
                      <span>{t("cards.appendVoice", "Append Voice")}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              className="card-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveCard(activeCard.id);
              }}
              title="Dismiss card"
            >
              <X size={14} />
            </button>
          </div>

          {/* Editable Transcription & Notes Textarea */}
          <div className="card-input-wrapper">
            <textarea
              ref={textareaRef}
              className="card-textarea"
              value={activeCard.text}
              placeholder={t("cards.notesPlaceholder")}
              rows={Math.max(
                3,
                Math.min(7, Math.ceil(activeCard.text.length / 42)),
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleCaretUpdate(e);
              }}
              onFocus={(e) => {
                onSelectCard(activeCard.id);
                handleCaretUpdate(e);
              }}
              onBlur={handleCaretUpdate}
              onSelect={handleCaretUpdate}
              onKeyUp={handleCaretUpdate}
              onChange={(e) => {
                onUpdateCardText(activeCard.id, e.target.value);
                handleCaretUpdate(e);
              }}
              onPaste={(e) => handleCardPaste(activeCard.id, e)}
            />
          </div>

          {/* Multiple Pictures Thumbnails Strip (if pictures exist) */}
          {activeImages.length > 0 && (
            <div
              className="card-images-strip"
              onClick={(e) => e.stopPropagation()}
            >
              {activeImages.map((img, idx) => (
                <div
                  key={img.id}
                  className={`card-image-thumb ${
                    idx === activeImageIndex ? "selected" : ""
                  }`}
                  onClick={() => setActiveImageIndex(idx)}
                  title={`View image ${idx + 1}`}
                >
                  <img src={img.dataUrl} alt={`Attachment ${idx + 1}`} />
                  <button
                    className="card-image-thumb-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteImage(img.id);
                    }}
                    title="Delete this image"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              <button
                className="card-add-image-thumb-btn"
                onClick={() => triggerFilePicker(activeCard.id)}
                title="Add another image"
              >
                <Plus size={14} />
                <span>Add</span>
              </button>
            </div>
          )}

          {/* Drawing / Markup Tool Canvas Overlay */}
          {isDrawingMode && displayedImage ? (
            <div
              className="card-draw-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="card-draw-canvas-container">
                <canvas
                  ref={canvasRef}
                  className="card-draw-canvas"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                />
              </div>

              {/* Drawing Toolbar */}
              <div className="card-draw-toolbar">
                <div className="card-draw-colors">
                  {DRAW_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`card-draw-color-btn ${
                        drawColor === c ? "selected" : ""
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => setDrawColor(c)}
                      title={c}
                    />
                  ))}
                </div>

                <div className="card-draw-sizes">
                  <button
                    className={`card-draw-btn ${
                      drawTool === "pen" ? "primary" : ""
                    }`}
                    onClick={() => setDrawTool("pen")}
                    title="Pen"
                  >
                    <PenTool size={11} />
                    <span>Pen</span>
                  </button>
                  <button
                    className={`card-draw-btn ${
                      drawTool === "highlighter" ? "primary" : ""
                    }`}
                    onClick={() => setDrawTool("highlighter")}
                    title="Highlighter"
                  >
                    <Edit3 size={11} />
                    <span>Highlight</span>
                  </button>
                  <button
                    className={`card-draw-size-btn ${
                      drawSize === 2 ? "selected" : ""
                    }`}
                    onClick={() => setDrawSize(2)}
                    title="Fine"
                  >
                    •
                  </button>
                  <button
                    className={`card-draw-size-btn ${
                      drawSize === 5 ? "selected" : ""
                    }`}
                    onClick={() => setDrawSize(5)}
                    title="Medium"
                  >
                    ●
                  </button>
                  <button
                    className={`card-draw-size-btn ${
                      drawSize === 10 ? "selected" : ""
                    }`}
                    onClick={() => setDrawSize(10)}
                    title="Thick"
                  >
                    ⬤
                  </button>
                </div>

                <div className="card-draw-actions">
                  <button
                    className="card-draw-btn"
                    onClick={handleUndoDraw}
                    title="Undo stroke"
                  >
                    <Undo2 size={12} />
                  </button>
                  <button
                    className="card-draw-btn"
                    onClick={handleClearDraw}
                    title="Clear markup"
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button className="card-draw-btn" onClick={handleCancelDraw}>
                    {t("cards.drawCancel", "Cancel")}
                  </button>
                  <button
                    className="card-draw-btn primary"
                    onClick={handleSaveDraw}
                  >
                    {t("cards.drawSave", "Save")}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Image Preview Area */
            displayedImage && (
              <div
                className="card-screenshot-area"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="card-screenshot-preview">
                  <img
                    src={displayedImage.dataUrl}
                    alt="Attached Picture"
                    className="card-screenshot-img"
                  />
                  <div className="card-screenshot-actions">
                    <button
                      className="card-screenshot-replace-btn"
                      onClick={() => handleStartDrawing(displayedImage)}
                      title="Draw / annotate image"
                    >
                      <Edit3 size={11} />
                      <span>{t("cards.draw", "Draw")}</span>
                    </button>
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
                      onClick={() => handleDeleteImage(displayedImage.id)}
                      title="Remove image"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              </div>
            )
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
              <button
                className="card-btn-icon-only"
                onClick={() => triggerFilePicker(activeCard.id)}
                title="Attach image"
              >
                <ImageIcon size={13} />
              </button>
              <button
                className={`card-btn-icon-only ${
                  copiedId === activeCard.id && copiedType === "text"
                    ? "active"
                    : ""
                }`}
                onClick={() => handleCopyTextOnly(activeCard)}
                title="Copy text only"
              >
                {copiedId === activeCard.id && copiedType === "text" ? (
                  <Check size={13} />
                ) : (
                  <FileText size={13} />
                )}
              </button>
              {displayedImage && (
                <button
                  className={`card-btn-icon-only ${
                    copiedId === activeCard.id && copiedType === "image"
                      ? "active"
                      : ""
                  }`}
                  onClick={() => handleCopyImageOnly(displayedImage)}
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
