//! iOS / iPadOS: the shared shell. Features join here as their modules become shared.

pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      // `create: false` in tauri.conf.json: the main window is built here on every platform.
      let main = app.config().app.windows.iter().find(|w| w.label == "main").cloned().ok_or("main window config missing")?;
      tauri::WebviewWindowBuilder::from_config(app.handle(), &main)?.build()?;

      if cfg!(debug_assertions) {
        app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
      }
      Ok(())
    })
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_http::init())
    .run(tauri::generate_context!())
    .expect("error while running Roci");
}
