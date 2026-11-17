//! The bundled model servers (`externalBin`): each serves one model over localhost in its own process, so a ggml
//! abort can't take Roci down. Started on first use, ready once it logs its address, stopped on a model switch, a
//! delete and quit; a pid file lets the next launch stop a server a crashed Roci left behind.

use std::collections::VecDeque;
use std::ffi::OsString;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::models::LocalError;
use crate::sync::lock;

pub const LOCALHOST: &str = "127.0.0.1";
/// Both servers log `listening on[:] http://host:port` once the model is loaded and requests are accepted.
const READY_MARK: &str = "listening on";
/// Loading a multi-GB model from a cold disk; past this the start counts as failed.
const READY_TIMEOUT: Duration = Duration::from_secs(180);
/// Last log lines kept to explain a failed start.
const ERROR_TAIL_LINES: usize = 3;

/// How to start a server for one model.
pub struct Launch {
    pub args: Vec<OsString>,
    /// Secrets go here, never in `args` (any process can read another's arguments).
    pub envs: Vec<(&'static str, String)>,
}

struct Running {
    model_id: &'static str,
    url: String,
    child: Child,
}

pub struct ModelServer {
    binary: &'static str,
    /// What this instance serves ("image", "chat" …): one binary can run as several servers.
    role: &'static str,
    running: Mutex<Option<Running>>,
}

impl ModelServer {
    pub const fn new(binary: &'static str, role: &'static str) -> Self {
        Self { binary, role, running: Mutex::new(None) }
    }

    /// The base URL of the server running `model_id`, starting (or switching) it with `launch` when needed.
    /// Blocks while the model loads.
    pub fn ensure(&self, model_id: &'static str, launch: impl FnOnce() -> Result<Launch, LocalError>) -> Result<String, LocalError> {
        let mut running = lock(&self.running);
        if let Some(current) = running.as_mut() {
            if current.model_id == model_id && current.child.try_wait()?.is_none() {
                return Ok(current.url.clone());
            }
        }
        if let Some(previous) = running.take() {
            self.shut_down(previous);
        }
        let started = self.start(model_id, launch()?)?;
        let url = started.url.clone();
        *running = Some(started);
        Ok(url)
    }

    pub fn stop(&self) {
        if let Some(running) = lock(&self.running).take() {
            self.shut_down(running);
        }
    }

    /// Stops the server if it runs the model about to be deleted.
    pub fn forget(&self, model_id: &str) {
        let mut running = lock(&self.running);
        if running.as_ref().is_some_and(|r| r.model_id == model_id) {
            if let Some(stopped) = running.take() {
                self.shut_down(stopped);
            }
        }
    }

    /// Stops a server left running by a Roci that didn't quit cleanly (only if that pid is still our binary).
    pub fn stop_orphan(&self) {
        let pid_file = self.pid_file();
        let Ok(pid) = std::fs::read_to_string(&pid_file).map(|text| text.trim().parse::<i32>()) else {
            return;
        };
        if let (Ok(pid), Ok(binary)) = (pid, self.path()) {
            if executable_of(pid).is_some_and(|path| path == binary) {
                // SAFETY: plain syscall on a pid we verified runs our own server binary.
                unsafe { libc::kill(pid, libc::SIGKILL) };
                log::info!("[model_server] Stopped the {} server left running by an earlier session (pid {pid})", self.role);
            }
        }
        let _ = std::fs::remove_file(pid_file);
    }

    fn path(&self) -> Result<PathBuf, LocalError> {
        let path = std::env::current_exe()?.with_file_name(self.binary);
        if path.is_file() {
            Ok(path)
        } else {
            Err(LocalError::Engine(format!("{} isn't bundled with this build (run scripts/build-servers.sh)", self.binary)))
        }
    }

    fn pid_file(&self) -> PathBuf {
        std::env::temp_dir().join(format!("{}.{}.pid", env!("CARGO_PKG_NAME"), self.role))
    }

