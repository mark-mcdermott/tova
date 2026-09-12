/*!
Printing a note to PDF — the half of `exportNotePdf` that Chromium did.

Electron called `webContents.printToPDF`, which is a browser engine's own
printer, and there is no such call here. What replaces it is WKWebView's
`createPDFWithConfiguration:`, which is the API AppKit provides for exactly
this and is the only one that works: `NSPrintOperation` produces paginated
output and would have matched Electron more closely, but WKWebView renders out
of process and paginating it needs the run loop that `runOperation` blocks. It
deadlocks. That was found by running it rather than by reading about it.

The one visible difference: this writes a single continuous page rather than a
run of Letter-sized ones. A reader opening the PDF sees the note; a reader
printing it gets pagination from whatever prints it.

Nothing here can be checked against a fixture — there is no output to compare
and the thing it drives is a webview. `examples/print-check.rs` is what checks
it instead, and it is an example rather than a test because AppKit will not
print off the main thread and libtest runs every test on a thread it spawned.
*/

/// Whether the page was ready, and what came of it once it was.
#[derive(Debug)]
pub enum Printed {
    NotYet,
    Done,
    Failed(String),
}

#[cfg(target_os = "macos")]
mod mac {
    use super::Printed;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;

    use block2::RcBlock;
    use objc2::MainThreadMarker;
    use objc2_foundation::{NSData, NSError};
    use objc2_web_kit::WKWebView;

    /*
     * One export at a time, which is what the command guarantees by holding
     * the window it prints from. The completion block has to put its answer
     * somewhere the poller can find it, and it does not run on the thread that
     * asked — so somewhere is here rather than a return value.
     */
    static ASKED: AtomicBool = AtomicBool::new(false);
    static OUTCOME: Mutex<Option<Result<(), String>>> = Mutex::new(None);

    /// Forgets the last export. Called before each one, so a failure cannot be
    /// reported twice or a success inherited by the next note.
    pub fn forget_last() {
        ASKED.store(false, Ordering::SeqCst);
        *OUTCOME.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    fn finish(destination: &Path, data: *mut NSData, error: *mut NSError) -> Result<(), String> {
        if data.is_null() {
            let said = unsafe { error.as_ref() }
                .map(|error| error.localizedDescription().to_string())
                .unwrap_or_else(|| "the webview returned no PDF".to_string());
            return Err(format!("The page could not be printed: {said}"));
        }

        let bytes = unsafe { (*data).to_vec() };
        std::fs::write(destination, bytes).map_err(|e| e.to_string())
    }

    /// Asks for the PDF once the page has finished laying out, then reports
    /// what came back. Called repeatedly; the work happens on the first call
    /// that finds the page ready.
    ///
    /// Must run on the main thread, which is where `with_webview` puts it.
    ///
    /// # Safety
    ///
    /// `webview` must be a live WKWebView, which is what Tauri hands to the
    /// closure this is called from.
    pub unsafe fn print_when_ready(webview: *mut std::ffi::c_void, destination: &Path) -> Printed {
        let Some(marker) = MainThreadMarker::new() else {
            return Printed::Failed("Printing has to happen on the main thread".into());
        };

        if let Some(outcome) = OUTCOME.lock().unwrap_or_else(|e| e.into_inner()).take() {
            return match outcome {
                Ok(()) => Printed::Done,
                Err(why) => Printed::Failed(why),
            };
        }
        if ASKED.load(Ordering::SeqCst) {
            return Printed::NotYet;
        }

        let webview: &WKWebView = unsafe { &*(webview as *const WKWebView) };
        if webview.isLoading() {
            return Printed::NotYet;
        }

        ASKED.store(true, Ordering::SeqCst);
        let destination: PathBuf = destination.to_path_buf();
        let handler = RcBlock::new(move |data: *mut NSData, error: *mut NSError| {
            let answer = finish(&destination, data, error);
            *OUTCOME.lock().unwrap_or_else(|e| e.into_inner()) = Some(answer);
        });

        // No configuration: the whole of the page, which is what a note is.
        let _ = marker;
        unsafe { webview.createPDFWithConfiguration_completionHandler(None, &handler) };
        Printed::NotYet
    }
}

#[cfg(target_os = "macos")]
pub use mac::{forget_last, print_when_ready};
