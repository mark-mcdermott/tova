/*!
The desktop's half of an account: signing in, and the session it keeps.

Every call to Tova's server goes through here rather than through the webview,
and that is a decision rather than a convenience.

A webview reaching `https://tova.so` from `tauri://localhost` is a cross-origin
request, so the server would have to answer it with `Access-Control-Allow-Origin:
tauri://localhost` — and that origin is not this app's. It is *every* Tauri
app's. Opening it would let anything built with Tauri on this Mac call the
server with the reader's session attached.

From here there is no CORS, because CORS is a rule browsers apply to
themselves. There is no `SameSite` either, for the same reason, so the session
cookie can simply be stored and sent back the way `curl` would. And the one
thing worth protecting — the session — never enters the webview at all, which
is where an injected script would be.
*/

use crate::safe_storage;
use std::path::{Path, PathBuf};

/// Where the server is. Overridable so a development build can talk to one.
fn base_url() -> String {
    std::env::var("TOVA_SERVER").unwrap_or_else(|_| "https://tova.so".to_string())
}

/// The file the session lives in, encrypted by the system keychain.
fn session_path(data_dir: &Path) -> PathBuf {
    data_dir.join("session.bin")
}

/// The cookie this device holds, or nothing.
pub fn held(data_dir: &Path) -> Option<String> {
    let bytes = std::fs::read(session_path(data_dir)).ok()?;
    safe_storage::decrypt_string(&bytes)
}

