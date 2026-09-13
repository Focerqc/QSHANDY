import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./RecordingOverlay.css";
import { commands, events } from "@/bindings";
import type {
  StreamPhase,
  StreamPhaseEvent,
  StreamTextEvent,
  StreamWorkKind,
} from "@/bindings";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";
import { TranscriptionCardDeck, CardItem } from "./TranscriptionCardDeck";

type OverlayState = "recording" | "streaming" | "transcribing" | "processing";

// Number of reactive bars in the waveform (the simple, smoothed style shared by
// every overlay form). Mic levels arrive as 16 FFT buckets; we take the first N.
const WAVE_BARS = 9;

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const [cards, setCards] = useState<CardItem[]>([]);
  const cardsRef = useRef<CardItem[]>([]);
  cardsRef.current = cards;

  const [state, setState] = useState<OverlayState>("recording");
  // `Stream::play()` returning does not mean hardware callbacks are flowing.
  // Stay visually in an arming state until the backend processes the first
  // actual microphone sample chunk.
  const [captureReady, setCaptureReady] = useState(false);
  const [levels, setLevels] = useState<number[]>(Array(WAVE_BARS).fill(0));
  const [streamText, setStreamText] = useState<StreamTextEvent>({
    committed: "",
    tentative: "",
  });
  const [phase, setPhase] = useState<StreamPhase>("listening");
  const [workKind, setWorkKind] = useState<StreamWorkKind>("transcribing");
  const [elapsed, setElapsed] = useState(0);
  // Bumped on each new streaming session so the Live card remounts fresh (replays
  // the pop-in, and never animates in from the previous panel's open size).
  const [session, setSession] = useState(0);
  // Overlay placement (top vs bottom of the screen). The Live panel grows downward
  // from a top overlay (oldest line under the pill) and upward from a bottom one.
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  // True once live text overflows the cap. A top overlay fades its top edge only
  // while overflowing, so the resting first line stays crisp flush under the pill.
  const [overflowing, setOverflowing] = useState(false);

  const smoothedLevelsRef = useRef<number[]>(Array(16).fill(0));
  // Live-text scroll-back: the text region "sticks" to the newest line while the
  // user is at the bottom; if they scroll up to read history, auto-follow pauses
  // until they scroll back down.
  const capRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const direction = getLanguageDirection(i18n.language);

  const handleRemoveCard = (id: string) => {
    setCards((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      if (updated.length === 0 && !isRecordingActive) {
        setIsVisible(false);
        try {
          getCurrentWebviewWindow().hide();
        } catch {
          // ignore
        }
      }
      return updated;
    });
  };

  const handleClearAll = () => {
    setCards([]);
    if (!isRecordingActive) {
      setIsVisible(false);
      try {
        getCurrentWebviewWindow().hide();
      } catch {
        // ignore
      }
    }
  };

  const handleUpdateCardText = (id: string, newText: string) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, text: newText } : c)),
    );
  };

  const handleAttachScreenshot = (id: string, dataUrl: string, blob: Blob) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, screenshot: dataUrl, screenshotBlob: blob } : c,
      ),
    );
  };

  const handleRemoveScreenshot = (id: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, screenshot: undefined, screenshotBlob: undefined }
          : c,
      ),
    );
  };

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // Synchronize card count with backend to manage overlay window sizing
  useEffect(() => {
    commands.resizeOverlayForCardsChange(cards.length).catch(() => {});
  }, [cards.length]);

  // Synchronize active card to backend so it's ready for Ctrl+B
  useEffect(() => {
    const activeCard =
      cards.find((c) => c.id === selectedCardId) || cards[cards.length - 1];
    if (!activeCard) {
      commands.setActiveCardForPaste("", "", null).catch(() => {});
      return;
    }

    const syncCard = async () => {
      try {
        let rawBytes: number[] | null = null;
        if (activeCard.screenshotBlob) {
          const buf = await activeCard.screenshotBlob.arrayBuffer();
          rawBytes = Array.from(new Uint8Array(buf));
        } else if (activeCard.screenshot) {
          const res = await fetch(activeCard.screenshot);
          const buf = await res.arrayBuffer();
          rawBytes = Array.from(new Uint8Array(buf));
        }
        await commands.setActiveCardForPaste(
          activeCard.id,
          activeCard.text,
          rawBytes,
        );
      } catch (err) {
        console.warn("Failed to sync active card to backend:", err);
      }
    };

    syncCard();
  }, [cards, selectedCardId]);

  useEffect(() => {
    let isMounted = true;
    const unlisteners: (() => void)[] = [];

    const setupEventListeners = async () => {
      const unlistenShow = await listen("show-overlay", async (event) => {
        const overlayState = event.payload as OverlayState;
        setIsRecordingActive(true);
        if (overlayState === "recording" || overlayState === "streaming") {
          setCaptureReady(false);
          smoothedLevelsRef.current = Array(16).fill(0);
          setLevels(Array(WAVE_BARS).fill(0));
          setStreamText({ committed: "", tentative: "" });
        }

        await syncLanguageFromSettings();
        try {
          const settings = await commands.getAppSettings();
          if (settings.status === "ok") {
            setPosition(
              settings.data.overlay_position === "top" ? "top" : "bottom",
            );
          }
        } catch {
          // Keep previous
        }
        setState(overlayState);
        if (overlayState === "streaming") {
          setPhase("listening");
          setWorkKind("transcribing");
          setElapsed(0);
          setSession((s) => s + 1);
        }
        setIsVisible(true);
      });
      if (!isMounted) {
        unlistenShow();
        return;
      }
      unlisteners.push(unlistenShow);

      const unlistenHide = await listen("hide-overlay", () => {
        setIsRecordingActive(false);
        if (cardsRef.current.length === 0) {
          setIsVisible(false);
        }
        setCaptureReady(false);
      });
      if (!isMounted) {
        unlistenHide();
        return;
      }
      unlisteners.push(unlistenHide);

      const unlistenAddCard = await listen<{
        id?: string;
        text: string;
        timestamp?: number;
      }>("add-transcription-card", (event) => {
        const text = event.payload?.text;
        if (!text || !text.trim()) return;
        const id = event.payload?.id || crypto.randomUUID();
        const timestamp = event.payload?.timestamp || Date.now();

        setCards((prev) => {
          // Deduplicate by ID
          if (prev.some((c) => c.id === id)) return prev;
          // Deduplicate if identical text within 800ms
          const last = prev[prev.length - 1];
          if (
            last &&
            last.text === text.trim() &&
            Math.abs(last.timestamp - timestamp) < 800
          ) {
            return prev;
          }
          const newCard: CardItem = {
            id,
            text: text.trim(),
            timestamp,
          };
          // Append new card at the bottom (oldest at top, newest at bottom)
          return [...prev, newCard];
        });
        setSelectedCardId(id);
        setIsVisible(true);
      });
      if (!isMounted) {
        unlistenAddCard();
        return;
      }
      unlisteners.push(unlistenAddCard);

      const unlistenCardPasted = await listen<string>(
        "card-pasted",
        (event) => {
          const cardId = event.payload;
          if (cardId) {
            handleRemoveCard(cardId);
          }
        },
      );
      if (!isMounted) {
        unlistenCardPasted();
        return;
      }
      unlisteners.push(unlistenCardPasted);

      const unlistenReady = await listen("recording-ready", () => {
        setElapsed(0);
        setCaptureReady(true);
      });
      if (!isMounted) {
        unlistenReady();
        return;
      }
      unlisteners.push(unlistenReady);

      const unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload as number[];
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const target = newLevels[i] || 0;
          return prev * 0.7 + target * 0.3;
        });
        smoothedLevelsRef.current = smoothed;
        setLevels(smoothed.slice(0, WAVE_BARS));
      });
      if (!isMounted) {
        unlistenLevel();
        return;
      }
      unlisteners.push(unlistenLevel);

      const unlistenStream = await events.streamTextEvent.listen((event) => {
        setStreamText(event.payload);
      });
      if (!isMounted) {
        unlistenStream();
        return;
      }
      unlisteners.push(unlistenStream);

      const unlistenPhase = await events.streamPhaseEvent.listen((event) => {
        const payload: StreamPhaseEvent = event.payload;
        setPhase(payload.phase);
        if (payload.kind) setWorkKind(payload.kind);
      });
      if (!isMounted) {
        unlistenPhase();
        return;
      }
      unlisteners.push(unlistenPhase);
    };

    setupEventListeners();

    return () => {
      isMounted = false;
      unlisteners.forEach((u) => u());
    };
  }, []);

  // Elapsed capture timer starts only once microphone samples are flowing.
  useEffect(() => {
    if (state !== "streaming" || !isVisible || !captureReady) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [state, isVisible, captureReady]);

  // Stick to the bottom as text streams in — but only while pinned, so a user who
  // has scrolled up to read history isn't yanked back down by the next chunk.
  useLayoutEffect(() => {
    const el = capRef.current;
    if (!el) return;
    // Fade the top edge only once text actually overflows the cap.
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  // Each fresh streaming session starts pinned to the bottom, fade cleared.
  useEffect(() => {
    pinnedRef.current = true;
    setOverflowing(false);
  }, [session]);

  if (!isVisible) return null;

  // Re-pin when the user is within ~a line of the bottom; unpin otherwise.
  const handleStreamScroll = () => {
    const el = capRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 16;
  };

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ---- Shared building blocks (one visual language for every overlay form) ----
  const waveform = (
    <div className={`swave ${captureReady ? "ready" : "arming"}`}>
      {levels.map((v, i) => (
        <i
          key={i}
          style={{
            height: `${Math.max(3, Math.min(18, 3 + Math.pow(v, 0.7) * 15))}px`,
          }}
        />
      ))}
    </div>
  );

  const cancelBtn = (
    <button
      className="sx"
      aria-label="cancel"
      onClick={() => commands.cancelOperation()}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 4 L12 12 M12 4 L4 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );

  // dot (left) | waveform (center) | timer + cancel (right) — same structure for
  // pill & panel, so the Live morph is a pure width change.
  const listeningRow = (showTimer: boolean, showCancel: boolean) => (
    <div className="sbase">
      <div className="sbase-l">
        <button
          className="sdot-btn"
          onClick={() => commands.toggleTranscription()}
          title="Start / Stop Recording"
          aria-label="Start / Stop Recording"
        >
          <span className={`sdot ${captureReady ? "ready" : "arming"}`} />
        </button>
      </div>
      {waveform}
      <div className="sbase-r">
        {showTimer && <span className="stimer">{fmtTime(elapsed)}</span>}
        {showCancel && cancelBtn}
      </div>
    </div>
  );

  // spinner (left) | label (center) | cancel (right) — same 3-zone grid as the
  // listening row, so the label is centered.
  const workingRow = (label: string, showCancel: boolean) => (
    <div className="sbase">
      <div className="sbase-l">
        <span className="sspinner" />
      </div>
      <span className="swork-label">{label}</span>
      <div className="sbase-r">{showCancel && cancelBtn}</div>
    </div>
  );

  // ---- Live overlay: a pill that sculpts open into a panel ----
  if (state === "streaming") {
    const hasText =
      streamText.committed.length > 0 || streamText.tentative.length > 0;
    const working = phase === "working";
    const open = hasText;
    const collapsed = working && !hasText;

    return (
      <div dir={direction} className={`ov-stage ${position}`}>
        <div className="ov-stack">
          {cards.length > 0 && (
            <TranscriptionCardDeck
              cards={cards}
              selectedCardId={selectedCardId}
              onSelectCard={(id) => setSelectedCardId(id)}
              onRemoveCard={handleRemoveCard}
              onClearAll={handleClearAll}
              onUpdateCardText={handleUpdateCardText}
              onAttachScreenshot={handleAttachScreenshot}
              onRemoveScreenshot={handleRemoveScreenshot}
            />
          )}
          {isRecordingActive && (
            <div
              key={session}
              className={`scard ${open ? "open" : ""} ${collapsed ? "working" : ""} ${
                isVisible ? "" : "leaving"
              }`}
            >
              <div className="stext">
                <div className="stext-clip">
                  <div
                    className={`stext-cap ${overflowing ? "overflowing" : ""}`}
                    ref={capRef}
                    onScroll={handleStreamScroll}
                  >
                    <p>
                      <span className="committed">
                        {streamText.committed ? streamText.committed + " " : ""}
                      </span>
                      <span className="tentative">{streamText.tentative}</span>
                      {!working && <span className="scaret" />}
                    </p>
                  </div>
                </div>
              </div>
              {working
                ? workingRow(
                    workKind === "polishing"
                      ? t("overlay.processing")
                      : t("overlay.transcribing"),
                    true,
                  )
                : listeningRow(open, true)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Minimal overlay: exactly one row at a time — waveform (recording), or a
  // spinner + label (transcribing / processing). Never both. The pill animates its
  // width between them; the cancel button is in both rows so it stays put.
  const working = state === "transcribing" || state === "processing";
  const workLabel =
    state === "processing"
      ? t("overlay.processing")
      : t("overlay.transcribing");

  return (
    <div
      dir={direction}
      className={`ov-stage ${position} ov-fade ${isVisible ? "show" : ""}`}
    >
      <div className="ov-stack">
        {cards.length > 0 && (
          <TranscriptionCardDeck
            cards={cards}
            selectedCardId={selectedCardId}
            onSelectCard={(id) => setSelectedCardId(id)}
            onRemoveCard={handleRemoveCard}
            onClearAll={handleClearAll}
            onUpdateCardText={handleUpdateCardText}
            onAttachScreenshot={handleAttachScreenshot}
            onRemoveScreenshot={handleRemoveScreenshot}
          />
        )}
        {isRecordingActive && (
          <div
            className={`scard compact ${working && isVisible ? "cworking" : ""}`}
          >
            {working ? workingRow(workLabel, true) : listeningRow(false, true)}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordingOverlay;
