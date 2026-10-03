/*!
Where a sync left off, between runs.

A cursor and what was last agreed about each note. It lives beside the
preferences rather than in the vault, because it is about this device's
conversation with a server and not about the writing — a vault copied to
another Mac should arrive with no opinion about what some other device had
already sent.

The shape is `syncCycle`'s business. This stores and returns it, and reads none
of it: a backend that understood the contents would be a second place for them
to be wrong.
*/

use std::path::{Path, PathBuf};

fn path(data_dir: &Path) -> PathBuf {
    data_dir.join("sync-state.json")
}

/// What was stored, or `null` if nothing has been.
pub fn read(data_dir: &Path) -> serde_json::Value {
    std::fs::read_to_string(path(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or(serde_json::Value::Null)
}

pub fn write(data_dir: &Path, value: &serde_json::Value) -> Result<(), String> {
    std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;

    /*
     * Written beside and renamed over, so a crash midway leaves the old state
     * rather than half the new one. A truncated cursor file would send the
     * next sync back to zero and pull the whole vault again — recoverable, and
     * a long surprise for somebody who has a lot of notes.
     */
    let beside = path(data_dir).with_extension("json.writing");
    std::fs::write(&beside, value.to_string()).map_err(|e| e.to_string())?;
    std::fs::rename(&beside, path(data_dir)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Scratch {
        dir: PathBuf,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("tova-sync-state-{name}"));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Self { dir }
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    #[test]
    fn a_device_that_has_never_synced_has_no_state() {
        let scratch = Scratch::new("empty");
        assert_eq!(read(&scratch.dir), serde_json::Value::Null);
    }

    #[test]
    fn gives_back_what_it_was_given() {
        let scratch = Scratch::new("round-trip");
        let state = serde_json::json!({ "cursor": "42", "agreed": { "a": { "version": "7" } } });

        write(&scratch.dir, &state).unwrap();

        assert_eq!(read(&scratch.dir), state);
    }

    /*
     * Nothing here reads the shape. A backend that understood the contents
     * would be a second place for them to be wrong, so anything JSON can
     * carry goes through untouched.
     */
    #[test]
    fn stores_a_shape_it_knows_nothing_about() {
        let scratch = Scratch::new("opaque");
        let odd = serde_json::json!([1, "two", { "three": null }]);

        write(&scratch.dir, &odd).unwrap();

        assert_eq!(read(&scratch.dir), odd);
    }

    /*
     * A truncated cursor file would send the next sync back to zero and pull
     * the whole vault again. Writing beside and renaming over means a crash
     * midway leaves the old state rather than half the new one.
     */
    #[test]
    fn leaves_nothing_half_written_beside_it() {
        let scratch = Scratch::new("atomic");
        write(&scratch.dir, &serde_json::json!({ "cursor": "1" })).unwrap();

        let left: Vec<_> = std::fs::read_dir(&scratch.dir)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();

        assert_eq!(left, vec!["sync-state.json".to_string()]);
    }

    #[test]
    fn nonsense_on_disk_reads_as_nothing_rather_than_throwing() {
        let scratch = Scratch::new("nonsense");
        std::fs::write(path(&scratch.dir), "{ not json").unwrap();

        assert_eq!(read(&scratch.dir), serde_json::Value::Null);
    }
}
