/*!
Grammar's dictionary, fetched rather than shipped.

Harper is 15MB of WebAssembly — more than half of what a Tova download used to
weigh — and nearly all of it is a dictionary for a feature that is off until
somebody turns it on. So it is not in the bundle. The first run asks, and if
the answer is yes the file arrives in the background while the reader gets on
with writing.

Saying no is not a degraded Tova. Spelling is the system's own checker and
costs nothing to ship; what goes missing is grammar, and an app that opens no
connection at all is the point of the offline answer rather than a shortfall
of it.

The bytes are pinned. `EXPECTED` is the exact length and hash of harper.js
2.7.0's slim binary, checked before the download is kept and before anything
is handed to the webview, so a file that is truncated, redirected, cached
wrong or tampered with is discarded rather than run. That is also what makes
more than one source safe: neither can serve anything but these bytes.
*/

use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};

/// The one binary this build will accept.
struct Expected {
    version: &'static str,
    bytes: u64,
    sha256: &'static str,
}

const EXPECTED: Expected = Expected {
    version: "2.7.0",
    bytes: 15_634_488,
    sha256: "0251393c6a85396059e7798c0188c97ee0393a0e2e1adba538b65592e955a2c0",
};

/*
 * Where to ask, in order.
 *
 * Tova's own release first: the updater already talks to GitHub, so grammar
 * adds no new party to the one connection the app makes on its own. The
 * registry second, so the feature still works before a release exists and on
 * a day GitHub does not — pinned to the exact version, and held to the same
 * hash, so it is a second copy rather than a second thing to trust.
 */
const SOURCES: [&str; 2] = [
    "https://github.com/mark-mcdermott/tova/releases/download/grammar-2.7.0/harper_wasm_slim_bg.wasm",
    "https://cdn.jsdelivr.net/npm/harper.js@2.7.0/dist/harper_wasm_slim_bg.wasm",
];

/// Generous enough for a slow line, short enough that a hung connection does
/// not leave "getting ready" on screen forever.
const TIMEOUT_SECONDS: u64 = 180;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// Whether the binary is here and the right size.
    pub ready: bool,
    /// What a download would cost, so the question can say so before asking.
    pub bytes: u64,
    pub version: &'static str,
}

fn directory(data_dir: &Path) -> PathBuf {
    data_dir.join("grammar")
}

/// Named after the version, so an upgrade fetches beside the old one rather
/// than over it, and a half-written new file cannot break the working old one.
pub fn binary_path(data_dir: &Path) -> PathBuf {
    directory(data_dir).join(format!("harper-{}-slim.wasm", EXPECTED.version))
}

/*
 * Length rather than hash.
 *
 * This is asked on every launch and the file is 15MB; hashing it each time
 * would be a tenth of a second spent re-answering a question that was settled
 * when it was written. The hash is checked where it matters — before the file
 * is kept, and again before it is served.
 */
pub fn status(data_dir: &Path) -> Status {
    let ready = std::fs::metadata(binary_path(data_dir))
        .map(|file| file.is_file() && file.len() == EXPECTED.bytes)
        .unwrap_or(false);

    Status {
        ready,
        bytes: EXPECTED.bytes,
        version: EXPECTED.version,
    }
}

fn digest(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn is_expected(bytes: &[u8]) -> bool {
    bytes.len() as u64 == EXPECTED.bytes && digest(bytes) == EXPECTED.sha256
}

/// Writes the binary, having checked it is the binary. Through a part file and
/// a rename, so an interrupted write leaves no half a dictionary behind.
fn keep(data_dir: &Path, bytes: &[u8]) -> Result<(), String> {
    if !is_expected(bytes) {
        return Err("That is not the grammar dictionary Tova expects".into());
    }

    let directory = directory(data_dir);
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;

    let part = directory.join("harper.part");
    std::fs::write(&part, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&part, binary_path(data_dir)).map_err(|e| e.to_string())
}

fn download(url: &str) -> Result<Vec<u8>, String> {
    let response = ureq::get(url)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(TIMEOUT_SECONDS)))
        .build()
        .call()
        .map_err(|why| why.to_string())?;

    let mut bytes = Vec::with_capacity(EXPECTED.bytes as usize);
    response
        .into_body()
        .into_reader()
        // One byte past what is expected: enough to notice something longer,
        // without reading a whole wrong file into memory to find out.
        .take(EXPECTED.bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|why| why.to_string())?;

    Ok(bytes)
}

