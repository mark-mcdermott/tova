/*!
What publishing remembers between runs — a port of `publish/syncState.ts`,
`publish/timing.ts` and `shared/publishProgress.ts`.

Three small files with one thing in common: none of them talks to GitHub. They
are the arithmetic and the bookkeeping the sync leans on, and having them under
a fixture first means the slice that does talk to GitHub can be about the
network rather than about rounding.
*/

// Read by the sync, which is the slice after this one.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/*
 * What each blog looked like at the end of its last sync. Two fingerprints per
 * post: the remote blob SHA, so a change on the blog is visible, and a hash of
 * the local file, so a change here is too. Both changing is a conflict; one
 * changing is simply the newer side.
 */
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct PostState {
    /// GitHub blob SHA when this post was last synced.
    pub remote_sha: String,
    /// Hash of the local file's content at that same moment.
    pub local_hash: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct BlogSyncState {
    pub last_synced_at: f64,
    pub posts: BTreeMap<String, PostState>,
}

type SyncFile = BTreeMap<String, BlogSyncState>;

pub fn hash_content(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn path_to_state(data_dir: &Path) -> PathBuf {
    data_dir.join("blog-sync.json")
}

fn load_state(data_dir: &Path) -> SyncFile {
    std::fs::read_to_string(path_to_state(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

pub fn sync_state_for(data_dir: &Path, blog_id: &str) -> BlogSyncState {
    load_state(data_dir).remove(blog_id).unwrap_or_default()
}

pub fn save_sync_state(
    data_dir: &Path,
    blog_id: &str,
    state: &BlogSyncState,
) -> Result<(), String> {
    let mut file = load_state(data_dir);
    file.insert(blog_id.to_string(), state.clone());
    write_json(&path_to_state(data_dir), &file)
}

pub fn forget_sync_state(data_dir: &Path, blog_id: &str) -> Result<(), String> {
    let mut file = load_state(data_dir);
    file.remove(blog_id);
    write_json(&path_to_state(data_dir), &file)
}

/// When each blog was last synced, which is what the sidebar shows.
pub fn last_synced(data_dir: &Path) -> BTreeMap<String, f64> {
    load_state(data_dir)
        .into_iter()
        .map(|(id, state)| (id, state.last_synced_at))
        .collect()
}

/* How long this blog's builds have been taking, so the bar can be honest. */

type History = BTreeMap<String, Vec<f64>>;

fn path_to_history(data_dir: &Path) -> PathBuf {
    data_dir.join("publish-timing.json")
}

fn load_history(data_dir: &Path) -> History {
    std::fs::read_to_string(path_to_history(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Keeps the most recent few durations; anything older says little about now.
pub fn record_duration(history: &[f64], duration_ms: f64, keep: usize) -> Vec<f64> {
    let mut next = history.to_vec();
    next.push(duration_ms);
    next.split_off(next.len().saturating_sub(keep))
}

pub fn average_duration(history: &[f64]) -> Option<f64> {
    (!history.is_empty()).then(|| history.iter().sum::<f64>() / history.len() as f64)
}

pub fn average_for(data_dir: &Path, blog_id: &str) -> Option<f64> {
    average_duration(load_history(data_dir).get(blog_id)?)
}

pub fn remember(data_dir: &Path, blog_id: &str, duration_ms: f64) -> Result<(), String> {
    let mut history = load_history(data_dir);
    let updated = record_duration(
        history.get(blog_id).map(Vec::as_slice).unwrap_or_default(),
        duration_ms,
        5,
    );
    history.insert(blog_id.to_string(), updated);
    write_json(&path_to_history(data_dir), &history)
}

/* The bar itself. */

/// How far the bar has moved before the build even starts.
const PUSHED: f64 = 15.0;
/// Held short of the end until the deploy actually reports success.
const CEILING: f64 = 98.0;
/// With no history to go on, assume a build of about this long.
const ASSUMED_BUILD_MS: f64 = 45_000.0;

fn expected(average_ms: Option<f64>) -> f64 {
    match average_ms {
        Some(ms) if ms > 0.0 => ms,
        _ => ASSUMED_BUILD_MS,
    }
}

/// The bar is optimistic on purpose: a deploy gives almost no signal between
/// "queued" and "done", so the movement comes from how long this blog's builds
/// usually take. It stops short of the end rather than sitting at 100 while
/// the build is still running, and a build running long simply holds there.
pub fn publish_progress(phase: &str, elapsed_ms: f64, average_ms: Option<f64>) -> i64 {
    match phase {
        "published" => return 100,
        "preparing" => return 4,
        "pushing" | "failed" => return PUSHED as i64,
        _ => {}
    }

    let share = (elapsed_ms / expected(average_ms)).min(1.0);
    // `Math.round` rounds half away from zero for positives, which is what
    // Rust's `round` does too — and `f64::round` on a NaN share would give
    // NaN, so the min above is doing more than clamping.
    let moved = PUSHED + ((CEILING - PUSHED) * share).round();
    moved.min(CEILING) as i64
}

/// Past twice the usual, the estimate has clearly stopped meaning anything.
pub fn is_overdue(elapsed_ms: f64, average_ms: Option<f64>) -> bool {
    elapsed_ms > expected(average_ms) * 2.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value as Json;

    fn fixture() -> Json {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../conformance/publish.json");
        serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("json")
    }

    fn cases(name: &str) -> Vec<Json> {
        let list = fixture()[name].as_array().expect(name).clone();
        assert!(!list.is_empty());
        list
    }

    fn maybe(value: &Json) -> Option<f64> {
        value.as_f64()
    }

    fn numbers(value: &Json) -> Vec<f64> {
        value
            .as_array()
            .expect("numbers")
            .iter()
            .filter_map(Json::as_f64)
            .collect()
    }

    #[test]
    fn moves_the_bar_the_same_way() {
        for case in cases("progress") {
            let phase = case["phase"].as_str().expect("phase");
            let elapsed = case["elapsedMs"].as_f64().expect("elapsedMs");

            assert_eq!(
                publish_progress(phase, elapsed, maybe(&case["averageMs"])),
                case["percent"].as_i64().expect("percent"),
                "{phase} at {elapsed}ms against {}",
                case["averageMs"]
            );
        }
    }

    #[test]
    fn calls_a_build_overdue_at_the_same_point() {
        for case in cases("overdue") {
            assert_eq!(
                is_overdue(
                    case["elapsedMs"].as_f64().expect("elapsedMs"),
                    maybe(&case["averageMs"])
                ),
                case["overdue"] == true,
                "for {case}"
            );
        }
    }

    #[test]
    fn keeps_the_same_recent_durations() {
        for case in cases("recordDuration") {
            let kept = record_duration(
                &numbers(&case["history"]),
                case["durationMs"].as_f64().expect("durationMs"),
                5,
            );

            assert_eq!(kept, numbers(&case["kept"]), "for {case}");
        }
    }

    #[test]
    fn averages_them_the_same_way() {
        for case in cases("averageDuration") {
            assert_eq!(
                average_duration(&numbers(&case["history"])),
                maybe(&case["average"]),
                "for {case}"
            );
        }
    }

    #[test]
    fn fingerprints_a_post_the_same_way() {
        // The hash is half of how a conflict is spotted, so a difference here
        // would read as "everything changed" on the first sync after a switch.
        for case in cases("hashContent") {
            let content = case["content"].as_str().expect("content");

            assert_eq!(
                hash_content(content),
                case["hash"].as_str().expect("hash"),
                "for {content:?}"
            );
        }
    }

    /* The stored side. */

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tova-publish-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_blog_with_no_history_reads_as_never_synced() {
        let dir = scratch("empty");

        assert_eq!(sync_state_for(&dir, "nobody"), BlogSyncState::default());
        assert_eq!(average_for(&dir, "nobody"), None);
        assert!(last_synced(&dir).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn what_a_sync_remembers_comes_back() {
        let dir = scratch("roundtrip");
        let mut state = BlogSyncState {
            last_synced_at: 1_757_000_000_000.0,
            ..Default::default()
        };
        state.posts.insert(
            "a-post.md".into(),
            PostState {
                remote_sha: "abc123".into(),
                local_hash: hash_content("Coffee."),
            },
        );

        save_sync_state(&dir, "blog-1", &state).unwrap();

        assert_eq!(sync_state_for(&dir, "blog-1"), state);
        assert_eq!(last_synced(&dir).get("blog-1"), Some(&1_757_000_000_000.0));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn forgetting_one_blog_leaves_the_others() {
        let dir = scratch("forget");
        save_sync_state(&dir, "a", &BlogSyncState::default()).unwrap();
        save_sync_state(
            &dir,
            "b",
            &BlogSyncState {
                last_synced_at: 7.0,
                ..Default::default()
            },
        )
        .unwrap();

        forget_sync_state(&dir, "a").unwrap();

        assert!(!last_synced(&dir).contains_key("a"));
        assert_eq!(last_synced(&dir).get("b"), Some(&7.0));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn only_the_last_few_builds_count_towards_the_average() {
        let dir = scratch("timing");
        for ms in [1000.0, 2000.0, 3000.0, 4000.0, 5000.0, 60_000.0] {
            remember(&dir, "blog-1", ms).unwrap();
        }

        // The 1000 has fallen off the end.
        assert_eq!(average_for(&dir, "blog-1"), Some(14_800.0));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_file_that_cannot_be_read_is_no_history_rather_than_a_failure() {
        let dir = scratch("broken");
        std::fs::write(dir.join("blog-sync.json"), "not json").unwrap();
        std::fs::write(dir.join("publish-timing.json"), "{[").unwrap();

        assert_eq!(sync_state_for(&dir, "blog-1"), BlogSyncState::default());
        assert_eq!(average_for(&dir, "blog-1"), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
