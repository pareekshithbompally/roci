//! One GPU turn at a time across Roci's on-device engines (speech-to-text on Metal, MLX): Metal has no priority between
//! engines, so it is decided here. Speech-to-text goes first, then work someone waits for (a chat reply, read-aloud), then
//! background work (embeddings). Turns are handed over when one ends (Condvar), never polled. A long reply steps aside
//! between pieces while more urgent work waits; meanwhile only that work runs, never another MLX call (MLX isn't
//! thread-safe).

use std::sync::{Condvar, LazyLock, Mutex, MutexGuard};

use crate::sync::lock;

/// Who goes first: lower runs before higher.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Priority {
    /// Live and file speech-to-text: it must keep up with the meeting.
    Realtime = 0,
    /// A chat reply or read-aloud someone is waiting for.
    Interactive = 1,
    /// Indexing embeddings.
    Background = 2,
}

#[derive(Default)]
struct State {
    /// A turn is running.
    busy: bool,
    /// A turn that stepped aside for more urgent work: only work more urgent than it may run until it resumes.
    parked: Option<Priority>,
    /// Per priority, tickets handed out and tickets served: work of one priority runs first come, first served.
    issued: [u64; 3],
    served: [u64; 3],
}

impl State {
    fn waiting(&self, priority: usize) -> bool {
        self.issued[priority] > self.served[priority]
    }

    fn more_urgent_waiting(&self, priority: Priority) -> bool {
        (0..priority as usize).any(|p| self.waiting(p))
    }

    fn may_run(&self, priority: Priority, ticket: u64) -> bool {
        !self.busy
            && ticket == self.served[priority as usize]
            && !self.more_urgent_waiting(priority)
            && self.parked.is_none_or(|parked| priority < parked)
    }
}

#[derive(Default)]
struct Queue {
    state: Mutex<State>,
    handed_over: Condvar,
}

static QUEUE: LazyLock<Queue> = LazyLock::new(Queue::default);

impl Queue {
    /// Waits until `priority` may run and it's this caller's turn among its priority, then takes the turn.
    fn take<'a>(&'a self, mut state: MutexGuard<'a, State>, priority: Priority) -> MutexGuard<'a, State> {
        let ticket = state.issued[priority as usize];
        state.issued[priority as usize] += 1;
        while !state.may_run(priority, ticket) {
            state = self.handed_over.wait(state).unwrap_or_else(|poisoned| poisoned.into_inner());
        }
        state.served[priority as usize] += 1;
        state.busy = true;
        state
    }

    fn release(&self, mut state: MutexGuard<'_, State>) {
        state.busy = false;
        drop(state);
        self.handed_over.notify_all();
    }
}

/// The running turn; ending it (also by a panic) hands the GPU on.
struct Turn;

impl Drop for Turn {
    fn drop(&mut self) {
        QUEUE.release(lock(&QUEUE.state));
    }
}

/// Runs `work` in its turn on the GPU.
pub fn run<T>(priority: Priority, work: impl FnOnce() -> T) -> T {
    drop(QUEUE.take(lock(&QUEUE.state), priority));
    let _turn = Turn;
    work()
}

/// Called by running `priority` work between pieces (a reply's next tokens): when more urgent work waits, it runs now and
/// this resumes after it. Cheap when nothing waits.
pub fn step_aside(priority: Priority) {
    let mut state = lock(&QUEUE.state);
    if !state.more_urgent_waiting(priority) {
        return;
    }
    state.parked = Some(priority);
    state.busy = false;
    QUEUE.handed_over.notify_all();
    while state.busy || state.more_urgent_waiting(priority) {
        state = QUEUE.handed_over.wait(state).unwrap_or_else(|poisoned| poisoned.into_inner());
    }
    state.parked = None;
    state.busy = true;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;

    /// The tests share the one queue, so they run one after another.
    static SERIAL: Mutex<()> = Mutex::new(());

    fn settle() {
        thread::sleep(Duration::from_millis(30));
    }

    #[test]
    fn waiting_work_runs_most_urgent_first() {
        let _serial = lock(&SERIAL);
        let order = Arc::new(Mutex::new(Vec::new()));
        let (started, hold) = mpsc::channel::<()>();
        let (release, held) = mpsc::channel::<()>();
        let first = thread::spawn(move || {
            run(Priority::Background, || {
                started.send(()).unwrap();
                held.recv().unwrap();
            })
        });
        hold.recv().unwrap();
        let spawn = |priority, label: &'static str| {
            let order = Arc::clone(&order);
            thread::spawn(move || run(priority, || lock(&order).push(label)))
        };
        let background = spawn(Priority::Background, "background");
        settle();
        let interactive = spawn(Priority::Interactive, "interactive");
        settle();
        let realtime = spawn(Priority::Realtime, "realtime");
        settle();
        release.send(()).unwrap();
        for handle in [first, background, interactive, realtime] {
            handle.join().unwrap();
        }
        assert_eq!(*lock(&order), ["realtime", "interactive", "background"]);
    }

    #[test]
    fn a_long_reply_steps_aside_for_speech_to_text_and_nothing_else() {
        let _serial = lock(&SERIAL);
        let order = Arc::new(Mutex::new(Vec::new()));
        let (paused, wait_paused) = mpsc::channel::<()>();
        let (go_on, resume) = mpsc::channel::<()>();
        let reply = {
            let order = Arc::clone(&order);
            thread::spawn(move || {
                run(Priority::Interactive, || {
                    lock(&order).push("reply starts");
                    paused.send(()).unwrap();
                    resume.recv().unwrap();
                    step_aside(Priority::Interactive);
                    lock(&order).push("reply ends");
                })
            })
        };
        wait_paused.recv().unwrap();
        let embed = {
            let order = Arc::clone(&order);
            thread::spawn(move || run(Priority::Background, || lock(&order).push("embedding")))
        };
        let speech = {
            let order = Arc::clone(&order);
            thread::spawn(move || run(Priority::Realtime, || lock(&order).push("speech")))
        };
        settle();
        go_on.send(()).unwrap();
        for handle in [reply, embed, speech] {
            handle.join().unwrap();
        }
        assert_eq!(*lock(&order), ["reply starts", "speech", "reply ends", "embedding"]);
    }

    #[test]
    fn work_of_one_priority_runs_in_the_order_it_asked() {
        let _serial = lock(&SERIAL);
        let order = Arc::new(Mutex::new(Vec::new()));
        let (started, hold) = mpsc::channel::<()>();
        let (release, held) = mpsc::channel::<()>();
        let first = thread::spawn(move || {
            run(Priority::Realtime, || {
                started.send(()).unwrap();
                held.recv().unwrap();
            })
        });
        hold.recv().unwrap();
        let waiters: Vec<_> = (1..=3)
            .map(|n| {
                let order = Arc::clone(&order);
                let handle = thread::spawn(move || run(Priority::Realtime, || lock(&order).push(n)));
                settle();
                handle
            })
            .collect();
        release.send(()).unwrap();
        first.join().unwrap();
        for handle in waiters {
            handle.join().unwrap();
        }
        assert_eq!(*lock(&order), [1, 2, 3]);
    }

    #[test]
    fn stepping_aside_with_nothing_waiting_keeps_the_turn() {
        let _serial = lock(&SERIAL);
        let ran = run(Priority::Interactive, || {
            step_aside(Priority::Interactive);
            true
        });
        assert!(ran);
        assert!(!lock(&QUEUE.state).busy);
    }
}
