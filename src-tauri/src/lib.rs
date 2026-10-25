use std::path::PathBuf;
use std::sync::Mutex;

use tauri::ipc::{InvokeBody, Request};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

/// Where the next `write_saved_file` goes, chosen by the user in `choose_save_path`.
///
/// Saving is two calls because the two halves want different transports: the file name is
/// ordinary JSON (and may hold any characters — snapshot names carry the object's name),
/// while the payload is raw bytes, which only travel efficiently as an unencoded request
/// body. A gallery zip can run to hundreds of megabytes, so it must not go through JSON.
#[derive(Default)]
struct PendingSave(Mutex<Option<PathBuf>>);

/// Opens the native Save panel, starting in Downloads with `file_name` filled in. Returns
/// false if the user cancels, so the page can say nothing was saved.
///
/// This exists because the web app saves with an `<a download>` click, which does nothing
/// at all inside the macOS app's WebKit window — gallery exports and snapshots silently
/// went nowhere.
#[tauri::command]
async fn choose_save_path(
    app: tauri::AppHandle,
    pending: State<'_, PendingSave>,
    file_name: String,
) -> Result<bool, String> {
    let mut dialog = app.dialog().file().set_file_name(&file_name);
    if let Ok(dir) = app.path().download_dir() {
        dialog = dialog.set_directory(dir);
    }

    // Async commands run off the main thread, which is what the blocking form requires.
    let chosen = dialog
        .blocking_save_file()
        .map(|p| p.into_path().map_err(|e| e.to_string()))
        .transpose()?;

    let picked = chosen.is_some();
    *pending.0.lock().map_err(|e| e.to_string())? = chosen;
    Ok(picked)
}

/// Writes the raw request body to the path `choose_save_path` just picked.
#[tauri::command]
async fn write_saved_file(pending: State<'_, PendingSave>, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the file as raw bytes".into());
    };
    let path = pending
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("no save location was chosen")?;
    std::fs::write(&path, bytes).map_err(|e| format!("could not write {}: {e}", path.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(PendingSave::default())
    .invoke_handler(tauri::generate_handler![choose_save_path, write_saved_file])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
