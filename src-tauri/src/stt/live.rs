//! Live dictation: one stream on its own thread, returning committed and tentative text as audio arrives.

use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use transcribe_cpp::{Stream, StreamOptions};

use super::engine::{engine_error, Loaded};
use super::SttState;
use crate::models::gpu::{self, Priority};
use crate::models::LocalError;

/// The text so far: what's settled, then what's still being revised.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveText {
    committed: String,
    tentative: String,
}

impl LiveText {
    fn of(stream: &Stream<'_>) -> Self {
        let text = stream.text();
        LiveText { committed: text.committed, tentative: text.tentative }
    }
}

enum Request {
    Feed(Vec<f32>),
    /// End of audio: the final text is the answer.
    Finish,
}

type Reply = Result<LiveText, LocalError>;

/// A running dictation's handle; dropping it abandons the stream.
pub struct LiveSession {
    requests: Sender<(Request, Sender<Reply>)>,
}

impl LiveSession {
    /// Loads the model if needed and begins a stream; fails when the model can't stream.
    pub fn start(app: AppHandle, id: &'static str, path: PathBuf, language: String) -> Result<Self, LocalError> {
        let (requests, inbox) = mpsc::channel();
        let (ready, started) = mpsc::channel();
        thread::spawn(move || {
            let state = app.state::<SttState>();
            state.engine.touch();
            let outcome = state.engine.with_loaded(id, &path, |loaded| serve(loaded, &language, &ready, &inbox));
            if let Err(error) = outcome {
                // Before the stream began, the starter is still waiting for this.
                let _ = ready.send(Err(error));
            }
        });
        started.recv().map_err(|_| LocalError::Engine("live transcription stopped".into()))??;
        Ok(LiveSession { requests })
    }

    fn ask(&self, request: Request) -> Reply {
        let (reply, answer) = mpsc::channel();
        self.requests.send((request, reply)).map_err(|_| ended())?;
        answer.recv().map_err(|_| ended())?
    }

    pub fn feed(&self, pcm: Vec<f32>) -> Reply {
        self.ask(Request::Feed(pcm))
    }

    pub fn finish(self) -> Reply {
        self.ask(Request::Finish)
    }
}

fn ended() -> LocalError {
    LocalError::Engine("live transcription ended".into())
}

/// The stream's thread: begin, report ready, answer requests until Finish or the handle drops (cancel).
fn serve(loaded: &mut Loaded, language: &str, ready: &Sender<Result<(), LocalError>>, inbox: &Receiver<(Request, Sender<Reply>)>) -> Result<(), LocalError> {
    if !loaded.streams {
        return Err(LocalError::BadInput("this model can't transcribe live".into()));
    }
    let options = loaded.run_options(language);
    let mut stream = loaded.session.stream(&options, &StreamOptions::default()).map_err(engine_error)?;
    let _ = ready.send(Ok(()));
    for (request, reply) in inbox {
        let finishing = matches!(request, Request::Finish);
        let update = gpu::run(Priority::Realtime, || match request {
            Request::Feed(pcm) => stream.feed(&pcm),
            Request::Finish => stream.finalize(),
        });
        let _ = reply.send(update.map(|_| LiveText::of(&stream)).map_err(engine_error));
        if finishing {
            return Ok(());
        }
    }
    stream.reset();
    Ok(())
}

