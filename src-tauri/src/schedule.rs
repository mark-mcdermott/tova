/*!
What runs on its own while Tova is open — a port of the scheduling half of
`src/main/index.ts` and of `startDailyNoteSchedule` from `publish`'s neighbour,
`daily.ts`.

Two things happen without being asked: today's note comes into existence, and
the vault is backed up. Neither is a command, so neither has a place in the
bridge; what the renderer sees of them is one event when a note appears
underneath it.
*/

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::NaiveDate;

/// How often the date is checked.
///
/// The Electron version arms a timer for the exact distance to midnight, and
/// carries a wake handler and a focus handler because a single long timeout
/// cannot be trusted across a suspend — a machine asleep at midnight wakes with
/// yesterday's note still the newest.
///
/// Checking the date on a short interval needs none of that. A minute late is
/// not a thing anyone can notice in a note that is created rather than opened,
/// and there is no arithmetic about when midnight is, which is the part that
/// went wrong in Xin.
const DATE_CHECK: Duration = Duration::from_secs(60);

/// The backup interval is a preference, so the timer runs at the shortest
/// interval it allows and skips the ticks that are too early. Re-read every
/// tick rather than captured once, so changing it in Settings takes effect
/// without a restart.
const BACKUP_TICK: Duration = Duration::from_secs(5 * 60);

/// Somewhere to hang the threads' stop flag, so quitting does not leave them
/// running against a vault that is being torn down.
#[derive(Clone, Default)]
pub struct Schedule {
    stopped: Arc<AtomicBool>,
    /// The date today's note was last ensured for. Focus fires constantly, and
    /// a note the reader deliberately trashed should not spring back on every
    /// click into the window — so it is one check per date, not per event.
    ensured_for: Arc<Mutex<Option<NaiveDate>>>,
    nudge: Arc<(Mutex<bool>, std::sync::Condvar)>,
}

impl Schedule {
    pub fn stop(&self) {
        self.stopped.store(true, Ordering::Relaxed);
        self.wake();
    }

    /// Check again now — for the app regaining focus, which is the cheap way
    /// to notice a date change the moment somebody comes back to the window.
    pub fn refresh(&self) {
        self.wake();
    }

    fn wake(&self) {
        let (lock, condvar) = &*self.nudge;
        if let Ok(mut nudged) = lock.lock() {
            *nudged = true;
            condvar.notify_all();
        }
    }

    /// Sleeps, unless something asks for a check first. Returns false when the
    /// app is going away.
    fn rest(&self, how_long: Duration) -> bool {
        let (lock, condvar) = &*self.nudge;
        if let Ok(nudged) = lock.lock() {
            let (mut nudged, _) = condvar
                .wait_timeout(nudged, how_long)
                .unwrap_or_else(|e| e.into_inner());
            *nudged = false;
        }
        !self.stopped.load(Ordering::Relaxed)
    }
}

/// Today's note, made if it is not there. Returns whether one was made, so the
/// caller can tell the renderer something appeared underneath it.
fn ensure_today(schedule: &Schedule) -> bool {
    let today = crate::date::today();

    {
        let done = schedule
            .ensured_for
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if *done == Some(today) {
            return false;
        }
    }

    let existed = crate::notes::read(&format!(
        "daily/{}.md",
        crate::date::to_daily_note_name(&today)
    ))
    .is_ok();

    match crate::daily::ensure_daily_note(&today) {
        Ok(_) => {
            *schedule
                .ensured_for
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = Some(today);
            !existed
        }
        Err(error) => {
            // Said out loud rather than retried in a tight loop: the next tick
            // will try again a minute from now.
            eprintln!("Could not create today's daily note: {error}");
            false
        }
    }
}

