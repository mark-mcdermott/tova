/*!
Preferences — a port of `src/main/preferences.ts` and the normalising half of
`src/shared/preferences.ts`.

Everything read off disk or sent by the renderer goes through `normalize`, so a
hand-edited file or a stale key cannot put the app into a state its own UI could
not produce. That is the same contract the TypeScript has, and the tests below
are the same cases.
*/

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

use crate::sections::{default_sections, normalize_sections, SectionConfig};

const DISPLAY_NAME_SOURCES: [&str; 3] = ["none", "system", "custom"];
const AVATAR_CHOICES: [&str; 4] = ["initials", "tova", "system", "custom"];
const THEMES: [&str; 3] = ["light", "dark", "system"];

struct Limit {
    min: f64,
    max: f64,
}

const FONT_SIZE: Limit = Limit {
    min: 12.0,
    max: 24.0,
};
const TAB_SIZE: Limit = Limit { min: 2.0, max: 8.0 };
const BACKUP_INTERVAL: Limit = Limit {
    min: 5.0,
    max: 24.0 * 60.0,
};
const BACKUP_LIMIT: Limit = Limit {
    min: 5.0,
    max: 200.0,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub display_name_source: String,
    pub display_name: String,
    pub avatar: String,
    pub avatar_file: Option<String>,
    pub avatar_color: Option<String>,
    pub font_size: i64,
    pub tab_size: i64,
    pub backup_interval_minutes: i64,
    pub backup_limit: i64,
    pub spellcheck: bool,
    pub tooltips: bool,
    pub grammar: bool,
    pub theme: String,
    pub vaults: Vec<String>,
    pub active_vault: Option<String>,
    pub sections: Vec<SectionConfig>,
    pub background_light: Option<String>,
    pub background_dark: Option<String>,
    pub title_font: String,
    pub prose_width: String,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            display_name_source: "none".into(),
            display_name: String::new(),
            avatar: "initials".into(),
            avatar_file: None,
            avatar_color: None,
            font_size: 18,
            tab_size: 2,
            backup_interval_minutes: 60,
            backup_limit: 30,
            spellcheck: true,
            tooltips: true,
            grammar: false,
            theme: "system".into(),
            vaults: Vec::new(),
            active_vault: None,
            sections: default_sections(),
            // A photograph each way. Light shuffles; dark opens on the one
            // bundled image dark enough to sit under white text.
            background_light: Some("shuffle".into()),
            background_dark: Some("milky-way.jpg".into()),
            title_font: "vibur".into(),
            prose_width: "narrow".into(),
        }
    }
}

/// What `Number(value)` would make of it, for the cases preferences can hold.
/// A missing or null key is the default rather than a coercion — that is what
/// `raw.x ?? DEFAULT` does before `Number` ever sees it.
fn to_number(raw: Option<&Value>, default: f64) -> f64 {
    match raw {
        None | Some(Value::Null) => default,
        Some(Value::Number(n)) => n.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(s)) if s.trim().is_empty() => 0.0,
        Some(Value::String(s)) => s.trim().parse().unwrap_or(f64::NAN),
        Some(Value::Bool(b)) => {
            if *b {
                1.0
            } else {
                0.0
            }
        }
        _ => f64::NAN,
    }
}

/// Rounded into range; anything that is not a number at all lands on the floor.
fn clamp(value: f64, limit: Limit) -> i64 {
    if !value.is_finite() {
        return limit.min as i64;
    }
    value.round().clamp(limit.min, limit.max) as i64
}

fn string_at(raw: &Value, key: &str) -> Option<String> {
    raw.get(key).and_then(Value::as_str).map(str::to_string)
}

fn one_of(raw: &Value, key: &str, allowed: &[&str]) -> Option<String> {
    string_at(raw, key).filter(|v| allowed.contains(&v.as_str()))
}

