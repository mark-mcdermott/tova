/*!
Stopping macOS from rewriting what is typed.

Three dashes are a horizontal rule, and they are a table's delimiter row. The
Mac's text substitution turns them into one em dash the moment a space follows,
so a rule drawn while typing `---` vanishes on the next keystroke, and a table
delimiter stops being a delimiter — which stops the lines being a table at all.

Reported as the aligner shortening the dashes. It was not: nothing in Tova
rewrites a delimiter row. The substitution happens in the text system before
the webview ever hands the document over.

The same machinery curls quotes, and that one is not a matter of taste in a
markdown editor: a quote inside a code block is part of the code, and `"hi"`
curled is a string literal that no longer parses.

WebKit reads these from the app's own user defaults, which is how
`spellcheck::quiet_the_system` already turns the webview's own spelling off.
Written to Tova's domain and not the global one, so nothing outside Tova
changes — TextEdit keeps curling quotes if that is how the Mac is set up.
*/

/// The switches, each of which rewrites text rather than merely marking it.
#[cfg(target_os = "macos")]
const KEYS: [&str; 3] = [
    // `---` to an em dash, which is the one that was reported.
    "WebAutomaticDashSubstitutionEnabled",
    // `"` to a curly quote, which breaks code as surely as the dash breaks a
    // rule.
    "WebAutomaticQuoteSubstitutionEnabled",
    // The Mac's own find-and-replace table, which rewrites whatever it has
    // been told to — unknowable from here, and none of it asked for.
    "WebAutomaticTextReplacementEnabled",
];

/// Turns them off, before the webview is made.
///
/// WebKit reads each one once at startup, so this has to run first — the same
/// reason the spelling switches are set where they are.
#[cfg(target_os = "macos")]
pub fn leave_the_text_alone() {
    use objc2_foundation::{NSString, NSUserDefaults};

    let defaults = NSUserDefaults::standardUserDefaults();
    for key in KEYS {
        defaults.setBool_forKey(false, &NSString::from_str(key));
    }
}

#[cfg(not(target_os = "macos"))]
pub fn leave_the_text_alone() {}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use objc2_foundation::{NSString, NSUserDefaults};

    fn reads(key: &str) -> bool {
        NSUserDefaults::standardUserDefaults().boolForKey(&NSString::from_str(key))
    }

    /*
     * The keys are spelt exactly, because a typo here fails the way the bug
     * did: silently, with the text still being rewritten and nothing to say
     * the switch was never found. There is no error from setting a key that
     * nothing reads.
     */
    #[test]
    fn every_switch_reads_off_afterwards() {
        let defaults = NSUserDefaults::standardUserDefaults();
        for key in KEYS {
            defaults.setBool_forKey(true, &NSString::from_str(key));
        }
        assert!(KEYS.iter().all(|key| reads(key)), "the test set them on");

        leave_the_text_alone();

        for key in KEYS {
            assert!(!reads(key), "{key} is still on");
        }
    }

    /*
     * WebKit's names, not AppKit's. The AppKit spellings
     * (NSAutomaticDashSubstitutionEnabled) are what a search turns up first and
     * they are read by NSTextView, not by a web view — setting those would
     * leave the dashes being swallowed exactly as before.
     */
    #[test]
    fn the_keys_are_the_ones_webkit_reads() {
        assert!(KEYS.iter().all(|key| key.starts_with("Web")));
        assert!(KEYS.contains(&"WebAutomaticDashSubstitutionEnabled"));
    }
}
