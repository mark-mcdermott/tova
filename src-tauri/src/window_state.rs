/*!
Where the window was left — a port of `src/main/windowState.ts`.

Restoring a position is only kind if it is still reachable: a window remembered
on a monitor that is no longer attached opens off-screen, which looks exactly
like the app failing to start.

Everything here is in logical pixels, which is what Electron wrote and what the
window builder takes. Tauri reports physical ones, so what comes back off the
window is divided by the scale factor before it is written down — otherwise a
window left at 1345 wide on a Retina display would be remembered as 2690 and
come back filling two of them.
*/

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct WindowState {
    pub width: f64,
    pub height: f64,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub maximized: bool,
}

/// Where a window opens the first time, before there is a remembered one.
impl Default for WindowState {
    fn default() -> Self {
        WindowState {
            width: 1345.0,
            height: 915.0,
            x: None,
            y: None,
            maximized: false,
        }
    }
}

const MIN_WIDTH: f64 = 720.0;
const MIN_HEIGHT: f64 = 480.0;

fn path_to_state(data_dir: &Path) -> PathBuf {
    data_dir.join("window.json")
}

/// A rectangle a display occupies, in logical pixels.
#[derive(Debug, Clone, Copy)]
pub struct Area {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Reads a stored frame, falling back a field at a time rather than all at
/// once: a file with a good size and a nonsense position should keep the size.
pub fn normalize(value: Option<&serde_json::Value>) -> WindowState {
    let defaults = WindowState::default();
    let Some(raw) = value.and_then(|value| value.as_object()) else {
        return defaults;
    };

    // `Number.isFinite`, which is false for a string, a null and a NaN alike.
    let finite = |key: &str| {
        raw.get(key)
            .and_then(serde_json::Value::as_f64)
            .filter(|n| n.is_finite())
    };
    // `js::round`, not `f64::round`: they disagree on negative halves, and a
    // remembered position is often a small negative number.
    let size = |key: &str, fallback: f64, minimum: f64| {
        crate::js::round(finite(key).unwrap_or(fallback)).max(minimum)
    };

    WindowState {
        width: size("width", defaults.width, MIN_WIDTH),
        height: size("height", defaults.height, MIN_HEIGHT),
        x: finite("x").map(crate::js::round),
        y: finite("y").map(crate::js::round),
        maximized: raw.get("maximized") == Some(&serde_json::Value::Bool(true)),
    }
}

/// True when the remembered frame still overlaps a display that exists.
pub fn is_on_screen(state: &WindowState, areas: &[Area]) -> bool {
    let (Some(x), Some(y)) = (state.x, state.y) else {
        return false;
    };

    // Partial overlap counts: a window half off the side can still be grabbed.
    areas.iter().any(|area| {
        x < area.x + area.width
            && x + state.width > area.x
            && y < area.y + area.height
            && y + state.height > area.y
    })
}

pub fn read(data_dir: &Path, areas: &[Area]) -> WindowState {
    let stored = std::fs::read_to_string(path_to_state(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());

    let state = normalize(stored.as_ref());
    if is_on_screen(&state, areas) {
        state
    } else {
        WindowState {
            x: None,
            y: None,
            ..state
        }
    }
}

pub fn write(data_dir: &Path, state: &WindowState) -> Result<(), String> {
    std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(path_to_state(data_dir), text).map_err(|e| e.to_string())
}

/*
 * Saved as the window is moved and resized, and again when it closes.
 *
 * Electron saved only on close, which is enough until something is force
 * quit — and then the window forgets where it was for no reason the reader
 * can see. Writing as it goes costs a hundred bytes at most once a second,
 * which is less than the drag itself costs.
 *
 * The throttle is what makes that true: without it this would be a file write
 * per frame of a drag, which is a poor way to remember a rectangle.
 */
const AT_MOST_EVERY: std::time::Duration = std::time::Duration::from_secs(1);

pub fn remember(window: &tauri::WebviewWindow, data_dir: PathBuf) {
    use std::sync::{Arc, Mutex};

    struct Remembered {
        frame: WindowState,
        written_at: std::time::Instant,
    }

    let held = Arc::new(Mutex::new(Remembered {
        frame: read_frame(window).unwrap_or_default(),
        // Far enough back that the first move writes rather than waiting.
        written_at: std::time::Instant::now() - AT_MOST_EVERY,
    }));
    let watching = window.clone();

    window.on_window_event(move |event| {
        let closing = matches!(
            event,
            tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
        );
        if !closing
            && !matches!(
                event,
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)
            )
        {
            return;
        }

        let Ok(mut held) = held.lock() else { return };

        // A maximized window reports the maximized frame, which is not the one
        // to come back to. Electron gets the frame underneath from
        // `getNormalBounds`; here the last ordinary one is kept as it goes past.
        if watching.is_maximized().unwrap_or(false) {
            held.frame.maximized = true;
        } else if let Some(frame) = read_frame(&watching) {
            held.frame = frame;
        }

        if !worth_writing(closing, held.written_at.elapsed()) {
            return;
        }
        held.written_at = std::time::Instant::now();

        // Said out loud rather than swallowed: a window that forgets where it
        // was is a small thing that is hard to explain afterwards.
        if let Err(error) = write(&data_dir, &held.frame) {
            eprintln!("Could not remember the window: {error}");
        }
    });
}

/// Whether to write now. A close always writes; a move waits its turn.
///
/// Pulled out of the handler because it is the only part of it carrying a
/// decision — the rest is reading a frame off a window, which needs a window
/// to be wrong about.
fn worth_writing(closing: bool, since_last: std::time::Duration) -> bool {
    closing || since_last >= AT_MOST_EVERY
}

/// The window's frame in logical pixels, which is what is stored.
fn read_frame(window: &tauri::WebviewWindow) -> Option<WindowState> {
    let scale = window.scale_factor().ok()?;
    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;

    Some(WindowState {
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
        x: Some(position.x as f64 / scale),
        y: Some(position.y as f64 / scale),
        maximized: window.is_maximized().unwrap_or(false),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value as Json;

    fn fixture() -> Json {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../conformance/window.json");
        serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("json")
    }

    fn cases(name: &str) -> Vec<Json> {
        let list = fixture()[name].as_array().expect(name).clone();
        assert!(!list.is_empty());
        list
    }

    fn state_from(value: &Json) -> WindowState {
        WindowState {
            width: value["width"].as_f64().expect("width"),
            height: value["height"].as_f64().expect("height"),
            x: value["x"].as_f64(),
            y: value["y"].as_f64(),
            maximized: value["maximized"] == true,
        }
    }

    #[test]
    fn reads_a_stored_frame_the_same_way() {
        for case in cases("normalize") {
            let stored = match &case["stored"] {
                Json::Null => None,
                other => Some(other),
            };

            // Compared field by field rather than as JSON: `915` and `915.0`
            // are the same number and different `serde_json::Value`s.
            let found = normalize(stored);
            let want = state_from(&case["state"]);
            assert_eq!(found, want, "for {}", case["stored"]);
        }
    }

    #[test]
    fn judges_a_remembered_position_reachable_the_same_way() {
        for case in cases("onScreen") {
            let areas: Vec<Area> = case["areas"]
                .as_array()
                .expect("areas")
                .iter()
                .map(|area| Area {
                    x: area["x"].as_f64().expect("x"),
                    y: area["y"].as_f64().expect("y"),
                    width: area["width"].as_f64().expect("width"),
                    height: area["height"].as_f64().expect("height"),
                })
                .collect();

            assert_eq!(
                is_on_screen(&state_from(&case["state"]), &areas),
                case["onScreen"] == true,
                "for {}",
                case["state"]
            );
        }
    }

    #[test]
    fn a_frame_nobody_can_reach_keeps_its_size_and_loses_its_place() {
        // Rather than losing both: the size is still what the reader chose.
        let dir = std::env::temp_dir().join("tova-window-unreachable");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        write(
            &dir,
            &WindowState {
                width: 1000.0,
                height: 700.0,
                x: Some(9000.0),
                y: Some(9000.0),
                maximized: false,
            },
        )
        .unwrap();

        let read_back = read(
            &dir,
            &[Area {
                x: 0.0,
                y: 0.0,
                width: 1920.0,
                height: 1080.0,
            }],
        );

        assert_eq!(read_back.width, 1000.0);
        assert_eq!((read_back.x, read_back.y), (None, None));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_drag_is_not_a_file_write_per_frame() {
        use std::time::Duration;

        // Sixty events a second, one write a second.
        assert!(!worth_writing(false, Duration::from_millis(16)));
        assert!(!worth_writing(false, Duration::from_millis(999)));
        assert!(worth_writing(false, Duration::from_millis(1000)));

        // Closing writes whatever has just happened, throttle or not —
        // otherwise the last move before a quit is the one that is lost.
        assert!(worth_writing(true, Duration::ZERO));
    }

    #[test]
    fn no_file_at_all_is_the_first_run() {
        let dir = std::env::temp_dir().join("tova-window-absent");
        let _ = std::fs::remove_dir_all(&dir);

        assert_eq!(read(&dir, &[]), WindowState::default());
    }
}
