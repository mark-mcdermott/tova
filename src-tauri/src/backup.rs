/*!
The versions a note keeps behind it — a port of the version half of
`src/main/backup.ts` and `src/shared/backup.ts`.

Two kinds of copy, and the difference is what they are for. A version is the
last few states of one note, taken automatically as it is typed. A backup is
the whole vault at one moment, taken on launch and before a restore.
*/

use chrono::{DateTime, Datelike, Local, TimeZone, Timelike};
use serde::Serialize;
use std::path::{Path, PathBuf};

use crate::vault::vault_root;
use crate::vault_file::{read_vault_text, write_vault_text};

pub const DEFAULT_BACKUP_LIMIT: usize = 30;
pub const DEFAULT_VERSION_LIMIT: usize = 10;

/// Autosave fires constantly; versions are only worth keeping this far apart.
const VERSION_INTERVAL_MS: i64 = 5 * 60 * 1000;

const VERSIONS_DIR: &str = ".versions";

/// Dated folder name for one backup. Local time and a lexically sortable shape,
/// so sorting names chronologically needs no parsing.
pub fn backup_folder_name(date: &DateTime<Local>) -> String {
    format!(
        "{:04}-{:02}-{:02}_{:02}-{:02}-{:02}",
        date.year(),
        date.month(),
        date.day(),
        date.hour(),
        date.minute(),
        date.second()
    )
}

/*
 * The round trip is the validation, the way the TypeScript does it: JavaScript
 * rolls a nonsense date over rather than refusing it, so `2026-13-01` becomes
 * January of 2027 and only formatting it again catches that.
 *
 * Rust refuses outright instead, and the round trip is kept anyway — it also
 * catches the hour that does not exist on the morning the clocks go forward,
 * which neither language will hand back unchanged.
 */
pub fn parse_backup_folder_name(name: &str) -> Option<DateTime<Local>> {
    let digits: Vec<&str> = name
        .split(['-', '_'])
        .filter(|part| !part.is_empty())
        .collect();
    if digits.len() != 6 || digits[0].len() != 4 || digits[1..].iter().any(|d| d.len() != 2) {
        return None;
    }

    let n: Vec<u32> = digits
        .iter()
        .map(|d| d.parse().ok())
        .collect::<Option<_>>()?;

    // `earliest` for the hour that happens twice when the clocks go back,
    // which is the one JavaScript's Date constructor also picks.
    let date = Local
        .with_ymd_and_hms(n[0] as i32, n[1], n[2], n[3], n[4], n[5])
        .earliest()?;

    (backup_folder_name(&date) == name).then_some(date)
}

/// Flattens a note id into a single directory name, since ids contain slashes.
/// `notes/ideas/river.md` becomes `notes__ideas__river.md`.
pub fn version_key(note_id: &str) -> String {
    note_id.replace('/', "__")
}

pub fn version_file_name(date: &DateTime<Local>) -> String {
    format!("{}.md", backup_folder_name(date))
}

/*
 * Newest first.
 *
 * The TypeScript sorted these with `localeCompare` and no longer does — see
 * `compareTitles` for why that had to go. These names are a fixed ASCII shape
 * where the two agree anyway, so nothing about the order changes; what changes
 * is that it no longer depends on the machine.
 */
fn newest_first(names: &[String]) -> Vec<String> {
    let mut versions: Vec<String> = names
        .iter()
        .filter(|name| name.ends_with(".md"))
        .cloned()
        .collect();
    versions.sort_by(|a, b| crate::js::compare(b, a));
    versions
}

/// Versions past `keep`, oldest first.
pub fn select_expired_versions(names: &[String], keep: usize) -> Vec<String> {
    newest_first(names).split_off(keep.min(names.len()))
}

fn version_dir(note_id: &str) -> PathBuf {
    vault_root().join(VERSIONS_DIR).join(version_key(note_id))
}

fn markdown_in(directory: &PathBuf) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".md"))
        .collect()
}

