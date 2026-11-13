//! The user's login-shell `PATH`.
//!
//! A macOS app launched from Finder/Dock inherits launchd's minimal `PATH`
//! (`/usr/bin:/bin:/usr/sbin:/sbin`), so `npx`/`uvx` from Homebrew, nvm or
//! volta are not found and every stdio server fails to spawn. Jan avoids this
//! by bundling bun/uv; Kasset asks the login shell once instead.

use std::time::Duration;
use tokio::{process::Command, sync::OnceCell, time::timeout};

const SHELL_TIMEOUT: Duration = Duration::from_secs(5);
const FALLBACK_SHELL: &str = "/bin/zsh";

static LOGIN_PATH: OnceCell<Option<String>> = OnceCell::const_new();

/// `PATH` as the user's interactive login shell sets it, or `None` when the
/// shell could not be asked (the inherited `PATH` is then used as-is).
pub async fn login_path() -> Option<String> {
    LOGIN_PATH.get_or_init(query_login_path).await.clone()
}

async fn query_login_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| FALLBACK_SHELL.to_string());
    let output = timeout(
        SHELL_TIMEOUT,
        Command::new(&shell).args(["-ilc", "printf %s \"$PATH\""]).output(),
    )
    .await;
    match output {
        Ok(Ok(out)) if out.status.success() => {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            (!path.is_empty()).then_some(path)
        }
        Ok(Ok(out)) => {
            log::warn!("[mcp] login shell exited with {}; using inherited PATH", out.status);
            None
        }
        Ok(Err(e)) => {
            log::warn!("[mcp] could not run login shell {shell}: {e}; using inherited PATH");
            None
        }
        Err(_) => {
            log::warn!("[mcp] login shell timed out; using inherited PATH");
            None
        }
    }
}
