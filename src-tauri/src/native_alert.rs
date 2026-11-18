//! The system alert (native/alert.m): a sheet with the app icon whose destructive button is red and takes no Return —
//! what the dialog plugin's alert can't set. Resolves whether the action was confirmed.

use std::ffi::{c_void, CString};
use std::os::raw::c_char;

use tauri::AppHandle;
use tokio::sync::oneshot;

unsafe extern "C" {
    fn roci_alert(
        title: *const c_char,
        message: *const c_char,
        confirm_label: *const c_char,
        cancel_label: *const c_char,
        destructive: bool,
        done: extern "C" fn(*mut c_void, bool),
        context: *mut c_void,
    );
}

/// The alert's answer, handed back from AppKit to the waiting command.
extern "C" fn alert_done(context: *mut c_void, confirmed: bool) {
    // SAFETY: `context` is the sender boxed in `native_alert`, and AppKit answers each alert exactly once.
    let sender = unsafe { Box::from_raw(context.cast::<oneshot::Sender<bool>>()) };
    let _ = sender.send(confirmed);
}

fn c_string(value: String, what: &str) -> Result<CString, String> {
    CString::new(value).map_err(|e| format!("alert {what}: {e}"))
}

#[tauri::command]
pub async fn native_alert(
    app: AppHandle,
    title: String,
    message: String,
    confirm_label: String,
    cancel_label: String,
    destructive: bool,
) -> Result<bool, String> {
    let texts = [
        c_string(title, "title")?,
        c_string(message, "message")?,
        c_string(confirm_label, "confirm label")?,
        c_string(cancel_label, "cancel label")?,
    ];
    let (sender, receiver) = oneshot::channel::<bool>();
    // A raw pointer isn't Send; its address crosses to the main thread and is reclaimed in `alert_done`.
    let context = Box::into_raw(Box::new(sender)) as usize;
    // AppKit alerts run on the main thread; the sheet answers later through `alert_done`.
    app.run_on_main_thread(move || {
        let [title, message, confirm, cancel] = &texts;
        // SAFETY: the strings are NUL-terminated and outlive the call (AppKit copies them); `context` is consumed once.
        unsafe {
            roci_alert(title.as_ptr(), message.as_ptr(), confirm.as_ptr(), cancel.as_ptr(), destructive, alert_done, context as *mut c_void);
        }
    })
    .map_err(|e| {
        // SAFETY: the closure never ran, so the sender is still ours to reclaim.
        drop(unsafe { Box::from_raw(context as *mut oneshot::Sender<bool>) });
        format!("could not show the alert: {e}")
    })?;
    receiver.await.map_err(|e| format!("alert closed without an answer: {e}"))
}