/// Snapshots a note's previous contents, at most once per interval, keeping the
/// most recent ten.
pub fn save_version(note_id: &str, content: &str, now: &DateTime<Local>) -> Result<(), String> {
    let directory = version_dir(note_id);
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;

    let existing = markdown_in(&directory);
    let newest = newest_first(&existing).into_iter().next();
    if let Some(newest) = newest {
        let taken_at = parse_backup_folder_name(newest.trim_end_matches(".md"));
        if let Some(taken_at) = taken_at {
            if now.timestamp_millis() - taken_at.timestamp_millis() < VERSION_INTERVAL_MS {
                return Ok(());
            }
        }
    }

    write_vault_text(&directory.join(version_file_name(now)), content)?;

    for expired in select_expired_versions(&markdown_in(&directory), DEFAULT_VERSION_LIMIT) {
        let _ = std::fs::remove_file(directory.join(expired));
    }
    Ok(())
}

pub fn list_versions(note_id: &str) -> Vec<String> {
    newest_first(&markdown_in(&version_dir(note_id)))
}

pub fn read_version(note_id: &str, version: &str) -> Result<String, String> {
    if parse_backup_folder_name(version.trim_end_matches(".md")).is_none() {
        return Err(format!("Unknown version: {version}"));
    }
    read_vault_text(&version_dir(note_id).join(version))
}

/*
 * Whole-vault backups: the other half of backup.ts, and the reason any of this
 * exists. A vault is a folder of files, so a backup is a copy of that folder,
 * named for the moment it was taken.
 */

/*
 * Kept beside the vault rather than inside it, so backups never nest.
 *
 * Every function below takes the root rather than reaching for this, the way
 * the preferences functions take a data directory. Not only for symmetry: what
 * `restore_backup` does is delete a directory and copy another over it, and a
 * test that got the root from the environment would be one bad default away
 * from doing that to somebody's real Documents folder.
 */
pub fn backup_root() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default())
        .join("Documents")
        .join("Tova Backups")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub name: String,
    pub created_at: f64,
    pub note_count: usize,
}

fn count_markdown(directory: &Path) -> usize {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name == VERSIONS_DIR {
                0
            } else if entry.path().is_dir() {
                count_markdown(&entry.path())
            } else {
                usize::from(name.ends_with(".md"))
            }
        })
        .sum()
}

fn summarize(root: &Path, name: &str) -> BackupSummary {
    BackupSummary {
        created_at: parse_backup_folder_name(name)
            .map(|at| at.timestamp_millis() as f64)
            .unwrap_or(0.0),
        note_count: count_markdown(&root.join(name)),
        name: name.to_string(),
    }
}

fn names_in(directory: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect()
}

/// Newest first. Entries that are not backup folders are dropped.
fn sort_backups(names: &[String]) -> Vec<String> {
    let mut found: Vec<String> = names
        .iter()
        .filter(|name| parse_backup_folder_name(name).is_some())
        .cloned()
        .collect();
    found.sort_by(|a, b| crate::js::compare(b, a));
    found
}

/// The backups beyond `keep` that should be pruned, oldest included first.
fn select_expired_backups(names: &[String], keep: usize) -> Vec<String> {
    let mut sorted = sort_backups(names);
    let from = keep.min(sorted.len());
    sorted.split_off(from)
}

pub fn list_backups(root: &Path) -> Vec<BackupSummary> {
    sort_backups(&names_in(root))
        .iter()
        .map(|name| summarize(root, name))
        .collect()
}

fn prune_backups(root: &Path, limit: usize) {
    for name in select_expired_backups(&names_in(root), limit) {
        let _ = std::fs::remove_dir_all(root.join(name));
    }
}