/// Starts both loops. `changed` is called when a note appeared that the
/// renderer does not know about yet.
pub fn start(data_dir: std::path::PathBuf, changed: impl Fn() + Send + 'static) -> Schedule {
    let schedule = Schedule::default();

    let daily = schedule.clone();
    std::thread::spawn(move || loop {
        if ensure_today(&daily) {
            changed();
        }
        if !daily.rest(DATE_CHECK) {
            return;
        }
    });

    let backups = schedule.clone();
    std::thread::spawn(move || {
        let mut last_run = std::time::Instant::now();
        loop {
            if !backups.rest(BACKUP_TICK) {
                return;
            }

            let stored = crate::preferences::read(&data_dir);
            let every = Duration::from_secs(stored.backup_interval_minutes.max(1) as u64 * 60);
            if last_run.elapsed() < every {
                continue;
            }

            last_run = std::time::Instant::now();
            // A failed backup must never take the app down, but it must not
            // pass silently either.
            if let Err(error) = crate::backup::run_backup(
                &crate::backup::backup_root(),
                stored.backup_limit.max(0) as usize,
            ) {
                eprintln!("Backup failed: {error}");
            }
        }
    });

    schedule
}

/// What happens once, before the window opens.
///
/// The launch backup runs before the cleanup, so anything the sweep removes is
/// already captured in a restorable snapshot.
pub fn on_launch(data_dir: &std::path::Path) {
    let stored = crate::preferences::read(data_dir);

    if let Err(error) = crate::backup::run_backup(
        &crate::backup::backup_root(),
        stored.backup_limit.max(0) as usize,
    ) {
        eprintln!("Backup failed: {error}");
    }

    if let Err(error) = crate::daily::cleanup_blank_daily_notes(&crate::date::today()) {
        eprintln!("Daily note cleanup failed: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::{one_at_a_time, set_active_vault};

    struct Scratch {
        vault: std::path::PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = one_at_a_time();
            let vault = std::env::temp_dir().join(format!("tova-schedule-{name}"));
            let _ = std::fs::remove_dir_all(&vault);
            for section in ["notes", "daily", "trash"] {
                std::fs::create_dir_all(vault.join(section)).unwrap();
            }
            set_active_vault(Some(vault.clone()));
            Self { vault, _held: held }
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            set_active_vault(None);
            let _ = std::fs::remove_dir_all(&self.vault);
        }
    }

    #[test]
    fn todays_note_is_made_once_and_the_renderer_is_told_once() {
        let _s = Scratch::new("once");
        let schedule = Schedule::default();

        assert!(ensure_today(&schedule), "the first check should make it");
        assert!(!ensure_today(&schedule), "the second should not");
    }

    #[test]
    fn a_note_that_was_already_there_is_not_announced_as_new() {
        // Launch ensures one too, so the first tick usually finds it already
        // made — and telling the renderer to reload for a note it can already
        // see is a flicker for nothing.
        let _s = Scratch::new("existing");
        crate::daily::ensure_daily_note(&crate::date::today()).unwrap();

        assert!(!ensure_today(&Schedule::default()));
    }

    #[test]
    fn a_note_the_reader_trashed_does_not_spring_back_on_the_next_check() {
        /*
         * Focus fires constantly, and this is the state that stops a deleted
         * note reappearing on every click into the window. It comes back
         * tomorrow, which is the whole of what a daily note promises.
         */
        let _s = Scratch::new("trashed");
        let schedule = Schedule::default();
        ensure_today(&schedule);
        let id = format!(
            "daily/{}.md",
            crate::date::to_daily_note_name(&crate::date::today())
        );
        crate::notes::trash_note(&id).unwrap();

        assert!(!ensure_today(&schedule));
        assert!(crate::notes::read(&id).is_err());
    }

    #[test]
    fn a_check_asked_for_early_happens_without_waiting_out_the_interval() {
        // What focus does. If this did not work the test would take a minute.
        let schedule = Schedule::default();
        let waiting = schedule.clone();

        let handle = std::thread::spawn(move || waiting.rest(Duration::from_secs(600)));
        std::thread::sleep(Duration::from_millis(50));
        schedule.refresh();

        assert!(handle.join().expect("the thread finished"));
    }

    #[test]
    fn stopping_ends_the_wait_and_says_not_to_come_back() {
        let schedule = Schedule::default();
        let waiting = schedule.clone();

        let handle = std::thread::spawn(move || waiting.rest(Duration::from_secs(600)));
        std::thread::sleep(Duration::from_millis(50));
        schedule.stop();

        assert!(!handle.join().expect("the thread finished"));
    }
}