    /// Starts the server and waits for its ready line; an exit or the deadline before it is an error.
    fn start(&self, model_id: &'static str, launch: Launch) -> Result<Running, LocalError> {
        let mut child = Command::new(self.path()?)
            .args(&launch.args)
            .envs(launch.envs.iter().map(|(key, value)| (key, value)))
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        let _ = std::fs::write(self.pid_file(), child.id().to_string());

        let (lines, logged) = mpsc::channel();
        drain(child.stdout.take(), lines.clone());
        drain(child.stderr.take(), lines);

        let deadline = Instant::now() + READY_TIMEOUT;
        let mut tail = VecDeque::with_capacity(ERROR_TAIL_LINES);
        let failure = loop {
            match logged.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                Ok(line) => match ready_url(&line) {
                    Some(url) => return Ok(Running { model_id, url, child }),
                    None => remember(&mut tail, line),
                },
                Err(RecvTimeoutError::Timeout) => break format!("{} didn't load {model_id} in time", self.binary),
                Err(RecvTimeoutError::Disconnected) => break format!("{} stopped while loading {model_id}", self.binary),
            }
        };
        self.shut_down(Running { model_id, url: String::new(), child });
        let detail = tail.into_iter().collect::<Vec<_>>().join("\n");
        log::warn!("[model_server] {failure}: {detail}");
        Err(LocalError::Engine(if detail.is_empty() { failure } else { detail }))
    }

    fn shut_down(&self, mut running: Running) {
        let _ = running.child.kill();
        let _ = running.child.wait();
        let _ = std::fs::remove_file(self.pid_file());
    }
}

/// Reads a server's output to its end on its own thread (a full pipe would stall the server); lines go to whoever
/// still listens (the start, until ready) and are dropped after.
fn drain(stream: Option<impl Read + Send + 'static>, lines: Sender<String>) {
    let Some(stream) = stream else { return };
    std::thread::spawn(move || {
        for line in BufReader::new(stream).lines().map_while(Result::ok) {
            let _ = lines.send(line);
        }
    });
}

/// The `http://host:port` of a ready line.
fn ready_url(line: &str) -> Option<String> {
    let (_, rest) = line.split_once(READY_MARK)?;
    let start = rest.find("http://")?;
    let url = rest[start..].split_whitespace().next()?;
    Some(url.trim_end_matches('/').to_string())
}

fn remember(tail: &mut VecDeque<String>, line: String) {
    if line.trim().is_empty() {
        return;
    }
    if tail.len() == ERROR_TAIL_LINES {
        tail.pop_front();
    }
    tail.push_back(line);
}

/// The executable a process runs, if it's alive and ours to see.
fn executable_of(pid: i32) -> Option<PathBuf> {
    let mut buffer = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    // SAFETY: `buffer` outlives the call and its length is passed with it.
    let written = unsafe { libc::proc_pidpath(pid, buffer.as_mut_ptr().cast(), buffer.len() as u32) };
    let length = usize::try_from(written).ok().filter(|&n| n > 0)?;
    Some(PathBuf::from(String::from_utf8_lossy(&buffer[..length]).into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ready_lines_of_both_servers_give_their_url() {
        assert_eq!(ready_url("0.09.491 I srv  server_on_li: listening on http://127.0.0.1:18765").as_deref(), Some("http://127.0.0.1:18765"));
        assert_eq!(ready_url("[INFO ] main.cpp:168 - listening on: http://127.0.0.1:4242\n").as_deref(), Some("http://127.0.0.1:4242"));
        assert_eq!(ready_url("load_model: loading model"), None);
    }

    #[test]
    fn tail_keeps_the_last_lines() {
        let mut tail = VecDeque::new();
        for line in ["a", "", "b", "c", "d"] {
            remember(&mut tail, line.to_string());
        }
        assert_eq!(tail.into_iter().collect::<Vec<_>>(), ["b", "c", "d"]);
    }

    #[test]
    fn this_process_is_found_by_its_pid() {
        let me = executable_of(std::process::id() as i32).unwrap();
        assert_eq!(me, std::env::current_exe().unwrap());
    }
}