/// Fetches the dictionary if it is not already here. Tries each source, and
/// reports the last failure if none of them worked.
pub fn fetch(data_dir: &Path) -> Result<Status, String> {
    if status(data_dir).ready {
        return Ok(status(data_dir));
    }

    let mut last = "No source for the grammar dictionary".to_string();

    for url in SOURCES {
        match download(url).and_then(|bytes| keep(data_dir, &bytes)) {
            Ok(()) => return Ok(status(data_dir)),
            Err(why) => last = why,
        }
    }

    Err(last)
}

/*
 * Handing the file to the webview.
 *
 * A scheme of its own rather than a path under one of the picture schemes, for
 * the reason those are two schemes and not one: a handler that can only ever
 * serve one file cannot be talked into serving another.
 *
 * The hash is checked here as well as on the way in. This is the only place
 * that hands bytes to `WebAssembly.instantiate`, and a file that changed on
 * disk between the two is exactly what a check on the way in cannot see.
 */
pub fn serve(data_dir: &Path, uri: &http::Uri) -> http::Response<std::borrow::Cow<'static, [u8]>> {
    let refused = |status: u16| {
        http::Response::builder()
            .status(status)
            .body(std::borrow::Cow::Borrowed(&[][..]))
            .expect("an empty response")
    };

    if uri.path().trim_matches('/') != "harper.wasm" {
        return refused(404);
    }

    let Ok(bytes) = std::fs::read(binary_path(data_dir)) else {
        return refused(404);
    };
    if !is_expected(&bytes) {
        return refused(409);
    }

    wasm(bytes)
}

/*
 * The headers the dictionary is handed over with.
 *
 * Its own function so the headers can be checked without conjuring 15MB of
 * valid dictionary to get at the success path.
 */
