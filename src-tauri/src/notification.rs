//! Custom actionable notifications for macOS using mac-notification-sys.
//!
//! The Tauri notification plugin (v2) uses notify-rust on desktop, which
//! ignores action buttons, actionTypeId, and extra data. This module calls
//! mac-notification-sys directly to show notifications with real action
//! buttons and returns the user's chosen action to the frontend via events.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};

/// Payload sent from the frontend describing the notification to show.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionableNotificationOptions {
    /// Notification title.
    pub title: String,
    /// Notification body text.
    pub body: String,
    /// Identifier for the action type (e.g. "meeting_starting").
    pub action_type_id: String,
    /// Action buttons to display. First action becomes the main button;
    /// if more than one, they appear in a dropdown.
    pub actions: Vec<NotificationAction>,
    /// Arbitrary key-value data passed back with the action response.
    #[serde(default)]
    pub extra: std::collections::HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct NotificationAction {
    /// Unique identifier for the action (e.g. "record_only").
    pub id: String,
    /// Human-readable label shown on the button.
    pub title: String,
}

/// Event payload emitted to the frontend when the user interacts with a notification.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationActionEvent {
    /// The action_type_id from the original notification.
    pub action_type_id: String,
    /// Which action the user selected (action id), or "__clicked__" for body click, "__dismissed__" for close.
    pub action_id: String,
    /// Extra data from the original notification.
    pub extra: std::collections::HashMap<String, String>,
}

/// Send a macOS notification with action buttons using mac-notification-sys.
/// Spawns a blocking thread to wait for the user response, then emits an event.
#[tauri::command]
pub async fn send_actionable_notification<R: Runtime>(
    app: AppHandle<R>,
    options: ActionableNotificationOptions,
) -> Result<(), String> {
    // Validate
    if options.actions.is_empty() {
        return Err("At least one action is required".into());
    }

    // Clone data for the background thread
    let action_type_id = options.action_type_id.clone();
    let extra = options.extra.clone();
    let title = options.title.clone();
    let body = options.body.clone();

    // Collect action ids and titles
    let action_ids: Vec<String> = options.actions.iter().map(|a| a.id.clone()).collect();
    let action_titles: Vec<String> = options.actions.iter().map(|a| a.title.clone()).collect();

    // Set the application identifier so notifications appear from our app
    #[cfg(target_os = "macos")]
    {
        let identifier = app.config().identifier.clone();
        let app_handle = app.clone();

        tauri::async_runtime::spawn_blocking(move || {
            // Set application bundle ID for the notification
            if !tauri::is_dev() {
                let _ = mac_notification_sys::set_application(&identifier);
            } else {
                let _ = mac_notification_sys::set_application("com.apple.Terminal");
            }

            let mut notification = mac_notification_sys::Notification::new();
            notification.title(&title);
            notification.message(&body);
            notification.sound(mac_notification_sys::Sound::Default);

            // Configure action buttons — title_refs must outlive notification.send()
            let title_refs: Vec<&str> = action_titles.iter().map(|s| s.as_str()).collect();
            if title_refs.len() == 1 {
                notification.main_button(mac_notification_sys::MainButton::SingleAction(
                    title_refs[0],
                ));
            } else {
                notification.main_button(mac_notification_sys::MainButton::DropdownActions(
                    "Actions",
                    &title_refs,
                ));
            }

            // Send and wait for user interaction
            match notification.send() {
                Ok(response) => {
                    let action_id = match response {
                        mac_notification_sys::NotificationResponse::ActionButton(label) => {
                            // Map the button label back to the action id
                            action_titles
                                .iter()
                                .zip(action_ids.iter())
                                .find(|(title, _)| **title == label)
                                .map(|(_, id)| id.clone())
                                .unwrap_or(label)
                        }
                        mac_notification_sys::NotificationResponse::Click => {
                            // User clicked the notification body — treat as first action
                            action_ids.first().cloned().unwrap_or_default()
                        }
                        mac_notification_sys::NotificationResponse::CloseButton(_) => {
                            "__dismissed__".to_string()
                        }
                        _ => "__dismissed__".to_string(),
                    };

                    let event = NotificationActionEvent {
                        action_type_id,
                        action_id,
                        extra,
                    };

                    if let Err(e) = app_handle.emit("notification-action", &event) {
                        log::error!("Failed to emit notification-action event: {}", e);
                    }
                }
                Err(e) => {
                    log::error!("Failed to send notification: {:?}", e);
                }
            }
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, action_type_id, extra, title, body, action_ids, action_titles);
        return Err("Actionable notifications are only supported on macOS".into());
    }

    Ok(())
}