/// Six hex digits, which is all the colour input can produce.
fn hex_color(value: Option<String>) -> Option<String> {
    let value = value?;
    let body = value.strip_prefix('#')?;
    if body.len() == 6 && body.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(value.to_lowercase())
    } else {
        None
    }
}

pub fn normalize(value: &Value) -> Preferences {
    let Some(raw) = value.as_object().map(|_| value) else {
        return Preferences::default();
    };
    let fallback = Preferences::default();

    let typed_name = string_at(raw, "displayName");

    Preferences {
        display_name: typed_name
            .clone()
            .unwrap_or_default()
            .chars()
            .take(60)
            .collect(),
        // Before there was anywhere to say where the name came from, a name in
        // the field was one someone had typed — even the one seeded from the
        // account, which was a copy from the moment it was written.
        display_name_source: one_of(raw, "displayNameSource", &DISPLAY_NAME_SOURCES)
            .unwrap_or_else(|| match typed_name.as_deref() {
                None | Some("") => "none".into(),
                Some(_) => "custom".into(),
            }),
        // Before the four choices existed a picture was the only thing a file
        // could mean, so a file left over from then is the one being used.
        avatar: one_of(raw, "avatar", &AVATAR_CHOICES).unwrap_or_else(|| {
            match string_at(raw, "avatarFile") {
                Some(_) => "custom".into(),
                None => "initials".into(),
            }
        }),
        avatar_file: string_at(raw, "avatarFile"),
        avatar_color: hex_color(string_at(raw, "avatarColor")),
        font_size: clamp(
            to_number(raw.get("fontSize"), fallback.font_size as f64),
            FONT_SIZE,
        ),
        tab_size: clamp(
            to_number(raw.get("tabSize"), fallback.tab_size as f64),
            TAB_SIZE,
        ),
        backup_interval_minutes: clamp(
            to_number(
                raw.get("backupIntervalMinutes"),
                fallback.backup_interval_minutes as f64,
            ),
            BACKUP_INTERVAL,
        ),
        backup_limit: clamp(
            to_number(raw.get("backupLimit"), fallback.backup_limit as f64),
            BACKUP_LIMIT,
        ),
        spellcheck: raw
            .get("spellcheck")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        tooltips: raw.get("tooltips").and_then(Value::as_bool).unwrap_or(true),
        grammar: raw.get("grammar") == Some(&Value::Bool(true)),
        theme: one_of(raw, "theme", &THEMES).unwrap_or(fallback.theme),
        vaults: raw
            .get("vaults")
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        active_vault: string_at(raw, "activeVault"),
        sections: normalize_sections(raw.get("sections")),
        // `background` was the single choice before there were two. A file
        // written by an older build still names the light one.
        background_light: string_at(raw, "backgroundLight")
            .or_else(|| string_at(raw, "background")),
        background_dark: string_at(raw, "backgroundDark"),
        // Any non-empty string: a bundled id, or the filename of an added face.
        // "alagambe" arrives here from an older preferences file and is not one
        // of ours any more, so it lands on the default like any other stale name.
        title_font: string_at(raw, "titleFont")
            .filter(|f| !f.trim().is_empty() && f != "alagambe")
            .unwrap_or(fallback.title_font),
        prose_width: match string_at(raw, "proseWidth").as_deref() {
            Some("full") => "full".into(),
            _ => fallback.prose_width,
        },
    }
}

fn path_to_preferences(data_dir: &Path) -> PathBuf {
    data_dir.join("preferences.json")
}

/// The account name, for the sidebar to show where the reader asks it to. Read
/// where it lives rather than copied into preferences, so renaming the account
/// renames it here.
pub fn account_name() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .unwrap_or_default()
}