/// Copies a directory tree. `cp -r`, which the standard library does not have.
fn copy_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;

    for entry in std::fs::read_dir(from)?.flatten() {
        let target = to.join(entry.file_name());
        // `file_type` rather than `path().is_dir()`: a symlink into the vault
        // should be copied as the link it is, not followed into a loop.
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else if kind.is_file() {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Finds a free folder name, stepping forward a second at a time on collision.
/// Skipping the run instead would silently drop the safety copy `restore` takes,
/// which is the one backup that must never be missed.
fn reserve_backup_name(root: &Path, at: &DateTime<Local>) -> Result<String, String> {
    let mut candidate = *at;

    for _ in 0..120 {
        let name = backup_folder_name(&candidate);
        if !root.join(&name).exists() {
            return Ok(name);
        }
        candidate += chrono::Duration::seconds(1);
    }

    Err("Could not find a free backup folder name".into())
}

pub fn run_backup(root: &Path, limit: usize) -> Result<BackupSummary, String> {
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;

    let name = reserve_backup_name(root, &Local::now())?;
    copy_tree(&vault_root(), &root.join(&name)).map_err(|e| e.to_string())?;
    prune_backups(root, limit);

    Ok(summarize(root, &name))
}

/// Replaces the vault with a backup. The current vault is backed up first, so
/// restoring the wrong snapshot is itself recoverable.
pub fn restore_backup(root: &Path, name: &str) -> Result<BackupSummary, String> {
    if parse_backup_folder_name(name).is_none() {
        return Err(format!("Unknown backup: {name}"));
    }

    let source = root.join(name);
    if !source.is_dir() {
        return Err(format!("Unknown backup: {name}"));
    }

    // Before anything is removed, and propagating rather than ignored: if the
    // safety copy cannot be taken, the restore does not happen.
    run_backup(root, DEFAULT_BACKUP_LIMIT)?;

    let vault = vault_root();
    std::fs::remove_dir_all(&vault).map_err(|e| e.to_string())?;
    copy_tree(&source, &vault).map_err(|e| e.to_string())?;

    Ok(summarize(root, name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::{one_at_a_time, set_active_vault};

    /*
     * A vault and a backup root, both under this test's own directory. The
     * root is passed in rather than looked up precisely so that this is
     * possible: `restore_backup` removes a directory and copies another over
     * it, and that is not an operation to point at a real Documents folder.
     */
    struct Scratch {
        vault: PathBuf,
        backups: PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = one_at_a_time();
            let base = std::env::temp_dir().join(format!("tova-backup-{name}"));
            let _ = std::fs::remove_dir_all(&base);
            let (vault, backups) = (base.join("vault"), base.join("backups"));
            std::fs::create_dir_all(vault.join("notes")).unwrap();
            std::fs::create_dir_all(&backups).unwrap();
            set_active_vault(Some(vault.clone()));
            Self {
                vault,
                backups,
                _held: held,
            }
        }

        fn note(&self, name: &str, body: &str) {
            std::fs::write(self.vault.join("notes").join(name), body).unwrap();
        }

        fn fake(&self, name: &str) {
            std::fs::create_dir_all(self.backups.join(name).join("notes")).unwrap();
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            set_active_vault(None);
            let _ = std::fs::remove_dir_all(self.vault.parent().unwrap());
        }
    }

    fn at(text: &str) -> DateTime<Local> {
        parse_backup_folder_name(text).expect("a backup name")
    }

    #[test]
    fn a_backup_is_a_copy_of_the_whole_vault() {
        let s = Scratch::new("run");
        s.note("slow-morning.md", "Coffee.");
        std::fs::create_dir_all(s.vault.join("notes/work")).unwrap();
        std::fs::write(s.vault.join("notes/work/filed.md"), "Filed.").unwrap();

        let summary = run_backup(&s.backups, DEFAULT_BACKUP_LIMIT).unwrap();

        let copied = s.backups.join(&summary.name);
        assert_eq!(
            std::fs::read_to_string(copied.join("notes/slow-morning.md")).unwrap(),
            "Coffee."
        );
        assert_eq!(
            std::fs::read_to_string(copied.join("notes/work/filed.md")).unwrap(),
            "Filed."
        );
        assert_eq!(summary.note_count, 2);
    }

    #[test]
    fn the_versions_directory_is_not_counted_as_notes() {
        // They are copies of one note, not notes, and counting them would tell
        // the reader their vault is several times the size it is.
        let s = Scratch::new("count");
        s.note("slow-morning.md", "Coffee.");
        std::fs::create_dir_all(s.vault.join(".versions/notes__slow-morning.md")).unwrap();
        std::fs::write(
            s.vault
                .join(".versions/notes__slow-morning.md/2026-09-03_10-00-00.md"),
            "older",
        )
        .unwrap();

        assert_eq!(
            run_backup(&s.backups, DEFAULT_BACKUP_LIMIT)
                .unwrap()
                .note_count,
            1
        );
    }

    #[test]
    fn two_backups_in_the_same_second_do_not_become_one() {
        /*
         * The name is the second it was taken in, so a second run inside the
         * same second collides. Stepping forward matters because `restore`
         * takes a safety copy first: skipping the run on collision would drop
         * the one backup that must never be missed.
         */
        let s = Scratch::new("collide");
        s.note("a.md", "A.");

        let first = reserve_backup_name(&s.backups, &at("2026-09-03_10-00-00")).unwrap();
        s.fake(&first);
        let second = reserve_backup_name(&s.backups, &at("2026-09-03_10-00-00")).unwrap();

        assert_eq!(first, "2026-09-03_10-00-00");
        assert_eq!(second, "2026-09-03_10-00-01");
    }

    #[test]
    fn backups_are_listed_newest_first_and_strangers_are_left_out() {
        let s = Scratch::new("list");
        for name in [
            "2026-09-01_10-00-00",
            "2026-09-03_10-00-00",
            "2026-09-02_10-00-00",
        ] {
            s.fake(name);
        }
        std::fs::create_dir_all(s.backups.join("not-a-backup")).unwrap();

        let names: Vec<String> = list_backups(&s.backups)
            .into_iter()
            .map(|b| b.name)
            .collect();

        assert_eq!(
            names,
            [
                "2026-09-03_10-00-00",
                "2026-09-02_10-00-00",
                "2026-09-01_10-00-00"
            ]
        );
    }

    #[test]
    fn old_backups_are_pruned_and_the_newest_are_kept() {
        let s = Scratch::new("prune");
        for day in 1..=5 {
            s.fake(&format!("2026-09-0{day}_10-00-00"));
        }

        prune_backups(&s.backups, 3);

        let names: Vec<String> = list_backups(&s.backups)
            .into_iter()
            .map(|b| b.name)
            .collect();
        assert_eq!(
            names,
            [
                "2026-09-05_10-00-00",
                "2026-09-04_10-00-00",
                "2026-09-03_10-00-00"
            ]
        );
    }

    #[test]
    fn restoring_puts_the_vault_back_and_keeps_what_it_replaced() {
        // Restoring the wrong snapshot has to be recoverable too, so the
        // current vault is backed up before it is removed.
        let s = Scratch::new("restore");
        s.note("slow-morning.md", "The old words.");
        let taken = run_backup(&s.backups, DEFAULT_BACKUP_LIMIT).unwrap();
        s.note("slow-morning.md", "The new words.");
        s.note("later.md", "Written after the backup.");

        restore_backup(&s.backups, &taken.name).unwrap();

        assert_eq!(
            std::fs::read_to_string(s.vault.join("notes/slow-morning.md")).unwrap(),
            "The old words."
        );
        assert!(!s.vault.join("notes/later.md").exists());
        // And the safety copy holds what was just replaced.
        let safety = list_backups(&s.backups)
            .into_iter()
            .find(|b| b.name != taken.name)
            .expect("a safety copy");
        assert_eq!(
            std::fs::read_to_string(s.backups.join(safety.name).join("notes/later.md")).unwrap(),
            "Written after the backup."
        );
    }

    #[test]
    fn a_backup_name_that_is_not_one_is_refused_before_anything_is_removed() {
        let s = Scratch::new("badname");
        s.note("slow-morning.md", "Still here.");

        for name in ["../escape", "2026-13-45_99-99-99", "", "not-a-backup"] {
            assert!(
                restore_backup(&s.backups, name).is_err(),
                "restored {name:?}"
            );
        }
        assert!(s.vault.join("notes/slow-morning.md").is_file());
    }

    #[test]
    fn a_backup_folder_name_survives_a_round_trip() {
        for name in [
            "2026-09-03_10-00-00",
            "2026-01-01_00-00-00",
            "2026-12-31_23-59-59",
        ] {
            let parsed = parse_backup_folder_name(name).expect(name);
            assert_eq!(backup_folder_name(&parsed), name);
        }
        for name in ["2026-02-31_10-00-00", "2026-9-3_10-00-00", "nonsense", ""] {
            assert!(
                parse_backup_folder_name(name).is_none(),
                "accepted {name:?}"
            );
        }
    }
}
