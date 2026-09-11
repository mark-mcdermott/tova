/*!
The GitHub Contents API, narrowed to what publishing needs: read a file's SHA,
write it, list a directory, read one, and delete it — a port of
`src/main/publish/github.ts`.

Nothing here holds a token. Each call is given one by the caller, which reads
it from the keychain and drops it again, so a token never outlives the request
it was fetched for.

`Contents` is a trait rather than five free functions because the sync has to
be testable without a network, which is exactly what the TypeScript arranges by
mocking this module. The real implementation is `Api`; the sync's tests use a
fake, and the small number of tests that need to prove the HTTP itself is right
run against a stub server on a loopback port.
*/

// Called by the sync, which is the slice after this one. Ported first so the
// HTTP is settled — and reviewable — before the algorithm that leans on it.
#![allow(dead_code)]

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::json;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GithubError {
    pub message: String,
    pub status: u16,
}

impl std::fmt::Display for GithubError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl GithubError {
    fn new(message: impl Into<String>, status: u16) -> Self {
        GithubError {
            message: message.into(),
            status,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteFile {
    pub name: String,
    pub path: String,
    pub sha: String,
}

/*
 * The three that name a file, gathered rather than repeated.
 *
 * A departure from the TypeScript, which passes them separately five times
 * over — worth making because the alternative was a `write` with eight
 * parameters, and because a caller that muddles a branch for a path now has to
 * do it at a named field rather than at a position.
 */
pub struct Target<'a> {
    pub repo: &'a str,
    pub branch: &'a str,
    pub path: &'a str,
}

pub trait Contents {
    /// `None` when the file is simply not there yet.
    fn read_sha(&self, target: &Target, token: &str) -> Result<Option<String>, GithubError>;

    /// Creates or updates in one call; the SHA is what makes it an update.
    fn write(
        &self,
        target: &Target,
        content: &str,
        message: &str,
        token: &str,
        sha: Option<&str>,
    ) -> Result<String, GithubError>;

    /// The markdown files in one directory. An absent directory is empty.
    fn list_directory(&self, target: &Target, token: &str) -> Result<Vec<RemoteFile>, GithubError>;

    /// The decoded text of one file.
    fn read_content(&self, target: &Target, token: &str) -> Result<String, GithubError>;

    fn delete(
        &self,
        target: &Target,
        sha: &str,
        message: &str,
        token: &str,
    ) -> Result<(), GithubError>;
}

pub struct Api {
    base: String,
}

impl Default for Api {
    fn default() -> Self {
        Api {
            base: "https://api.github.com".to_string(),
        }
    }
}

impl Api {
    #[cfg(test)]
    fn at(base: &str) -> Self {
        Api {
            base: base.to_string(),
        }
    }

    fn contents_url(&self, repo: &str, path: &str) -> String {
        let encoded: Vec<String> = path.split('/').map(encode_component).collect();
        format!("{}/repos/{repo}/contents/{}", self.base, encoded.join("/"))
    }
}

/// `encodeURIComponent`: everything but the unreserved set and the four marks
/// JavaScript leaves alone.
fn encode_component(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        let c = *byte as char;
        if c.is_ascii_alphanumeric()
            || matches!(c, '-' | '_' | '.' | '!' | '~' | '*' | '\'' | '(' | ')')
        {
            out.push(c);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/*
 * GitHub's messages are the useful part of a failure; the status alone is not.
 * A body that is not JSON falls through to the status, the way the TypeScript
 * falls through to statusText.
 */
fn describe_failure(status: u16, body: &str) -> GithubError {
    let message = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|json| json.get("message")?.as_str().map(str::to_string))
        .filter(|message| !message.is_empty())
        .unwrap_or_else(|| format!("HTTP {status}"));

    GithubError::new(message, status)
}

const JSON: &str = "application/vnd.github+json";

/*
 * One way in and out for every call, so a failure is read the same way
 * wherever it came from.
 *
 * `http::Request` rather than ureq's own builders: those are typed by whether
 * the method carries a body, and GitHub's delete carries one where the type
 * says it should not.
 */
fn send(
    method: &str,
    url: &str,
    token: &str,
    accept: &str,
    body: Option<serde_json::Value>,
) -> Result<(u16, String), GithubError> {
    let payload = body.map(|json| json.to_string()).unwrap_or_default();

    let request = http::Request::builder()
        .method(method)
        .uri(url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", accept)
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("Content-Type", "application/json")
        .body(payload)
        .map_err(|e| GithubError::new(e.to_string(), 0))?;

    // Errors come back as responses rather than as transport failures, so the
    // status and GitHub's own message reach `describe_failure` together.
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .build()
        .into();

    // A status of 0 says the request never reached GitHub at all, which is a
    // different thing from GitHub refusing it.
    let mut response = agent
        .run(request)
        .map_err(|e| GithubError::new(e.to_string(), 0))?;

    let status = response.status().as_u16();
    let text = response
        .body_mut()
        .read_to_string()
        .map_err(|e| GithubError::new(e.to_string(), status))?;
    Ok((status, text))
}

impl Contents for Api {
    fn read_sha(&self, target: &Target, token: &str) -> Result<Option<String>, GithubError> {
        let url = format!(
            "{}?ref={}",
            self.contents_url(target.repo, target.path),
            encode_component(target.branch)
        );
        let (status, body) = send("GET", &url, token, JSON, None)?;

        if status == 404 {
            return Ok(None);
        }
        if !(200..300).contains(&status) {
            return Err(describe_failure(status, &body));
        }

        serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|json| json.get("sha")?.as_str().map(str::to_string))
            .map(Some)
            .ok_or_else(|| GithubError::new("GitHub returned a file with no sha", 200))
    }

    fn write(
        &self,
        target: &Target,
        content: &str,
        message: &str,
        token: &str,
        sha: Option<&str>,
    ) -> Result<String, GithubError> {
        let mut payload = json!({
            "message": message,
            "branch": target.branch,
            "content": B64.encode(content.as_bytes()),
        });
        if let Some(sha) = sha {
            payload["sha"] = json!(sha);
        }

        let url = self.contents_url(target.repo, target.path);
        let (status, body) = send("PUT", &url, token, JSON, Some(payload))?;

        if !(200..300).contains(&status) {
            return Err(describe_failure(status, &body));
        }

        serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|json| json.get("commit")?.get("sha")?.as_str().map(str::to_string))
            .ok_or_else(|| GithubError::new("GitHub returned no commit", 200))
    }

    fn list_directory(&self, target: &Target, token: &str) -> Result<Vec<RemoteFile>, GithubError> {
        let url = format!(
            "{}?ref={}",
            self.contents_url(target.repo, target.path.trim_end_matches('/')),
            encode_component(target.branch)
        );
        let (status, body) = send("GET", &url, token, JSON, None)?;

        if status == 404 {
            return Ok(Vec::new());
        }
        if !(200..300).contains(&status) {
            return Err(describe_failure(status, &body));
        }

        let parsed: serde_json::Value = serde_json::from_str(&body)
            .map_err(|_| GithubError::new("GitHub returned something that is not JSON", 200))?;
        let entries = parsed
            .as_array()
            .ok_or_else(|| GithubError::new("That content path is a file, not a folder", 200))?;

        Ok(entries
            .iter()
            .filter(|entry| {
                entry["type"] == "file"
                    && entry["name"].as_str().is_some_and(|n| n.ends_with(".md"))
            })
            .map(|entry| RemoteFile {
                name: entry["name"].as_str().unwrap_or_default().to_string(),
                path: entry["path"].as_str().unwrap_or_default().to_string(),
                sha: entry["sha"].as_str().unwrap_or_default().to_string(),
            })
            .collect())
    }

    fn read_content(&self, target: &Target, token: &str) -> Result<String, GithubError> {
        let url = format!(
            "{}?ref={}",
            self.contents_url(target.repo, target.path),
            encode_component(target.branch)
        );
        // Raw, so what comes back is the file rather than a JSON wrapper
        // around a base64 of it.
        let (status, body) = send("GET", &url, token, "application/vnd.github.raw+json", None)?;

        if !(200..300).contains(&status) {
            return Err(describe_failure(status, &body));
        }
        Ok(body)
    }

    fn delete(
        &self,
        target: &Target,
        sha: &str,
        message: &str,
        token: &str,
    ) -> Result<(), GithubError> {
        let url = self.contents_url(target.repo, target.path);
        let payload = json!({ "message": message, "branch": target.branch, "sha": sha });
        let (status, body) = send("DELETE", &url, token, JSON, Some(payload))?;

        // A file already gone is the state we wanted anyway.
        if status == 404 || (200..300).contains(&status) {
            return Ok(());
        }
        Err(describe_failure(status, &body))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;

    /// What one request looked like, so a test can assert on what was sent as
    /// well as on what came back.
    #[derive(Debug)]
    struct Seen {
        method: String,
        target: String,
        headers: Vec<(String, String)>,
        body: String,
    }

    impl Seen {
        fn header(&self, name: &str) -> Option<&str> {
            self.headers
                .iter()
                .find(|(key, _)| key.eq_ignore_ascii_case(name))
                .map(|(_, value)| value.as_str())
        }
    }

    /*
     * A stub GitHub on a loopback port.
     *
     * Written here rather than pulled in, because the whole of what it needs
     * to do is read one request and write one canned response — and because a
     * test that proves the HTTP is right should not be reading someone else's
     * idea of what the HTTP was.
     */
    fn stub(status: u16, body: &'static str) -> (String, mpsc::Receiver<Seen>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a port");
        let port = listener.local_addr().expect("an address").port();
        let (tx, rx) = mpsc::channel();

        std::thread::spawn(move || {
            let Ok((mut socket, _)) = listener.accept() else {
                return;
            };
            let mut reader = BufReader::new(socket.try_clone().expect("a clone"));

            let mut start = String::new();
            reader.read_line(&mut start).expect("a request line");
            let mut parts = start.split_whitespace();
            let method = parts.next().unwrap_or_default().to_string();
            let target = parts.next().unwrap_or_default().to_string();

            let mut headers = Vec::new();
            let mut length = 0usize;
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap_or(0) == 0 || line.trim().is_empty() {
                    break;
                }
                if let Some((key, value)) = line.split_once(':') {
                    if key.eq_ignore_ascii_case("content-length") {
                        length = value.trim().parse().unwrap_or(0);
                    }
                    headers.push((key.trim().to_string(), value.trim().to_string()));
                }
            }

            let mut sent = vec![0u8; length];
            if length > 0 {
                reader.read_exact(&mut sent).expect("a body");
            }

            let _ = tx.send(Seen {
                method,
                target,
                headers,
                body: String::from_utf8_lossy(&sent).into_owned(),
            });

            let response = format!(
                "HTTP/1.1 {status} Stub\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = socket.write_all(response.as_bytes());
            let _ = socket.flush();
        });

        (format!("http://127.0.0.1:{port}"), rx)
    }

    fn at<'a>(repo: &'a str, branch: &'a str, path: &'a str) -> Target<'a> {
        Target { repo, branch, path }
    }

    fn seen(rx: &mpsc::Receiver<Seen>) -> Seen {
        rx.recv_timeout(std::time::Duration::from_secs(5))
            .expect("the stub saw a request")
    }

    #[test]
    fn a_request_carries_the_token_and_the_api_version() {
        // The token is a parameter rather than state, so that it can be read
        // from the keychain for one call and dropped again.
        let (base, rx) = stub(200, r#"{"sha":"abc"}"#);

        Api::at(&base)
            .read_sha(&at("me/blog", "main", "posts/a.md"), "ghp_hunter2")
            .unwrap();

        let request = seen(&rx);
        assert_eq!(request.method, "GET");
        assert_eq!(request.header("Authorization"), Some("Bearer ghp_hunter2"));
        assert_eq!(request.header("X-GitHub-Api-Version"), Some("2022-11-28"));
        assert_eq!(request.header("Accept"), Some(JSON));
    }

    #[test]
    fn a_path_is_escaped_a_segment_at_a_time() {
        // Segment by segment, so the slashes that separate a path survive and
        // the ones inside a filename do not.
        let (base, rx) = stub(200, r#"{"sha":"abc"}"#);

        Api::at(&base)
            .read_sha(
                &at("me/blog", "a branch", "src/content/a note & more.md"),
                "t",
            )
            .unwrap();

        let request = seen(&rx);
        assert_eq!(
            request.target,
            "/repos/me/blog/contents/src/content/a%20note%20%26%20more.md?ref=a%20branch"
        );
    }

    #[test]
    fn a_file_that_is_not_there_yet_is_not_a_failure() {
        let (base, _rx) = stub(404, r#"{"message":"Not Found"}"#);

        assert_eq!(
            Api::at(&base).read_sha(&at("me/blog", "main", "posts/a.md"), "t"),
            Ok(None)
        );
    }

    #[test]
    fn githubs_own_message_is_what_a_failure_says() {
        // The status alone is not useful: "Bad credentials" is.
        let (base, _rx) = stub(401, r#"{"message":"Bad credentials"}"#);

        let failed = Api::at(&base)
            .read_sha(&at("me/blog", "main", "posts/a.md"), "t")
            .unwrap_err();

        assert_eq!(failed.message, "Bad credentials");
        assert_eq!(failed.status, 401);
    }

    #[test]
    fn a_failure_that_is_not_json_still_says_something() {
        let (base, _rx) = stub(502, "<html>bad gateway</html>");

        let failed = Api::at(&base)
            .list_directory(&at("me/blog", "main", "posts/"), "t")
            .unwrap_err();

        assert_eq!(failed.message, "HTTP 502");
        assert_eq!(failed.status, 502);
    }

    #[test]
    fn a_write_sends_the_content_base64_and_the_sha_that_makes_it_an_update() {
        let (base, rx) = stub(200, r#"{"commit":{"sha":"deadbeef"}}"#);

        let commit = Api::at(&base)
            .write(
                &at("me/blog", "main", "posts/a.md"),
                "Coffee.",
                "publish: a",
                "t",
                Some("oldsha"),
            )
            .unwrap();

        assert_eq!(commit, "deadbeef");
        let request = seen(&rx);
        assert_eq!(request.method, "PUT");
        let sent: serde_json::Value = serde_json::from_str(&request.body).expect("json");
        assert_eq!(sent["content"], B64.encode("Coffee."));
        assert_eq!(sent["sha"], "oldsha");
        assert_eq!(sent["branch"], "main");
    }

    #[test]
    fn a_first_write_sends_no_sha_at_all() {
        // A sha of the empty string would be an update of a file that is not
        // there, which GitHub refuses; absent is the difference.
        let (base, rx) = stub(200, r#"{"commit":{"sha":"deadbeef"}}"#);

        Api::at(&base)
            .write(
                &at("me/blog", "main", "posts/a.md"),
                "Coffee.",
                "m",
                "t",
                None,
            )
            .unwrap();

        let sent: serde_json::Value = serde_json::from_str(&seen(&rx).body).expect("json");
        assert!(sent.get("sha").is_none());
    }

    #[test]
    fn a_listing_keeps_the_markdown_files_and_nothing_else() {
        let (base, _rx) = stub(
            200,
            r#"[{"type":"file","name":"a.md","path":"p/a.md","sha":"1"},
                {"type":"file","name":"image.png","path":"p/image.png","sha":"2"},
                {"type":"dir","name":"nested.md","path":"p/nested.md","sha":"3"}]"#,
        );

        let files = Api::at(&base)
            .list_directory(&at("me/blog", "main", "p/"), "t")
            .unwrap();

        assert_eq!(
            files,
            [RemoteFile {
                name: "a.md".into(),
                path: "p/a.md".into(),
                sha: "1".into()
            }]
        );
    }

    #[test]
    fn a_content_path_that_is_a_file_says_so_rather_than_reading_as_empty() {
        let (base, _rx) = stub(200, r#"{"type":"file","name":"a.md"}"#);

        let failed = Api::at(&base)
            .list_directory(&at("me/blog", "main", "p/"), "t")
            .unwrap_err();

        assert_eq!(failed.message, "That content path is a file, not a folder");
    }

    #[test]
    fn a_directory_that_does_not_exist_is_simply_empty() {
        let (base, _rx) = stub(404, r#"{"message":"Not Found"}"#);

        assert_eq!(
            Api::at(&base).list_directory(&at("me/blog", "main", "p/"), "t"),
            Ok(Vec::new())
        );
    }

    #[test]
    fn reading_a_file_asks_for_it_raw() {
        // Raw, so what comes back is the file rather than a JSON wrapper with
        // a base64 of it inside.
        let (base, rx) = stub(200, "Coffee. Empty streets.");

        let text = Api::at(&base)
            .read_content(&at("me/blog", "main", "posts/a.md"), "t")
            .unwrap();

        assert_eq!(text, "Coffee. Empty streets.");
        assert_eq!(
            seen(&rx).header("Accept"),
            Some("application/vnd.github.raw+json")
        );
    }

    #[test]
    fn deleting_something_already_gone_is_the_state_we_wanted() {
        let (base, _rx) = stub(404, r#"{"message":"Not Found"}"#);

        assert_eq!(
            Api::at(&base).delete(&at("me/blog", "main", "p/a.md"), "sha", "m", "t"),
            Ok(())
        );
    }

    #[test]
    fn a_delete_carries_a_body_even_though_the_method_says_it_should_not() {
        // Which is why this goes through http::Request rather than ureq's own
        // builders, whose types refuse a body on a DELETE.
        let (base, rx) = stub(200, r#"{}"#);

        Api::at(&base)
            .delete(
                &at("me/blog", "main", "p/a.md"),
                "thesha",
                "unpublish: a",
                "t",
            )
            .unwrap();

        let request = seen(&rx);
        assert_eq!(request.method, "DELETE");
        let sent: serde_json::Value = serde_json::from_str(&request.body).expect("json");
        assert_eq!(sent["sha"], "thesha");
        assert_eq!(sent["message"], "unpublish: a");
    }

    #[test]
    fn a_request_that_never_arrives_says_so_rather_than_blaming_github() {
        // Nothing listening: a status of 0 means it never reached GitHub,
        // which is a different thing from GitHub refusing it.
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let failed = Api::at(&format!("http://127.0.0.1:{port}"))
            .read_sha(&at("me/blog", "main", "a.md"), "t")
            .unwrap_err();

        assert_eq!(failed.status, 0);
    }
}
