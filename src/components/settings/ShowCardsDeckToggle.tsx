import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface ShowCardsDeckToggleProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const ShowCardsDeckToggle: React.FC<ShowCardsDeckToggleProps> =
  React.memo(({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const showCards = getSetting("show_cards_deck") ?? true;

    return (
      <ToggleSwitch
        checked={showCards}
        onChange={(enabled) => updateSetting("show_cards_deck", enabled)}
        isUpdating={isUpdating("show_cards_deck")}
        label={t("settings.general.showCardsDeck.label")}
        description={t("settings.general.showCardsDeck.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  });
