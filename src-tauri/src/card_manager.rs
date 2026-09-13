use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Default, Serialize, Deserialize, Type)]
pub struct ActiveCard {
    pub id: String,
    pub text: String,
    pub image_data: Option<Vec<u8>>,
}

#[derive(Clone, Default)]
pub struct CardManager {
    active_card: Arc<Mutex<Option<ActiveCard>>>,
    card_count: Arc<AtomicUsize>,
}

impl CardManager {
    pub fn new() -> Self {
        Self {
            active_card: Arc::new(Mutex::new(None)),
            card_count: Arc::new(AtomicUsize::new(0)),
        }
    }

    pub fn set_active_card(&self, card: ActiveCard) {
        if let Ok(mut lock) = self.active_card.lock() {
            *lock = Some(card);
        }
    }

    pub fn set_active_card_none(&self) {
        if let Ok(mut lock) = self.active_card.lock() {
            *lock = None;
        }
    }

    pub fn get_active_card(&self) -> Option<ActiveCard> {
        self.active_card.lock().ok().and_then(|c| c.clone())
    }

    pub fn set_card_count(&self, count: usize) {
        self.card_count.store(count, Ordering::SeqCst);
    }

    pub fn card_count(&self) -> usize {
        self.card_count.load(Ordering::SeqCst)
    }

    pub fn has_cards(&self) -> bool {
        self.card_count.load(Ordering::SeqCst) > 0
    }
}

pub fn has_active_cards(app: &AppHandle) -> bool {
    app.try_state::<Arc<CardManager>>()
        .map(|m| m.has_cards())
        .unwrap_or(false)
}

#[tauri::command]
#[specta::specta]
pub fn update_card_count(app: AppHandle, count: usize) -> Result<(), String> {
    if let Some(mgr) = app.try_state::<Arc<CardManager>>() {
        mgr.set_card_count(count);
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn set_active_card_for_paste(
    app: AppHandle,
    id: String,
    text: String,
    image_data: Option<Vec<u8>>,
) -> Result<(), String> {
    if let Some(mgr) = app.try_state::<Arc<CardManager>>() {
        if id.is_empty() {
            mgr.set_active_card_none();
        } else {
            mgr.set_active_card(ActiveCard {
                id,
                text,
                image_data,
            });
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn trigger_paste_active_card(app: AppHandle) -> Result<(), String> {
    let mgr = app
        .try_state::<Arc<CardManager>>()
        .ok_or_else(|| "CardManager state not found".to_string())?;
    let card = mgr
        .get_active_card()
        .ok_or_else(|| "No active card selected to paste".to_string())?;

    let ah = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Sleep briefly to yield OS window focus if initiated via overlay click
        std::thread::sleep(std::time::Duration::from_millis(150));
        if let Err(e) = crate::clipboard::paste_card(card, ah) {
            log::error!("Failed to paste card: {}", e);
        }
    });

    Ok(())
}
