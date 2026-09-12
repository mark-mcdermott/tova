/*!
Spelling — a port of `src/main/spellcheck.ts`, onto a different engine.

Electron's spellchecking was Chromium's: it drew the squiggles, kept the custom
dictionary, and handed the misspelled word and its suggestions to the app when
a context menu opened. None of that exists here. The webview's squiggles are
macOS's own, and the rest is this file asking `NSSpellChecker` directly.

Which is a fix rather than a port. On macOS Electron ships no dictionary at all
— `session.setSpellCheckerLanguages` is documented as a no-op there, and a
trimmed build and an untrimmed one both lack one — so the squiggles appeared
and the suggestions never did. `NSSpellChecker` has the dictionary the system
uses everywhere else.

One thing had to be measured, and the first measurement was wrong.

Setting the language is what makes the checker work. Left to identify the
language itself it flags nothing at all — not `teh`, not in a sentence, not
anywhere — and with `setLanguage("en")` it flags `teh` and suggests `the`,
alone or in context. It looked at first as though context was the variable,
because the probe that suggested it had changed both at once.

This still takes a line and an offset rather than a word, because that is what
a right-click actually knows: a position in a line. Letting the checker decide
where the word starts and ends is better than the bridge guessing, and it is
the same decision the squiggle was drawn from.
*/

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Misspelling {
    pub word: String,
    /// Where the word sits in the line it came from, in UTF-16 code units —
    /// which is what JavaScript counts and what NSRange counts, so the two
    /// agree without being converted.
    pub from: usize,
    pub to: usize,
    pub suggestions: Vec<String>,
}

fn path_to_dictionary(data_dir: &Path) -> PathBuf {
    data_dir.join("dictionary.json")
}

