//! Prints a page to a PDF, to find out whether the export works.
//!
//! An example rather than a test, and that is the whole point of it: AppKit
//! refuses to print off the main thread, and libtest runs every test on a
//! thread it spawned — even at `--test-threads=1`. An example's `main` is the
//! main thread.
//!
//!     cargo run --manifest-path src-tauri/Cargo.toml --example print-check
//!
//! It writes a PDF to a temporary file and says how big it is. If that fails,
//! the four things to suspect in order: a print panel appeared (the two
//! `shows` flags in pdf.rs), the page had not finished laying out
//! (`isLoading`), the save URL never reached the print info
//! (`NSPrintJobSavingURL`), or this is not on the main thread after all.

#[cfg(not(target_os = "macos"))]
fn main() {
    println!("Exporting a PDF needs macOS; nothing to check here.");
}

#[cfg(target_os = "macos")]
fn main() {
    use objc2::{MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::NSApplication;
    use objc2_foundation::{NSDate, NSRunLoop, NSString, NSURL};
    use objc2_web_kit::WKWebView;
    use tova_lib::{markdown_html, pdf};

    let marker = MainThreadMarker::new().expect("an example's main is the main thread");
    // The printing machinery expects an application to exist, even though this
    // one never shows a window.
    let _app = NSApplication::sharedApplication(marker);

    pdf::forget_last();

    let page = std::env::temp_dir().join("tova-print-check.html");
    let destination = std::env::temp_dir().join("tova-print-check.pdf");
    let _ = std::fs::remove_file(&destination);

    std::fs::write(
        &page,
        markdown_html::note_pdf_page(
            "Slow Morning",
            "Coffee. Empty streets.\n\n- one\n- two\n\n## A heading\n\nAnd **bold** text.\n",
        ),
    )
    .expect("writing the page");

    // A real frame. A zero-width view has no page to paginate, and printing
    // one does not fail — it never finishes.
    let frame = objc2_foundation::NSRect::new(
        objc2_foundation::NSPoint::new(0.0, 0.0),
        objc2_foundation::NSSize::new(612.0, 792.0),
    );
    let webview = unsafe {
        WKWebView::initWithFrame_configuration(
            WKWebView::alloc(marker),
            frame,
            &objc2_web_kit::WKWebViewConfiguration::new(marker),
        )
    };
    let url = NSURL::fileURLWithPath(&NSString::from_str(page.to_str().unwrap()));
    let directory =
        NSURL::fileURLWithPath(&NSString::from_str(std::env::temp_dir().to_str().unwrap()));
    unsafe { webview.loadFileURL_allowingReadAccessToURL(&url, &directory) };

    // A run loop, because the load happens on one. The same thirty seconds of
    // patience the command has.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
    let printed = loop {
        NSRunLoop::currentRunLoop().runUntilDate(&NSDate::dateWithTimeIntervalSinceNow(0.1));
        if std::time::Instant::now() > deadline {
            break pdf::Printed::Failed("the page never finished laying out".into());
        }

        let pointer = objc2::rc::Retained::as_ptr(&webview) as *mut std::ffi::c_void;
        match unsafe { pdf::print_when_ready(pointer, &destination) } {
            pdf::Printed::NotYet => continue,
            other => break other,
        }
    };

    let _ = std::fs::remove_file(&page);

    match printed {
        pdf::Printed::Done => {}
        other => {
            eprintln!("Printing said: {other:?}");
            std::process::exit(1);
        }
    }

    let bytes = std::fs::read(&destination).expect("a file at the destination");
    assert!(bytes.starts_with(b"%PDF"), "what landed is not a PDF");
    let _ = std::fs::remove_file(&destination);
    println!(
        "wrote {} bytes of PDF to {}",
        bytes.len(),
        destination.display()
    );
}
