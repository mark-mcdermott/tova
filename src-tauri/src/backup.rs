/*!
The versions a note keeps behind it — a port of the version half of
`src/main/backup.ts` and `src/shared/backup.ts`.

The other half is whole-vault backups, and it is a slice of its own. This is
here because `notes::write` calls `save_version` before it overwrites anything,
and a port of `write` without it would quietly stop keeping the ten snapshots
a reader can go back to.
*/

// Whole-vault backups are the rest of this file's counterpart, and the slice
// after next; these two arrive with it.
#![allow(dead_code)]

use chrono::{DateTime, Datelike, Local, TimeZone, Timelike};
use std::path::PathBuf;

use crate::vault::vault_root;
use crate::vault_file::{read_vault_text, write_vault_text};

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