fn hold(data_dir: &Path, cookie: &str) -> Result<(), String> {
    let path = session_path(data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    /*
     * Encrypted, never in the clear. A session is as good as a password for as
     * long as it lasts, and a plain file in Application Support is readable by
     * anything running as this user.
     */
    let sealed = safe_storage::encrypt_string(cookie)
        .ok_or_else(|| "This Mac would not store the session securely".to_string())?;
    std::fs::write(&path, sealed).map_err(|e| e.to_string())
}

fn release(data_dir: &Path) -> Result<(), String> {
    let path = session_path(data_dir);
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        // Already gone is the state being asked for, not a failure.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

/// The name and value of a `Set-Cookie`, without its attributes.
///
/// Attributes are instructions to a browser — `HttpOnly`, `SameSite`, a domain
/// — and this is not one. What has to be sent back is the pair in front of the
/// first semicolon.
pub fn cookie_pair(set_cookie: &str) -> Option<String> {
    let pair = set_cookie.split(';').next()?.trim();
    let (name, _) = pair.split_once('=')?;
    if name.trim().is_empty() {
        return None;
    }
    Some(pair.to_string())
}

/// The content key, which is the one thing that opens a note.
///
/// Kept the way the session is — encrypted by the keychain, in Application
/// Support — and for a stronger reason. A session expires and can be revoked
/// from another device. This cannot: anybody holding these thirty-two bytes
/// can read every note under this epoch, forever, with no server involved.
fn key_path(data_dir: &Path) -> PathBuf {
    data_dir.join("content-key.bin")
}

pub fn key(data_dir: &Path) -> Option<Vec<u8>> {
    let sealed = std::fs::read(key_path(data_dir)).ok()?;
    let text = safe_storage::decrypt_string(&sealed)?;
    let bytes: Vec<u8> = text
        .split(',')
        .filter(|part| !part.is_empty())
        .map(|part| part.parse::<u8>().ok())
        .collect::<Option<_>>()?;

    // Thirty-two or nothing. A short key is a corrupted file, and letting it
    // through would be a decryption failure somewhere further away.
    (bytes.len() == 32).then_some(bytes)
}

pub fn set_key(data_dir: &Path, bytes: Option<Vec<u8>>) -> Result<(), String> {
    let path = key_path(data_dir);

    let Some(bytes) = bytes else {
        return match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        };
    };

    if bytes.len() != 32 {
        return Err("A content key is 32 bytes".to_string());
    }

    std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let text = bytes
        .iter()
        .map(|byte| byte.to_string())
        .collect::<Vec<_>>()
        .join(",");
    let sealed = safe_storage::encrypt_string(&text)
        .ok_or_else(|| "This Mac would not store the key securely".to_string())?;
    std::fs::write(&path, sealed).map_err(|e| e.to_string())
}

pub struct Response {
    pub status: u16,
    pub body: String,
}

/// One request, with the session attached and any refreshed one kept.
fn send(
    data_dir: &Path,
    method: &str,
    path: &str,
    body: Option<String>,
) -> Result<Response, String> {
    let mut builder = http::Request::builder()
        .method(method)
        .uri(format!("{}{path}", base_url()))
        .header("Content-Type", "application/json")
        /*
         * Better Auth refuses a request with no `Origin` as a cross-site
         * forgery. There is no browser here to set one, so this says plainly
         * which server it believes it is talking to.
         */
        .header("Origin", base_url());

    if let Some(cookie) = held(data_dir) {
        builder = builder.header("Cookie", cookie);
    }

    let request = builder
        .body(body.unwrap_or_default())
        .map_err(|e| e.to_string())?;

    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .build()
        .into();

    let mut response = agent.run(request).map_err(|e| e.to_string())?;
    let status = response.status().as_u16();

    /*
     * A session is refreshed as it is used, so a reply can carry a new cookie.
     * Missing it would mean signing in again every week for no reason.
     */
    if let Some(fresh) = response
        .headers()
        .get("set-cookie")
        .and_then(|value| value.to_str().ok())
        .and_then(cookie_pair)
    {
        hold(data_dir, &fresh)?;
    }

    let text = response
        .body_mut()
        .read_to_string()
        .map_err(|e| e.to_string())?;

    Ok(Response { status, body: text })
}

/// Signs in with the auth secret, which is never the reader's password.
///
/// What arrives here is the output of `deriveAccountKeys` — one half of a split
/// whose other half, the key that unwraps notes, never leaves the renderer.
pub fn sign_in(data_dir: &Path, email: &str, secret: &str) -> Result<(), String> {
    let body = serde_json::json!({ "email": email, "password": secret }).to_string();
    let response = send(data_dir, "POST", "/api/auth/sign-in/email", Some(body))?;

    if response.status >= 400 {
        // One message for every way it can fail. Which part was wrong is not
        // something to tell whoever is holding the keyboard.
        return Err("That email and password did not work".to_string());
    }
    if held(data_dir).is_none() {
        return Err("The server did not send a session".to_string());
    }
    Ok(())
}

pub fn sign_out(data_dir: &Path) -> Result<(), String> {
    // The server first, so a session this device forgets is also one the
    // server has ended. Its answer does not matter: the local copy goes either
    // way, and a device that cannot reach the server still wants to sign out.
    let _ = send(
        data_dir,
        "POST",
        "/api/auth/sign-out",
        Some("{}".to_string()),
    );
    /*
     * The key goes first. A half-done sign-out that kept the key is readable
     * notes with no lock in front of them; one that kept the session is a
     * session with nothing to open. Only one of those is survivable, and it is
     * the same reasoning as the web's "forget this device".
     */
    set_key(data_dir, None)?;
    release(data_dir)
}

/// Who this device is signed in as, or nothing.
pub fn status(data_dir: &Path) -> Result<Option<String>, String> {
    if held(data_dir).is_none() {
        return Ok(None);
    }

    let response = send(data_dir, "GET", "/api/auth/get-session", None)?;
    if response.status >= 400 {
        return Ok(None);
    }

    Ok(serde_json::from_str::<serde_json::Value>(&response.body)
        .ok()
        .and_then(|json| Some(json.get("user")?.get("email")?.as_str()?.to_string())))
}

/// The sealed content keys, as the server holds them.
///
/// Opened in the renderer, never here: the password that unwraps one is typed
/// there and the key it produces is only ever useful there. This carries a
/// sealed envelope and a salt, which is all the server has.
pub fn envelopes(data_dir: &Path) -> Result<String, String> {
    refuse_or(send(data_dir, "GET", "/api/vault/envelopes", None)?)
}

/// The two sync calls, as the server answers them.
///
/// The JSON is handed back untouched. `src/shared/sync.ts` is what gives it a
/// shape, on both backends, and parsing it twice is how the two would drift.
pub fn pull(data_dir: &Path, cursor: &str, limit: Option<u32>) -> Result<String, String> {
    let query = match limit {
        Some(many) => format!("?cursor={cursor}&limit={many}"),
        None => format!("?cursor={cursor}"),
    };
    let response = send(data_dir, "GET", &format!("/api/vault/notes{query}"), None)?;
    refuse_or(response)
}

pub fn push(data_dir: &Path, notes: &str) -> Result<String, String> {
    let response = send(
        data_dir,
        "POST",
        "/api/vault/notes",
        Some(format!("{{\"notes\":{notes}}}")),
    )?;
    refuse_or(response)
}

fn refuse_or(response: Response) -> Result<String, String> {
    if response.status >= 400 {
        return Err(format!("The server said {}", response.status));
    }
    Ok(response.body)
}

#[cfg(test)]
mod tests {
    use super::*;

    /*
     * Holds the global lock for its lifetime. The keychain stand-in and
     * `TOVA_SERVER` are both process-wide, so two of these running at once
     * would be two tests editing each other's world — which is how a socket
     * test that passes alone fails in the suite.
     */
    struct Scratch {
        dir: PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = crate::vault::one_at_a_time();
            let dir = std::env::temp_dir().join(format!("tova-account-{name}"));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Self { dir, _held: held }
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    /*
     * A `Set-Cookie` is written for a browser and read back by something that
     * is not one. Everything after the first semicolon is an instruction to a
     * browser — when to expire it, which sites may send it — and sending any
     * of it back would be sending the instructions rather than the cookie.
     */
    #[test]
    fn keeps_the_pair_and_drops_the_instructions() {
        assert_eq!(
            cookie_pair("better-auth.session_token=abc123; Path=/; HttpOnly; SameSite=Lax"),
            Some("better-auth.session_token=abc123".to_string())
        );
    }

    #[test]
    fn copes_with_a_cookie_that_has_no_attributes() {
        assert_eq!(cookie_pair("a=b"), Some("a=b".to_string()));
    }

    #[test]
    fn refuses_something_that_is_not_a_cookie() {
        assert_eq!(cookie_pair(""), None);
        assert_eq!(cookie_pair("no-equals-sign"), None);
        assert_eq!(cookie_pair("=novalue"), None);
    }

    /*
     * A session is as good as a password for as long as it lasts, so it is
     * encrypted by the system keychain rather than left in a file anything
     * running as this user could read.
     */
    #[test]
    fn a_held_session_is_not_in_the_clear() {
        let scratch = Scratch::new("sealed");
        safe_storage::stand_in(Some(b"a test key"));

        hold(&scratch.dir, "better-auth.session_token=hunter2").unwrap();
        let raw = std::fs::read(session_path(&scratch.dir)).unwrap();

        assert!(
            !String::from_utf8_lossy(&raw).contains("hunter2"),
            "the session is sitting in the file as written"
        );
        assert_eq!(
            held(&scratch.dir),
            Some("better-auth.session_token=hunter2".to_string())
        );
    }

    #[test]
    fn holds_nothing_before_signing_in() {
        let scratch = Scratch::new("empty");
        assert_eq!(held(&scratch.dir), None);
    }

    #[test]
    fn releasing_twice_is_not_a_failure() {
        let scratch = Scratch::new("release");
        safe_storage::stand_in(Some(b"a test key"));

        hold(&scratch.dir, "a=b").unwrap();
        release(&scratch.dir).unwrap();

        // Already gone is the state being asked for, not something to report.
        release(&scratch.dir).unwrap();
        assert_eq!(held(&scratch.dir), None);
    }

    /*
     * Signing out clears the device even when the server cannot be reached.
     * A reader on a train who wants their notes off a laptop is not helped by
     * being told the network is down.
     */
    #[test]
    fn signing_out_clears_this_device_whatever_the_server_says() {
        let scratch = Scratch::new("signout");
        safe_storage::stand_in(Some(b"a test key"));
        std::env::set_var("TOVA_SERVER", "http://127.0.0.1:1");

        hold(&scratch.dir, "a=b").unwrap();
        sign_out(&scratch.dir).unwrap();

        assert_eq!(held(&scratch.dir), None);
        std::env::remove_var("TOVA_SERVER");
    }

    /// A server, for the length of one request.
    ///
    /// Here rather than mocked, because what is worth testing is `send` itself
    /// — that it attaches the session it holds, and keeps a refreshed one. A
    /// stand-in for the transport would test the stand-in.
    fn one_request(reply: &'static str) -> (String, std::sync::mpsc::Receiver<String>) {
        use std::io::{Read, Write};

        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("a port");
        let port = listener.local_addr().unwrap().port();
        let (sent, received) = std::sync::mpsc::channel();

        std::thread::spawn(move || {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };

            /*
             * Until the headers end. One `read` can return a partial request,
             * and closing a socket with the rest still unread is what sends an
             * RST instead of a clean close — which the client reports as
             * "connection reset by peer", intermittently, under load.
             */
            let mut request = Vec::new();
            let mut buffer = [0u8; 1024];
            while !request.windows(4).any(|four| four == b"\r\n\r\n") {
                match stream.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(read) => request.extend_from_slice(&buffer[..read]),
                }
            }
            let _ = sent.send(String::from_utf8_lossy(&request).into_owned());

            let _ = stream.write_all(reply.as_bytes());
            let _ = stream.flush();
            // FIN rather than a drop, so the client reads the reply it was sent.
            let _ = stream.shutdown(std::net::Shutdown::Write);
        });

        (format!("http://127.0.0.1:{port}"), received)
    }

    /*
     * A session is refreshed as it is used, so a reply can carry a new cookie.
     * Missing it would mean signing in again every week for no reason — and
     * nothing would say why, because everything would work until it did not.
     */
    #[test]
    fn keeps_a_session_the_server_refreshes() {
        let scratch = Scratch::new("refresh");
        safe_storage::stand_in(Some(b"a test key"));
        hold(&scratch.dir, "session=old").unwrap();

        let (url, _asked) = one_request(
            "HTTP/1.1 200 OK\r\nSet-Cookie: session=new; Path=/; HttpOnly\r\nContent-Length: 2\r\n\r\n{}",
        );
        std::env::set_var("TOVA_SERVER", &url);

        send(&scratch.dir, "GET", "/api/auth/get-session", None).unwrap();

        assert_eq!(held(&scratch.dir), Some("session=new".to_string()));
        std::env::remove_var("TOVA_SERVER");
    }

    #[test]
    fn sends_the_session_it_is_holding() {
        let scratch = Scratch::new("attach");
        safe_storage::stand_in(Some(b"a test key"));
        hold(&scratch.dir, "session=hunter2").unwrap();

        let (url, asked) = one_request("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}");
        std::env::set_var("TOVA_SERVER", &url);

        send(&scratch.dir, "GET", "/api/vault/notes", None).unwrap();

        let request = asked
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        assert!(
            request.contains("cookie: session=hunter2"),
            "sent: {request}"
        );
        // Better Auth refuses a request with no Origin as a cross-site forgery.
        assert!(
            request.to_lowercase().contains("origin:"),
            "sent: {request}"
        );
        std::env::remove_var("TOVA_SERVER");
    }

    /*
     * Anybody holding these thirty-two bytes can read every note under this
     * epoch, forever, with no server involved — which is a stronger claim than
     * the session next to it, and the reason both are keychain-encrypted.
     */
    #[test]
    fn the_content_key_is_not_in_the_clear_either() {
        let scratch = Scratch::new("key");
        safe_storage::stand_in(Some(b"a test key"));
        let bytes: Vec<u8> = (0..32).collect();

        set_key(&scratch.dir, Some(bytes.clone())).unwrap();
        let raw = std::fs::read(key_path(&scratch.dir)).unwrap();

        assert!(
            !raw.windows(32).any(|window| window == bytes.as_slice()),
            "the key is sitting in the file as written"
        );
        assert_eq!(key(&scratch.dir), Some(bytes));
    }

    #[test]
    fn refuses_a_key_that_is_not_thirty_two_bytes() {
        let scratch = Scratch::new("short");
        safe_storage::stand_in(Some(b"a test key"));

        assert!(set_key(&scratch.dir, Some(vec![1, 2, 3])).is_err());
        assert_eq!(key(&scratch.dir), None);
    }

    /*
     * The key goes before the session. Half a sign-out that kept the key is
     * readable notes with no lock in front of them; one that kept the session
     * is a session with nothing to open.
     */
    #[test]
    fn signing_out_takes_the_key_with_it() {
        let scratch = Scratch::new("signout-key");
        safe_storage::stand_in(Some(b"a test key"));
        std::env::set_var("TOVA_SERVER", "http://127.0.0.1:1");

        hold(&scratch.dir, "a=b").unwrap();
        set_key(&scratch.dir, Some((0..32).collect())).unwrap();
        sign_out(&scratch.dir).unwrap();

        assert_eq!(key(&scratch.dir), None);
        assert_eq!(held(&scratch.dir), None);
        std::env::remove_var("TOVA_SERVER");
    }

    #[test]
    fn clearing_a_key_that_is_not_there_is_not_a_failure() {
        let scratch = Scratch::new("clear");
        set_key(&scratch.dir, None).unwrap();
        assert_eq!(key(&scratch.dir), None);
    }

    /**
     * The handshake, against a server that is actually running.
     *
     * Ignored by default, because it needs one. Everything above tests this
     * module's own decisions; this tests the two ends agreeing — whether
     * Better Auth accepts the `Origin` a non-browser sends, whether the cookie
     * it sets is one this can store and send back, and whether a vault call
     * with that cookie is let through.
     *
     *     TOVA_SERVER=http://localhost:4321 \
     *     TOVA_PROBE_EMAIL=… TOVA_PROBE_SECRET=… \
     *     cargo test --manifest-path src-tauri/Cargo.toml -- --ignored signs_in_against
     */
    #[test]
    #[ignore = "needs a running server and an account on it"]
    fn signs_in_against_a_real_server() {
        let scratch = Scratch::new("live");
        safe_storage::stand_in(Some(b"a test key"));

        let email = std::env::var("TOVA_PROBE_EMAIL").expect("TOVA_PROBE_EMAIL");
        let secret = std::env::var("TOVA_PROBE_SECRET").expect("TOVA_PROBE_SECRET");

        sign_in(&scratch.dir, &email, &secret).expect("the sign-in to be accepted");
        assert!(held(&scratch.dir).is_some(), "no session was kept");

        assert_eq!(
            status(&scratch.dir).expect("a status"),
            Some(email),
            "the server did not recognise the session it had just issued"
        );

        // An authenticated vault call, which is what the session is for.
        let pulled = pull(&scratch.dir, "0", Some(10)).expect("the pull to be let through");
        assert!(pulled.contains("\"notes\""), "unexpected reply: {pulled}");

        sign_out(&scratch.dir).expect("the sign-out to work");
        assert!(
            held(&scratch.dir).is_none(),
            "the session outlived the sign-out"
        );
    }

    #[test]
    fn says_nobody_is_signed_in_when_nothing_is_held() {
        let scratch = Scratch::new("status");
        assert_eq!(status(&scratch.dir).unwrap(), None);
    }
}
