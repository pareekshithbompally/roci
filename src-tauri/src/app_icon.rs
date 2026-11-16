//! An app's icon as macOS shows it (Finder, Calendar, …), by bundle id or path, rendered to a PNG `data:` URL.

use base64::Engine;
use objc2::AnyThread;
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSWorkspace};
use objc2_foundation::{NSDictionary, NSPoint, NSRect, NSSize, NSString};

/// Rendered square edge in pixels: crisp at the kit's icon sizes on a 2× display.
const ICON_PIXELS: f64 = 64.0;

/// Where `app` lives: a bundle id (`com.apple.finder`) resolved through Launch Services, or a path as given.
fn locate(workspace: &NSWorkspace, app: &str) -> Option<String> {
    if app.starts_with('/') {
        return std::path::Path::new(app).exists().then(|| app.to_string());
    }
    let url = workspace.URLForApplicationWithBundleIdentifier(&NSString::from_str(app))?;
    Some(url.path()?.to_string())
}

fn render(app: &str) -> Option<String> {
    let workspace = NSWorkspace::sharedWorkspace();
    let image = workspace.iconForFile(&NSString::from_str(&locate(&workspace, app)?));
    let mut rect = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(ICON_PIXELS, ICON_PIXELS));
    let cg_image = unsafe { image.CGImageForProposedRect_context_hints(&mut rect, None, None) }?;
    let bitmap = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), &cg_image);
    let png = unsafe { bitmap.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new()) }?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(png.to_vec());
    Some(format!("data:image/png;base64,{encoded}"))
}

/// The icon for `app` (bundle id or path); `None` when it isn't installed or macOS can't draw it.
#[tauri::command]
pub async fn app_icon(app: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || render(&app))
        .await
        .map_err(|error| format!("app icon task failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finder_renders_by_bundle_id_and_missing_apps_are_none() {
        assert!(render("com.apple.finder").is_some_and(|url| url.starts_with("data:image/png;base64,")));
        assert!(render("com.example.not-installed").is_none());
        assert!(render("/nowhere/Nothing.app").is_none());
    }
}