/// The words the reader has told Tova to stop flagging.
pub fn list_words(data_dir: &Path) -> Vec<String> {
    std::fs::read_to_string(path_to_dictionary(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str::<Vec<String>>(&text).ok())
        .unwrap_or_default()
}

fn save_words(data_dir: &Path, words: &[String]) -> Result<(), String> {
    std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(words).map_err(|e| e.to_string())?;
    std::fs::write(path_to_dictionary(data_dir), text).map_err(|e| e.to_string())
}

pub fn add_word(data_dir: &Path, word: &str) -> Result<Vec<String>, String> {
    let word = crate::js::trim(word).to_string();
    let mut words = list_words(data_dir);
    if word.is_empty() || words.contains(&word) {
        return Ok(words);
    }

    words.push(word.clone());
    words.sort_by(|a, b| crate::note_name::compare_titles(a, b));
    save_words(data_dir, &words)?;
    system::learn(&word);
    Ok(words)
}

pub fn remove_word(data_dir: &Path, word: &str) -> Result<Vec<String>, String> {
    let mut words = list_words(data_dir);
    words.retain(|kept| kept != word);
    save_words(data_dir, &words)?;
    system::unlearn(word);
    Ok(words)
}

/// Asks the webview to underline misspellings, or to stop.
///
/// Separate from everything else here because it is the only part that is not
/// about a word: it is a switch on the engine that draws the squiggle.
pub fn set_underlining(enabled: bool) {
    system::set_underlining(enabled);
}

/// The misspelled word at `at`, if there is one — where `at` is where the
/// reader right-clicked, counted in UTF-16 code units from the start of
/// `line`.
pub fn suggest(data_dir: &Path, line: &str, at: usize) -> Option<Misspelling> {
    let known = list_words(data_dir);
    system::suggest(line, at, &known)
}

#[cfg(target_os = "macos")]
mod system {
    use super::Misspelling;
    use objc2_app_kit::NSSpellChecker;
    use objc2_foundation::{NSArray, NSInteger, NSString};

    /// One tag for the app, so the checker keeps one idea of what Tova has
    /// been told to ignore.
    fn tag() -> NSInteger {
        use std::sync::OnceLock;
        static TAG: OnceLock<isize> = OnceLock::new();
        *TAG.get_or_init(NSSpellChecker::uniqueSpellDocumentTag)
    }

    fn english() -> objc2::rc::Retained<NSString> {
        NSString::from_str("en")
    }

    /// Adding a word tells the Mac, not only Tova.
    ///
    /// That is a wider effect than Chromium's, which kept its own list — a
    /// word added here is one TextEdit will accept too. It is also the only
    /// way the squiggle goes away: the underline is drawn by the system, and
    /// the system is what has to be told. Every other Mac writing app does the
    /// same thing with its "Learn Spelling" item.
    pub fn learn(word: &str) {
        NSSpellChecker::sharedSpellChecker().learnWord(&NSString::from_str(word));
    }

    /*
     * Whether the webview underlines misspellings as they are typed.
     *
     * WKWebView exposes nothing for this, and `spellcheck="true"` on the
     * editable element is not enough on its own: WebKit reads the switch from
     * a user default that has carried the same name since WebKit 1. Set before
     * the webview exists, which is why this is called from `setup` rather than
     * from the command the renderer calls.
     *
     * The squiggle itself is the system's. All Tova does is ask for it.
     */
    pub fn set_underlining(enabled: bool) {
        let defaults = objc2_foundation::NSUserDefaults::standardUserDefaults();
        defaults.setBool_forKey(
            enabled,
            &NSString::from_str("WebContinuousSpellCheckingEnabled"),
        );
        // Off deliberately: Tova's grammar checking is its own, and WebKit's
        // would draw a second kind of underline under different rules.
        defaults.setBool_forKey(false, &NSString::from_str("WebGrammarCheckingEnabled"));
    }

    pub fn unlearn(word: &str) {
        NSSpellChecker::sharedSpellChecker().unlearnWord(&NSString::from_str(word));
    }

    pub fn suggest(line: &str, at: usize, known: &[String]) -> Option<Misspelling> {
        let checker = NSSpellChecker::sharedSpellChecker();
        let language = english();

        // Without this the checker flags nothing at all — see the note at the
        // top of the file, which is the one thing here that had to be
        // measured.
        checker.setAutomaticallyIdentifiesLanguages(false);
        checker.setLanguage(&language);

        // The reader's own words, which are not misspellings.
        let ignored: Vec<objc2::rc::Retained<NSString>> =
            known.iter().map(|word| NSString::from_str(word)).collect();
        let ignored: Vec<&NSString> = ignored.iter().map(|word| &**word).collect();
        checker.setIgnoredWords_inSpellDocumentWithTag(&NSArray::from_slice(&ignored), tag());

        let text = NSString::from_str(line);
        let units = line.encode_utf16().count();
        let mut from = 0usize;

        // Every flagged word from the start, until one covers where the reader
        // clicked. Walked rather than asked directly because the checker
        // reports the *next* misspelling from an offset, not the one at it.
        while from < units {
            let mut count: NSInteger = 0;
            let found = unsafe {
                checker
                    .checkSpellingOfString_startingAt_language_wrap_inSpellDocumentWithTag_wordCount(
                        &text,
                        from as NSInteger,
                        Some(&language),
                        false,
                        tag(),
                        &mut count,
                    )
            };
            if found.length == 0 {
                return None;
            }

            let (start, end) = (found.location, found.location + found.length);
            if at < start {
                // The click was before the next misspelling, so it is on a
                // word the checker is happy with.
                return None;
            }
            if at <= end {
                let word: String = String::from_utf16_lossy(
                    &line.encode_utf16().collect::<Vec<u16>>()[start..end],
                );
                let guesses = checker
                    .guessesForWordRange_inString_language_inSpellDocumentWithTag(
                        found,
                        &text,
                        Some(&language),
                        tag(),
                    )
                    .map(|list: objc2::rc::Retained<NSArray<NSString>>| {
                        list.iter().map(|guess| guess.to_string()).collect()
                    })
                    .unwrap_or_default();

                return Some(Misspelling {
                    word,
                    from: start,
                    to: end,
                    suggestions: guesses,
                });
            }
            from = end.max(from + 1);
        }

        None
    }
}

/*
 * Nowhere else has NSSpellChecker. The webview still draws whatever squiggles
 * its platform draws; what is missing is Tova's menu, which simply never
 * appears rather than appearing empty.
 */
#[cfg(not(target_os = "macos"))]
mod system {
    use super::Misspelling;

    pub fn learn(_word: &str) {}
    pub fn unlearn(_word: &str) {}
    pub fn set_underlining(_enabled: bool) {}

    pub fn suggest(_line: &str, _at: usize, _known: &[String]) -> Option<Misspelling> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tova-spell-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_dictionary_starts_empty_and_keeps_what_is_put_in_it() {
        let dir = scratch("dictionary");

        assert!(list_words(&dir).is_empty());
        assert_eq!(add_word(&dir, "Tova").unwrap(), ["Tova"]);
        assert_eq!(list_words(&dir), ["Tova"]);

        // Ordered the way the sidebar orders anything else, and deduped.
        add_word(&dir, "alpha").unwrap();
        assert_eq!(add_word(&dir, "Tova").unwrap(), ["alpha", "Tova"]);

        assert_eq!(remove_word(&dir, "alpha").unwrap(), ["Tova"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_word_that_is_only_whitespace_is_not_a_word() {
        let dir = scratch("blank");

        assert!(add_word(&dir, "   ").unwrap().is_empty());
        assert!(add_word(&dir, "").unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_dictionary_that_cannot_be_read_is_an_empty_one() {
        let dir = scratch("broken");
        std::fs::write(dir.join("dictionary.json"), "not json").unwrap();

        assert!(list_words(&dir).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(target_os = "macos")]
    mod checker {
        use super::*;

        /*
         * These ask the system spell checker, which is a real dependency with
         * a real dictionary. They are not conformance tests — there is no
         * TypeScript to agree with, because the Electron side had no working
         * checker on macOS at all.
         */

        #[test]
        fn finds_the_misspelled_word_the_reader_clicked_on() {
            let dir = scratch("suggest");
            let line = "teh quick bwron fox";

            // On `teh`.
            let found = suggest(&dir, line, 1).expect("teh is misspelled");
            assert_eq!(found.word, "teh");
            assert_eq!((found.from, found.to), (0, 3));
            assert!(found.suggestions.contains(&"the".to_string()));

            // On `bwron`, which is the second one — so the walk past the first
            // has to work.
            let found = suggest(&dir, line, 12).expect("bwron is misspelled");
            assert_eq!(found.word, "bwron");
            assert!(found
                .suggestions
                .iter()
                .any(|guess| guess == "brown" || guess == "Byron"));

            let _ = std::fs::remove_dir_all(&dir);
        }

        #[test]
        fn a_word_that_is_spelled_correctly_offers_nothing() {
            // The menu appears on a misspelling and never on its own.
            let dir = scratch("correct");

            assert!(suggest(&dir, "the quick brown fox", 5).is_none());
            let _ = std::fs::remove_dir_all(&dir);
        }

        #[test]
        fn a_click_past_the_last_misspelling_offers_nothing() {
            let dir = scratch("past");

            assert!(suggest(&dir, "teh quick brown fox", 15).is_none());
            let _ = std::fs::remove_dir_all(&dir);
        }

        #[test]
        fn the_word_this_app_was_reported_as_getting_wrong() {
            /*
             * `teh` is the word that started this: under Electron it drew a
             * squiggle and offered no suggestions, because macOS Electron
             * ships no dictionary. Flagged here, alone or in a sentence, with
             * `the` among the guesses.
             *
             * It only works because the language is set. Left to identify the
             * language itself the checker flags nothing at all — which is the
             * one thing in this file that had to be measured, and which the
             * first measurement got wrong by changing two things at once.
             */
            let dir = scratch("teh");

            for line in ["teh", "teh quick brown fox"] {
                let found = suggest(&dir, line, 1).unwrap_or_else(|| panic!("{line:?}"));
                assert_eq!(found.word, "teh");
                assert!(found.suggestions.contains(&"the".to_string()), "{line:?}");
            }
            let _ = std::fs::remove_dir_all(&dir);
        }

        #[test]
        fn a_word_the_reader_added_stops_being_a_misspelling() {
            let dir = scratch("known");
            let line = "the zblorp is quick";
            assert!(
                suggest(&dir, line, 5).is_some(),
                "zblorp should start out flagged"
            );

            add_word(&dir, "zblorp").unwrap();

            assert!(suggest(&dir, line, 5).is_none());
            // Put the Mac back as it was: `add_word` tells the system too.
            remove_word(&dir, "zblorp").unwrap();
            let _ = std::fs::remove_dir_all(&dir);
        }

        #[test]
        fn an_offset_is_counted_the_way_javascript_counts_one() {
            // UTF-16 code units, because that is what the bridge sends and
            // what NSRange means. An emoji before the word is two of them.
            let dir = scratch("offsets");
            let line = "😀 teh quick brown fox";

            let found = suggest(&dir, line, 4).expect("teh is misspelled");
            assert_eq!(found.word, "teh");
            assert_eq!((found.from, found.to), (3, 6));
            let _ = std::fs::remove_dir_all(&dir);
        }
    }
}
