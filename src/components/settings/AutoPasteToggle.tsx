import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface AutoPasteToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const AutoPasteToggle: React.FC<AutoPasteToggleProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const autoPaste = getSetting("auto_paste_transcription") ?? true;

    return (
      <ToggleSwitch
        checked={autoPaste}
        onChange={(enabled) =>
          updateSetting("auto_paste_transcription", enabled)
        }
        isUpdating={isUpdating("auto_paste_transcription")}
        label={t("settings.general.autoPaste.label")}
        description={t("settings.general.autoPaste.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
