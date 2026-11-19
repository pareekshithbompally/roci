//! The Mac's (and iPhone's) own date and time formats: language + region, 12/24-hour clock, first weekday. The web view's
//! `Intl` ignores these settings, so the webview formats with what this reports, and rereads when the user changes them.

use std::ptr::NonNull;

use block2::RcBlock;
use objc2_foundation::{
    NSCalendar, NSCurrentLocaleDidChangeNotification, NSDateFormatter, NSLocale, NSNotification, NSNotificationCenter, NSString,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Rust → webview: the user changed language, region or clock settings.
const CHANGED_EVENT: &str = "system-format://changed";

#[derive(Debug, Clone, Serialize)]
pub struct SystemFormat {
    /// BCP 47 language + region, e.g. `en-IN` (the region override in Language & Region wins).
    locale: String,
    /// The clock is 24-hour (System Settings › Language & Region, or the region's default).
    hour24: bool,
    /// 1 = Sunday … 7 = Saturday.
    first_weekday: usize,
}

fn read() -> SystemFormat {
    let current = NSLocale::currentLocale();
    let language = current.languageCode().to_string();
    let locale = match current.regionCode() {
        Some(region) => format!("{language}-{region}"),
        None => language,
    };
    // The locale's skeleton for "hour" says which clock it uses: H/k is 24-hour, h/K 12-hour.
    let hour_pattern = NSDateFormatter::dateFormatFromTemplate_options_locale(&NSString::from_str("j"), 0, Some(&current));
    let hour24 = hour_pattern.is_some_and(|p| p.to_string().contains(['H', 'k']));
    SystemFormat { locale, hour24, first_weekday: NSCalendar::currentCalendar().firstWeekday() }
}

/// The current formats.
#[tauri::command]
pub fn system_format() -> SystemFormat {
    read()
}

/// Emits `system-format://changed` whenever macOS / iOS reports a locale change (`NSCurrentLocaleDidChangeNotification`).
pub fn watch(app: AppHandle) {
    let block = RcBlock::new(move |_: NonNull<NSNotification>| {
        if let Err(error) = app.emit(CHANGED_EVENT, read()) {
            log::warn!("[system-format] {CHANGED_EVENT} failed: {error}");
        }
    });
    // SAFETY: a valid notification name, no sender filter, posted on the posting thread; the block only emits.
    let observer = unsafe {
        NSNotificationCenter::defaultCenter().addObserverForName_object_queue_usingBlock(
            Some(NSCurrentLocaleDidChangeNotification),
            None,
            None,
            &block,
        )
    };
    // Observed for the app's lifetime.
    std::mem::forget(observer);
}