pub fn read(data_dir: &Path) -> Preferences {
    match std::fs::read_to_string(path_to_preferences(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
    {
        Some(stored) => normalize(&stored),
        None => {
            // Nothing stored yet. Start on the account's own name rather than
            // blank, which is a choice like any other and can be changed.
            //
            // The avatar is left on its default until `startingAvatar` is
            // ported; on Electron that reads the Mac account picture.
            let mut fresh = Preferences::default();
            if !account_name().is_empty() {
                fresh.display_name_source = "system".into();
            }
            write_value(
                data_dir,
                &serde_json::to_value(&fresh).unwrap_or(Value::Null),
            )
        }
    }
}

pub fn write_value(data_dir: &Path, value: &Value) -> Preferences {
    let preferences = normalize(value);
    let path = path_to_preferences(data_dir);

    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(text) = serde_json::to_string_pretty(&preferences) {
        let _ = std::fs::write(&path, text + "\n");
    }
    preferences
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /*
     * The same cases src/shared/preferences.test.ts and
     * src/main/preferences.test.ts prove, so the two backends can be held to
     * one another rather than each to itself.
     */

    fn normalized(value: serde_json::Value) -> Preferences {
        normalize(&value)
    }

    #[test]
    fn falls_back_to_the_defaults_for_anything_unreadable() {
        assert_eq!(normalized(json!(null)), Preferences::default());
        assert_eq!(normalized(json!("nonsense")), Preferences::default());
    }

    #[test]
    fn keeps_values_it_recognises() {
        let kept =
            normalized(json!({ "displayName": "Mark", "fontSize": 18, "spellcheck": false }));

        assert_eq!(kept.display_name, "Mark");
        assert_eq!(kept.font_size, 18);
        assert!(!kept.spellcheck);
    }

    #[test]
    fn clamps_a_size_the_ui_could_never_have_produced() {
        assert_eq!(normalized(json!({ "fontSize": 400 })).font_size, 24);
        assert_eq!(normalized(json!({ "fontSize": 1 })).font_size, 12);
    }

    #[test]
    fn clamps_a_backup_schedule_that_would_hammer_the_disk() {
        assert_eq!(
            normalized(json!({ "backupIntervalMinutes": 0 })).backup_interval_minutes,
            5
        );
        assert_eq!(
            normalized(json!({ "backupLimit": 100000 })).backup_limit,
            200
        );
    }

    #[test]
    fn refuses_a_size_that_is_not_a_number_at_all() {
        assert_eq!(normalized(json!({ "fontSize": "huge" })).font_size, 12);
    }

    #[test]
    fn rounds_rather_than_carrying_a_fractional_size() {
        assert_eq!(normalized(json!({ "tabSize": 3.7 })).tab_size, 4);
    }

    #[test]
    fn caps_a_display_name_rather_than_storing_an_essay() {
        let long = "x".repeat(200);
        assert_eq!(
            normalized(json!({ "displayName": long }))
                .display_name
                .chars()
                .count(),
            60
        );
    }

    #[test]
    fn treats_a_background_that_is_not_a_name_as_none() {
        assert_eq!(
            normalized(json!({ "backgroundLight": 42 })).background_light,
            None
        );
    }

    #[test]
    fn reads_the_single_background_an_older_build_wrote() {
        assert_eq!(
            normalized(json!({ "background": "milky-way.jpg" })).background_light,
            Some("milky-way.jpg".into())
        );
    }

    #[test]
    fn title_font_defaults_to_vibur_and_drops_alagambe() {
        assert_eq!(normalized(json!({})).title_font, "vibur");
        assert_eq!(
            normalized(json!({ "titleFont": "fascinate" })).title_font,
            "fascinate"
        );
        assert_eq!(
            normalized(json!({ "titleFont": "my-script.otf" })).title_font,
            "my-script.otf"
        );
        assert_eq!(
            normalized(json!({ "titleFont": "alagambe" })).title_font,
            "vibur"
        );
        assert_eq!(
            normalized(json!({ "titleFont": "   " })).title_font,
            "vibur"
        );
    }

    #[test]
    fn prose_width_defaults_to_the_narrow_column() {
        assert_eq!(normalized(json!({})).prose_width, "narrow");
        assert_eq!(
            normalized(json!({ "proseWidth": "full" })).prose_width,
            "full"
        );
        assert_eq!(
            normalized(json!({ "proseWidth": "wide" })).prose_width,
            "narrow"
        );
    }

    #[test]
    fn a_stored_picture_reads_as_the_one_being_used() {
        // What a file meant before the four choices existed.
        assert_eq!(
            normalized(json!({ "avatarFile": "avatar.jpg" })).avatar,
            "custom"
        );
        assert_eq!(normalized(json!({ "avatarFile": null })).avatar, "initials");
        assert_eq!(
            normalized(json!({ "avatar": "tova", "avatarFile": "avatar.jpg" })).avatar,
            "tova"
        );
        assert_eq!(normalized(json!({ "avatar": "robot" })).avatar, "initials");
    }

    #[test]
    fn a_stored_name_reads_as_one_someone_typed() {
        assert_eq!(
            normalized(json!({ "displayName": "Mark" })).display_name_source,
            "custom"
        );
        assert_eq!(
            normalized(json!({ "displayName": "" })).display_name_source,
            "none"
        );
        assert_eq!(
            normalized(json!({ "displayNameSource": "system" })).display_name_source,
            "system"
        );
    }

    #[test]
    fn only_six_hex_digits_are_a_colour() {
        assert_eq!(
            normalized(json!({ "avatarColor": "#3196C9" })).avatar_color,
            Some("#3196c9".into())
        );
        assert_eq!(
            normalized(json!({ "avatarColor": "blue" })).avatar_color,
            None
        );
        assert_eq!(
            normalized(json!({ "avatarColor": "#abc" })).avatar_color,
            None
        );
    }

    #[test]
    fn the_rail_always_has_its_defaults_however_little_was_stored() {
        let sections = normalized(json!({ "sections": [] })).sections;
        assert_eq!(sections.len(), 5);
        assert_eq!(sections[0].id, "daily");
    }

    #[test]
    fn a_stored_order_leads_and_the_rest_follow() {
        let sections = normalized(json!({ "sections": [{ "id": "ideas" }] })).sections;
        assert_eq!(sections[0].id, "ideas");
        assert_eq!(sections.len(), 5);
    }

    #[test]
    fn an_id_that_is_not_a_directory_is_dropped() {
        let sections = normalized(json!({ "sections": [{ "id": "../escape" }] })).sections;
        assert!(!sections.iter().any(|s| s.id.contains("..")));
    }

    #[test]
    fn round_trips_through_disk_unchanged() {
        let dir = std::env::temp_dir().join(format!("tova-prefs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let written = write_value(&dir, &json!({ "displayName": "Mark", "fontSize": 22 }));
        let read_back = read(&dir);

        assert_eq!(written, read_back);
        assert_eq!(read_back.display_name, "Mark");
        assert_eq!(read_back.font_size, 22);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn falls_back_to_the_defaults_when_the_file_cannot_be_parsed() {
        let dir = std::env::temp_dir().join(format!("tova-prefs-bad-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("preferences.json"), "{ not json").unwrap();

        assert_eq!(read(&dir).font_size, 18);

        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod conformance {
    use super::*;

    /*
     * Held to the Electron backend rather than to itself.
     *
     * `conformance/preferences.json` carries the cases and what
     * src/shared/preferences.ts makes of each. Both backends read it, so a
     * disagreement is a failing test on one side rather than a difference
     * nobody notices until a preferences file written by one is opened by the
     * other.
     */
    #[test]
    fn answers_every_case_the_typescript_does() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../conformance/preferences.json"
        );
        let doc: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("json");

        let cases = doc["cases"].as_array().expect("cases");
        let expected = doc["expected"].as_array().expect("expected");
        assert_eq!(
            cases.len(),
            expected.len(),
            "a case with no answer beside it"
        );

        for (case, want) in cases.iter().zip(expected) {
            let got = serde_json::to_value(normalize(case)).expect("serialize");
            assert_eq!(&got, want, "\ncase: {case}");
        }
    }
}
