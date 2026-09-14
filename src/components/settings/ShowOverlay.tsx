import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/Dropdown";
import { Slider } from "../ui/Slider";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";
import type { OverlayPosition, OverlayStyle } from "@/bindings";

interface ShowOverlayProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const ShowOverlay: React.FC<ShowOverlayProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const styleOptions = [
      {
        value: "none",
        label: t("settings.advanced.overlay.style.options.none"),
      },
      {
        value: "minimal",
        label: t("settings.advanced.overlay.style.options.minimal"),
      },
      {
        value: "live",
        label: t("settings.advanced.overlay.style.options.live"),
      },
    ];

    const positionOptions = [
      {
        value: "bottom_left",
        label: t("settings.advanced.overlay.position.options.bottom_left"),
      },
      {
        value: "bottom",
        label: t("settings.advanced.overlay.position.options.bottom"),
      },
      {
        value: "bottom_right",
        label: t("settings.advanced.overlay.position.options.bottom_right"),
      },
      {
        value: "top",
        label: t("settings.advanced.overlay.position.options.top"),
      },
    ];

    const selectedStyle = (getSetting("overlay_style") ||
      "live") as OverlayStyle;
    const rawPos = (getSetting("overlay_position") as string) || "bottom_left";
    const selectedPosition: OverlayPosition =
      rawPos === "top" || rawPos === "bottom" || rawPos === "bottom_right"
        ? (rawPos as OverlayPosition)
        : "bottom_left";

    const [deckOpacity, setDeckOpacity] = useState<number>(() => {
      const saved = localStorage.getItem("qshandy_deck_opacity");
      return saved ? Math.round(parseFloat(saved) * 100) : 95;
    });

    const handleOpacityChange = (val: number) => {
      setDeckOpacity(val);
      localStorage.setItem("qshandy_deck_opacity", String(val / 100));
    };

    return (
      <>
        <SettingContainer
          title={t("settings.advanced.overlay.style.title")}
          description={t("settings.advanced.overlay.style.description")}
          descriptionMode={descriptionMode}
          grouped={grouped}
        >
          <Dropdown
            options={styleOptions}
            selectedValue={selectedStyle}
            onSelect={(value) =>
              updateSetting("overlay_style", value as OverlayStyle)
            }
            disabled={isUpdating("overlay_style")}
          />
        </SettingContainer>

        {selectedStyle !== "none" && (
          <SettingContainer
            title={t("settings.advanced.overlay.position.title")}
            description={t("settings.advanced.overlay.position.description")}
            descriptionMode={descriptionMode}
            grouped={grouped}
          >
            <Dropdown
              options={positionOptions}
              selectedValue={selectedPosition}
              onSelect={(value) =>
                updateSetting("overlay_position", value as OverlayPosition)
              }
              disabled={isUpdating("overlay_position")}
            />
          </SettingContainer>
        )}

        {selectedStyle !== "none" && (
          <Slider
            label={t(
              "settings.advanced.overlay.opacity.title",
              "Overlay Transparency",
            )}
            description={t(
              "settings.advanced.overlay.opacity.description",
              "Adjust transparency amount of the overlay and transcription cards",
            )}
            descriptionMode={descriptionMode}
            grouped={grouped}
            value={deckOpacity}
            onChange={handleOpacityChange}
            min={30}
            max={100}
            step={5}
            formatValue={(v) => `${Math.round(v)}%`}
          />
        )}
      </>
    );
  },
);
