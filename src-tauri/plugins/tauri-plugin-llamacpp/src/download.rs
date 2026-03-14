use crate::commands::LlamaCppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Runtime, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub percent: u8,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadResult {
    pub path: String,
    pub size: u64,
}

/// Download a file from `url` to `dest_path` with streaming (no memory buffering).
/// Emits `llamacpp://download-progress` events so the frontend can show a progress bar.
/// Checks the cancellation flag each chunk — call `cancel_download` to abort.
#[tauri::command]
pub async fn download_file<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, LlamaCppState>,
    url: String,
    dest_path: String,
    headers: HashMap<String, String>,
) -> Result<DownloadResult, String> {
    use tokio::io::AsyncWriteExt;

    log::info!("[llamacpp] download_file url={} dest={}", url, dest_path);

    // Reset cancellation flag at start of new download
    state.download_cancelled.store(false, Ordering::Relaxed);

    // Ensure parent directory exists
    if let Some(parent) = Path::new(&dest_path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Build request
    let client = reqwest::Client::new();
    let mut req = client.get(&url);
    for (key, value) in &headers {
        req = req.header(key.as_str(), value.as_str());
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Download failed: {} {}",
            resp.status().as_u16(),
            resp.status().canonical_reason().unwrap_or("Unknown")
        ));
    }

    let total_bytes = resp.content_length().unwrap_or(0);

    // Open destination file
    let mut file = tokio::fs::File::create(&dest_path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    // Stream chunks directly to disk
    let mut stream = resp.bytes_stream();
    let mut bytes_downloaded: u64 = 0;
    let mut last_emitted_percent: u8 = 0;
    let cancelled = state.download_cancelled.clone();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        // Check for cancellation
        if cancelled.load(Ordering::Relaxed) {
            drop(file);
            let _ = tokio::fs::remove_file(&dest_path).await;
            log::info!("[llamacpp] download_file cancelled by user");
            return Err("Download cancelled".to_string());
        }

        let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {}", e))?;

        bytes_downloaded += chunk.len() as u64;

        // Emit progress at most every 1% change to avoid flooding
        let percent = if total_bytes > 0 {
            ((bytes_downloaded as f64 / total_bytes as f64) * 100.0) as u8
        } else {
            0
        };

        if percent != last_emitted_percent {
            last_emitted_percent = percent;
            let _ = app.emit(
                "llamacpp://download-progress",
                DownloadProgress {
                    bytes_downloaded,
                    total_bytes,
                    percent,
                },
            );
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;

    log::info!(
        "[llamacpp] download_file complete: {} bytes",
        bytes_downloaded
    );

    Ok(DownloadResult {
        path: dest_path,
        size: bytes_downloaded,
    })
}

/// Signal the active download to cancel. The download loop checks this flag each chunk.
#[tauri::command]
pub async fn cancel_download(
    state: State<'_, LlamaCppState>,
) -> Result<(), String> {
    log::info!("[llamacpp] cancel_download requested");
    state.download_cancelled.store(true, Ordering::Relaxed);
    Ok(())
}

/// Extract a .zip or .tar.gz archive to `dest_dir`.
/// Automatically sets executable permissions on Unix for extracted files.
/// Returns the list of extracted file paths.
#[tauri::command]
pub async fn extract_archive(
    archive_path: String,
    dest_dir: String,
) -> Result<Vec<String>, String> {
    log::info!(
        "[llamacpp] extract_archive: {} -> {}",
        archive_path,
        dest_dir
    );

    // Ensure dest dir exists
    tokio::fs::create_dir_all(&dest_dir)
        .await
        .map_err(|e| format!("Failed to create dest dir: {}", e))?;

    let archive = archive_path.clone();
    let dest = dest_dir.clone();

    // Run extraction in a blocking task
    let extracted = tokio::task::spawn_blocking(move || -> Result<Vec<String>, String> {
        if archive.ends_with(".zip") {
            extract_zip(&archive, &dest)
        } else if archive.ends_with(".tar.gz") || archive.ends_with(".tgz") {
            extract_tar_gz(&archive, &dest)
        } else {
            Err(format!("Unsupported archive format: {}", archive))
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    log::info!(
        "[llamacpp] extract_archive complete: {} files",
        extracted.len()
    );

    Ok(extracted)
}

fn extract_zip(archive_path: &str, dest_dir: &str) -> Result<Vec<String>, String> {
    use std::fs;
    use std::io;

    let file = fs::File::open(archive_path).map_err(|e| format!("Open zip failed: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Read zip failed: {}", e))?;

    let mut extracted = Vec::new();
    let dest = Path::new(dest_dir);

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Zip entry error: {}", e))?;

        let out_path = dest.join(entry.mangled_name());

        if entry.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("Create dir failed: {}", e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Create parent dir failed: {}", e))?;
            }

            let mut outfile = fs::File::create(&out_path)
                .map_err(|e| format!("Create file failed: {}", e))?;
            io::copy(&mut entry, &mut outfile)
                .map_err(|e| format!("Extract file failed: {}", e))?;

            // Set executable permissions on Unix
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = entry.unix_mode() {
                    fs::set_permissions(&out_path, fs::Permissions::from_mode(mode)).ok();
                } else {
                    // Default: make files executable if they look like binaries
                    let name = out_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("");
                    if !name.contains('.') || name.ends_with(".sh") {
                        fs::set_permissions(
                            &out_path,
                            fs::Permissions::from_mode(0o755),
                        )
                        .ok();
                    }
                }
            }

            extracted.push(out_path.to_string_lossy().to_string());
        }
    }

    Ok(extracted)
}

fn extract_tar_gz(archive_path: &str, dest_dir: &str) -> Result<Vec<String>, String> {
    use std::fs;

    let file =
        fs::File::open(archive_path).map_err(|e| format!("Open tar.gz failed: {}", e))?;
    let decoder =
        flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(decoder);

    let dest = Path::new(dest_dir);
    let mut extracted = Vec::new();

    for entry in archive
        .entries()
        .map_err(|e| format!("Read tar entries failed: {}", e))?
    {
        let mut entry = entry.map_err(|e| format!("Tar entry error: {}", e))?;
        let path = entry
            .path()
            .map_err(|e| format!("Tar path error: {}", e))?
            .into_owned();

        let out_path = dest.join(&path);

        // Ensure parent directories exist (archive may have nested dirs like llama-b8149/)
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Create parent dir failed for {}: {}", parent.display(), e))?;
        }

        entry
            .unpack(&out_path)
            .map_err(|e| format!("Unpack error: failed to unpack `{}` into `{}`: {}", path.display(), out_path.display(), e))?;

        if out_path.is_file() {
            // Set executable permissions on Unix for binary-looking files
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let name = out_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("");
                if !name.contains('.') || name.ends_with(".sh") {
                    fs::set_permissions(&out_path, fs::Permissions::from_mode(0o755)).ok();
                }
            }

            extracted.push(out_path.to_string_lossy().to_string());
        }
    }

    Ok(extracted)
}