fn wasm(bytes: Vec<u8>) -> http::Response<std::borrow::Cow<'static, [u8]>> {
    http::Response::builder()
        .header("content-type", "application/wasm")
        /*
         * Harper reaches this with `fetch`, not with a tag.
         *
         * That is the difference between this scheme and the two that serve
         * pictures: an `<img src>` on a custom scheme is not gated on CORS,
         * and a `fetch` is. Without this header the request is refused by the
         * webview, every test still passes, and grammar reads as on while
         * underlining nothing — which is the failure this whole feature was
         * careful to avoid everywhere else.
         */
        .header("access-control-allow-origin", "*")
        .body(std::borrow::Cow::Owned(bytes))
        .unwrap_or_else(|_| {
            http::Response::builder()
                .status(500)
                .body(std::borrow::Cow::Borrowed(&[][..]))
                .expect("an empty response")
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Scratch {
        data: PathBuf,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let data = std::env::temp_dir().join(format!("tova-grammar-{name}"));
            let _ = std::fs::remove_dir_all(&data);
            std::fs::create_dir_all(&data).expect("a scratch directory");
            Self { data }
        }

        /// A file of exactly the right length and entirely the wrong content.
        fn impostor(&self) {
            std::fs::create_dir_all(directory(&self.data)).unwrap();
            std::fs::write(binary_path(&self.data), vec![0u8; EXPECTED.bytes as usize]).unwrap();
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.data);
        }
    }

    /// Against the published vector for the empty input, so the hashing itself
    /// is checked rather than only checked against itself.
    #[test]
    fn hashes_the_way_sha256_does() {
        assert_eq!(
            digest(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            digest(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn nothing_here_is_not_ready() {
        let s = Scratch::new("absent");
        let status = status(&s.data);
        assert!(!status.ready);
        assert_eq!(status.bytes, EXPECTED.bytes);
    }

    /*
     * `status` weighs the file and `serve` hashes it, and this is the case that
     * tells them apart: a file of exactly the right length whose content is
     * nothing of the sort. Launch says ready, because hashing 15MB on every
     * launch to re-answer a settled question is not worth a tenth of a second.
     * Serving refuses it, because that is the moment it would be run.
     */
    #[test]
    fn the_right_length_is_enough_to_look_ready_and_not_enough_to_be_served() {
        let s = Scratch::new("impostor");
        s.impostor();

        assert!(status(&s.data).ready);
        assert_eq!(
            serve(&s.data, &"/harper.wasm".parse().unwrap()).status(),
            409
        );
    }

    /*
     * A short file is not a dictionary.
     *
     * Without this, `status` could go back to asking only whether the file
     * exists, and a download cut off half way would report ready — grammar
     * would turn itself on, fail to load, and say nothing about why.
     */
    #[test]
    fn a_truncated_file_is_not_ready() {
        let s = Scratch::new("truncated");
        std::fs::create_dir_all(directory(&s.data)).unwrap();
        std::fs::write(binary_path(&s.data), vec![0u8; 1024]).unwrap();

        assert!(!status(&s.data).ready);
    }

    #[test]
    fn a_file_that_is_not_the_dictionary_is_not_kept() {
        let s = Scratch::new("refused");
        assert!(keep(&s.data, b"not fifteen megabytes of anything").is_err());
        assert!(!binary_path(&s.data).exists());
        assert!(!status(&s.data).ready);
    }

    #[test]
    fn a_refused_download_leaves_no_part_file_behind() {
        let s = Scratch::new("part");
        let _ = keep(&s.data, b"wrong");
        let left: Vec<_> = std::fs::read_dir(directory(&s.data))
            .map(|entries| entries.flatten().map(|e| e.file_name()).collect())
            .unwrap_or_default();
        assert!(left.is_empty(), "left {left:?} behind");
    }

    #[test]
    fn it_serves_nothing_but_the_dictionary() {
        let s = Scratch::new("paths");
        s.impostor();

        for path in [
            "/",
            "/other.wasm",
            "/../preferences.json",
            "/harper.wasm/extra",
        ] {
            let response = serve(&s.data, &path.parse().unwrap());
            assert_eq!(response.status(), 404, "for {path}");
        }
    }

    /*
     * Harper fetches this rather than pointing a tag at it, and a fetch on a
     * custom scheme is refused without the allow-origin header. Nothing else
     * in the suite would notice: the bytes would be right, the status 200, and
     * the webview would drop it on the floor.
     */
    #[test]
    fn what_it_serves_can_be_fetched_rather_than_only_linked_to() {
        let response = wasm(b"\0asm".to_vec());

        assert_eq!(response.status(), 200);
        assert_eq!(
            response.headers().get("content-type").unwrap(),
            "application/wasm"
        );
        assert_eq!(
            response
                .headers()
                .get("access-control-allow-origin")
                .unwrap(),
            "*",
            "a fetch on a custom scheme is refused without this"
        );
    }

    #[test]
    fn a_missing_file_is_a_404_rather_than_a_panic() {
        let s = Scratch::new("missing");
        assert_eq!(
            serve(&s.data, &"/harper.wasm".parse().unwrap()).status(),
            404
        );
    }

    /// The version is in the filename, so a future upgrade lands beside this
    /// one rather than over it.
    #[test]
    fn the_binary_is_named_after_its_version() {
        let s = Scratch::new("named");
        let path = binary_path(&s.data);
        assert!(path.to_string_lossy().contains(EXPECTED.version));
    }
}
