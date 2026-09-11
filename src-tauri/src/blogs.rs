/*!
Blogs, and the tokens that reach them — a port of `src/main/blogs.ts` and
`src/shared/blogConfig.ts`.

Blog configuration lives in the app's own data directory, never in the vault.
Xin kept it inside the vault, which put a GitHub token in cleartext in the
reader's Documents folder and swept it into every backup. Here the file holds
only non-secret fields in the clear; tokens are encrypted against the OS
keychain and are never returned to the renderer.
*/

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::js;
use crate::safe_storage;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct BlogGithub {
    pub repo: String,
    pub branch: String,
    pub content_path: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct BlogDeploy {
    pub provider: String,
    pub account_id: String,
    pub project_name: String,
    pub project_id: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Blog {
    pub id: String,
    /// Doubles as the `@handle` in `@handle post`, so it carries no whitespace.
    pub name: String,
    /// Base URL of the live site, used to link a published post.
    pub site_url: String,
    /// URL path posts appear under on the live site, e.g. `/posts/`.
    pub live_post_path: String,
    pub github: BlogGithub,
    pub deploy: BlogDeploy,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlogSummary {
    #[serde(flatten)]
    pub blog: Blog,
    pub has_github_token: bool,
    pub has_deploy_token: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct StoredBlog {
    #[serde(flatten)]
    blog: Blog,
    /// Base64 of keychain ciphertext, keyed by secret name.
    secrets: BTreeMap<String, String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default)]
struct StoredConfig {
    blogs: Vec<StoredBlog>,
}

fn path_to_config(data_dir: &Path) -> PathBuf {
    data_dir.join("blogs.json")
}

fn load(data_dir: &Path) -> StoredConfig {
    // No file yet, or one that cannot be read — either way, no blogs.
    std::fs::read_to_string(path_to_config(data_dir))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn persist(data_dir: &Path, config: &StoredConfig) -> Result<(), String> {
    std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(path_to_config(data_dir), text).map_err(|e| e.to_string())
}

fn to_summary(stored: &StoredBlog) -> BlogSummary {
    BlogSummary {
        blog: stored.blog.clone(),
        has_github_token: stored.secrets.contains_key("github"),
        has_deploy_token: stored.secrets.contains_key("cloudflare")
            || stored.secrets.contains_key("vercel"),
    }
}

pub fn can_store_secrets() -> bool {
    safe_storage::is_available()
}

pub fn list_blogs(data_dir: &Path) -> Vec<BlogSummary> {
    load(data_dir).blogs.iter().map(to_summary).collect()
}

/// Trimmed, with the content path normalised to a trailing slash and no
/// leading one.
pub fn normalize_blog(blog: &Blog) -> Blog {
    let trim = |value: &str| js::trim(value).to_string();
    // Leading slashes off, then exactly one on the end — what the pair of
    // regex replacements on the other side does, quirks included.
    //
    // Two of those are worth naming, because a tidier implementation loses
    // both: an empty path becomes "/" here and so "//" once a live path adds
    // its leading slash, and an interior "a//b" is left exactly as written.
    // Neither is a good answer, and both are the answer the other backend
    // gives — a blog whose paths changed shape under one of them would push
    // posts somewhere else.
    let bounded = |value: &str| {
        format!(
            "{}/",
            js::trim(value)
                .trim_start_matches('/')
                .trim_end_matches('/')
        )
    };

    Blog {
        id: blog.id.clone(),
        name: trim(&blog.name),
        site_url: js::trim(&blog.site_url).trim_end_matches('/').to_string(),
        live_post_path: format!("/{}", bounded(&blog.live_post_path)),
        github: BlogGithub {
            repo: trim(&blog.github.repo),
            branch: trim(&blog.github.branch),
            content_path: bounded(&blog.github.content_path),
        },
        deploy: BlogDeploy {
            provider: blog.deploy.provider.clone(),
            account_id: trim(&blog.deploy.account_id),
            project_name: trim(&blog.deploy.project_name),
            project_id: trim(&blog.deploy.project_id),
        },
    }
}

fn is_repo(value: &str) -> bool {
    // `^[\w.-]+/[\w.-]+$`, and `\w` is ASCII here as it is everywhere else in
    // a JavaScript regex without the `u` flag.
    let ok = |part: &str| {
        !part.is_empty()
            && part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
    };
    let mut parts = value.split('/');
    matches!((parts.next(), parts.next(), parts.next()), (Some(a), Some(b), None) if ok(a) && ok(b))
}

/// One validator for the form and the backend alike, so a blog the form
/// accepted cannot be refused on the way to disk, or the reverse. Returns a
/// message per invalid field; an empty map means valid.
pub fn validate_blog(blog: &Blog, existing: &[BlogSummary]) -> BTreeMap<String, String> {
    let mut errors = BTreeMap::new();
    let name = js::trim(&blog.name);

    if name.is_empty() {
        errors.insert("name".into(), "A blog needs a name".to_string());
    } else if name.chars().any(js::is_whitespace) {
        errors.insert(
            "name".into(),
            "The name is the @handle, so it cannot contain spaces".to_string(),
        );
    } else if existing
        .iter()
        .any(|other| other.blog.id != blog.id && other.blog.name == name)
    {
        errors.insert(
            "name".into(),
            "Another blog already uses that name".to_string(),
        );
    }

    let repo = js::trim(&blog.github.repo);
    if repo.is_empty() {
        errors.insert(
            "repo".into(),
            "Which repository holds the posts?".to_string(),
        );
    } else if !is_repo(repo) {
        errors.insert("repo".into(), "Expected owner/repo".to_string());
    }

    if js::trim(&blog.github.branch).is_empty() {
        errors.insert(
            "branch".into(),
            "Which branch should posts land on?".to_string(),
        );
    }
    if js::trim(&blog.github.content_path).is_empty() {
        errors.insert(
            "contentPath".into(),
            "Where in the repo do posts go?".to_string(),
        );
    }

    if blog.deploy.provider == "cloudflare" {
        if js::trim(&blog.deploy.account_id).is_empty() {
            errors.insert(
                "accountId".into(),
                "Cloudflare needs an account ID".to_string(),
            );
        }
        if js::trim(&blog.deploy.project_name).is_empty() {
            errors.insert(
                "projectName".into(),
                "Cloudflare needs a project name".to_string(),
            );
        }
    }

    if blog.deploy.provider == "vercel" && js::trim(&blog.deploy.project_id).is_empty() {
        errors.insert("projectId".into(), "Vercel needs a project ID".to_string());
    }

    errors
}

pub fn save_blog(data_dir: &Path, blog: &Blog) -> Result<BlogSummary, String> {
    let mut config = load(data_dir);
    let normalized = normalize_blog(blog);

    let existing: Vec<BlogSummary> = config.blogs.iter().map(to_summary).collect();
    if let Some(first) = validate_blog(&normalized, &existing).into_values().next() {
        return Err(first);
    }

    match config.blogs.iter().position(|e| e.blog.id == normalized.id) {
        None => {
            let created = StoredBlog {
                blog: Blog {
                    id: uuid::Uuid::new_v4().to_string(),
                    ..normalized
                },
                secrets: BTreeMap::new(),
            };
            config.blogs.push(created);
            persist(data_dir, &config)?;
            Ok(to_summary(config.blogs.last().expect("just pushed")))
        }
        Some(at) => {
            // Secrets are set through their own call, so an edit never has to
            // resend them.
            config.blogs[at].blog = normalized;
            persist(data_dir, &config)?;
            Ok(to_summary(&config.blogs[at]))
        }
    }
}

pub fn delete_blog(data_dir: &Path, id: &str) -> Result<(), String> {
    let mut config = load(data_dir);
    config.blogs.retain(|blog| blog.blog.id != id);
    persist(data_dir, &config)
}

pub fn set_blog_secret(
    data_dir: &Path,
    id: &str,
    secret: &str,
    value: &str,
) -> Result<BlogSummary, String> {
    let mut config = load(data_dir);
    let Some(at) = config.blogs.iter().position(|e| e.blog.id == id) else {
        return Err("That blog no longer exists".into());
    };

    if value.is_empty() {
        config.blogs[at].secrets.remove(secret);
    } else {
        let Some(wrapped) = safe_storage::encrypt_string(value) else {
            return Err(
                "This machine has no keychain available, so a token cannot be stored safely".into(),
            );
        };
        config.blogs[at]
            .secrets
            .insert(secret.to_string(), B64.encode(wrapped));
    }

    persist(data_dir, &config)?;
    Ok(to_summary(&config.blogs[at]))
}

/*
 * Backend only, and deliberately not on the IPC surface: a token is read here
 * to make a request, and never travels back to the renderer.
 */
pub fn blog_secret(data_dir: &Path, id: &str, secret: &str) -> Option<String> {
    let stored = load(data_dir)
        .blogs
        .into_iter()
        .find(|blog| blog.blog.id == id)?
        .secrets
        .remove(secret)?;

    // A keychain that changed underneath us — treated as no token rather than
    // taking the app down on a read.
    safe_storage::decrypt_string(&B64.decode(stored).ok()?)
}

/// The posts a blog has in the vault. `posts/<name>/` is the blog's folder,
/// which is why a blog's name cannot carry whitespace or be shared.
fn local_posts(blog: &Blog) -> Vec<String> {
    let Ok(directory) = crate::vault::directory_of("posts", Some(&blog.name)) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(&directory) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".md"))
        .collect()
}

pub fn post_count(data_dir: &Path, id: &str) -> Result<usize, String> {
    Ok(local_posts(&require_blog(data_dir, id)?).len())
}

fn require_blog(data_dir: &Path, id: &str) -> Result<Blog, String> {
    load(data_dir)
        .blogs
        .into_iter()
        .find(|blog| blog.blog.id == id)
        .map(|stored| stored.blog)
        .ok_or_else(|| "That blog no longer exists".to_string())
}

/// Removes a blog, and optionally the posts it brought in.
///
/// Trash rather than delete for the posts: removing a blog's configuration
/// should not be able to destroy writing outright.
pub fn remove_blog(data_dir: &Path, id: &str, trash_posts: bool) -> Result<(), String> {
    // Read before the configuration goes, since finding the posts needs it.
    if trash_posts {
        let blog = require_blog(data_dir, id)?;
        for filename in local_posts(&blog) {
            let _ = crate::notes::trash_note(&format!("posts/{}/{filename}", blog.name));
        }
    }
    delete_blog(data_dir, id)
}

/// Where a published post can be read, or nothing when the site URL is unknown.
pub fn post_url(blog: &Blog, slug: &str) -> Option<String> {
    (!blog.site_url.is_empty()).then(|| format!("{}{}{slug}", blog.site_url, blog.live_post_path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value as Json;

    fn fixture() -> Json {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../conformance/blogs.json");
        serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("json")
    }

    fn blog_from(value: &Json) -> Blog {
        serde_json::from_value(value.clone()).expect("a blog")
    }

    #[test]
    fn normalises_a_blog_the_same_way() {
        for case in fixture()["normalize"].as_array().expect("normalize") {
            let normalized = normalize_blog(&blog_from(&case["blog"]));

            assert_eq!(
                serde_json::to_value(&normalized).unwrap(),
                case["normalized"],
                "for {}",
                case["blog"]
            );
        }
    }

    #[test]
    fn refuses_the_same_blogs_for_the_same_reasons() {
        let existing = [BlogSummary {
            blog: Blog {
                id: "other".into(),
                name: "taken".into(),
                ..Default::default()
            },
            has_github_token: false,
            has_deploy_token: false,
        }];

        for case in fixture()["validate"].as_array().expect("validate") {
            let errors = validate_blog(&blog_from(&case["blog"]), &existing);

            assert_eq!(
                serde_json::to_value(&errors).unwrap(),
                case["errors"],
                "for {}",
                case["blog"]
            );
        }
    }

    #[test]
    fn builds_the_same_link_to_a_published_post() {
        for case in fixture()["postUrl"].as_array().expect("postUrl") {
            let blog = Blog {
                site_url: case["siteUrl"].as_str().unwrap_or_default().to_string(),
                live_post_path: case["livePostPath"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string(),
                ..Default::default()
            };

            assert_eq!(
                post_url(&blog, case["slug"].as_str().unwrap_or_default()),
                case["url"].as_str().map(str::to_string)
            );
        }
    }

    /* The stored side, which is about a token never being written in the clear. */

    /*
     * The keychain stand-in is global, so these run one at a time under the
     * same lock everything that touches global state holds. Found the hard
     * way: two of them set it to different things and raced.
     */
    struct Scratch {
        data: PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = crate::vault::one_at_a_time();
            safe_storage::stand_in(None);
            let data = std::env::temp_dir().join(format!("tova-blogs-{name}"));
            let _ = std::fs::remove_dir_all(&data);
            std::fs::create_dir_all(&data).unwrap();
            Self { data, _held: held }
        }

        fn with_keychain(&self) {
            safe_storage::stand_in(Some(b"c2hvcnQtbGl2ZWQtdGVzdA=="));
        }

        fn saved(&self, name: &str) -> BlogSummary {
            save_blog(
                &self.data,
                &Blog {
                    name: name.into(),
                    live_post_path: "/posts/".into(),
                    github: BlogGithub {
                        repo: "owner/repo".into(),
                        branch: "main".into(),
                        content_path: "posts/".into(),
                    },
                    ..Default::default()
                },
            )
            .unwrap()
        }

        fn raw(&self) -> String {
            std::fs::read_to_string(self.data.join("blogs.json")).unwrap()
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            safe_storage::stand_in(None);
            let _ = std::fs::remove_dir_all(&self.data);
        }
    }

    #[test]
    fn a_saved_blog_gets_an_id_and_comes_back_in_the_list() {
        let s = Scratch::new("save");

        let saved = s.saved("notes");

        assert!(!saved.blog.id.is_empty());
        assert_eq!(list_blogs(&s.data).len(), 1);
        assert!(!saved.has_github_token);
    }

    #[test]
    fn saving_the_same_blog_again_edits_it_rather_than_adding_one() {
        let s = Scratch::new("edit");
        let first = s.saved("notes");

        let edited = save_blog(
            &s.data,
            &Blog {
                name: "renamed".into(),
                ..first.blog.clone()
            },
        )
        .unwrap();

        assert_eq!(edited.blog.id, first.blog.id);
        assert_eq!(list_blogs(&s.data).len(), 1);
        assert_eq!(list_blogs(&s.data)[0].blog.name, "renamed");
    }

    #[test]
    fn a_blog_the_form_would_refuse_is_refused_here_too() {
        // One validator for both sides, so a blog the form accepted cannot be
        // refused on the way to disk, or the reverse.
        let s = Scratch::new("invalid");

        assert!(save_blog(&s.data, &Blog::default()).is_err());
        assert!(list_blogs(&s.data).is_empty());
    }

    #[test]
    fn two_blogs_cannot_share_a_name() {
        let s = Scratch::new("dupe");
        s.saved("notes");

        assert!(save_blog(
            &s.data,
            &Blog {
                name: "notes".into(),
                github: BlogGithub {
                    repo: "other/repo".into(),
                    branch: "main".into(),
                    content_path: "p/".into(),
                },
                ..Default::default()
            },
        )
        .is_err());
    }

    #[test]
    fn a_token_is_never_written_in_the_clear() {
        /*
         * The whole point of this file living beside the app rather than in
         * the vault. Xin put a GitHub token in cleartext in Documents and
         * swept it into every backup.
         */
        let s = Scratch::new("secret");
        let saved = s.saved("notes");
        s.with_keychain();

        let after = set_blog_secret(&s.data, &saved.blog.id, "github", "ghp_hunter2").unwrap();

        assert!(after.has_github_token);
        assert!(!s.raw().contains("ghp_hunter2"));
        // And it reads back, for the request it exists to make.
        assert_eq!(
            blog_secret(&s.data, &saved.blog.id, "github").as_deref(),
            Some("ghp_hunter2")
        );
    }

    #[test]
    fn a_token_is_refused_outright_when_there_is_nowhere_safe_to_put_it() {
        // Better to say so than to write it somewhere it can be read.
        let s = Scratch::new("nokeychain");
        let saved = s.saved("notes");

        assert!(set_blog_secret(&s.data, &saved.blog.id, "github", "ghp_hunter2").is_err());
        assert!(!s.raw().contains("ghp_hunter2"));
    }

    #[test]
    fn clearing_a_token_takes_it_out_of_the_file() {
        let s = Scratch::new("clear");
        let saved = s.saved("notes");
        s.with_keychain();
        set_blog_secret(&s.data, &saved.blog.id, "github", "ghp_hunter2").unwrap();

        let after = set_blog_secret(&s.data, &saved.blog.id, "github", "").unwrap();

        assert!(!after.has_github_token);
        assert_eq!(blog_secret(&s.data, &saved.blog.id, "github"), None);
    }

    #[test]
    fn editing_a_blog_keeps_the_tokens_it_already_had() {
        // Secrets are set through their own call, so an edit never has to
        // resend them — and must not drop them for not having done so.
        let s = Scratch::new("keep");
        let saved = s.saved("notes");
        s.with_keychain();
        set_blog_secret(&s.data, &saved.blog.id, "github", "ghp_hunter2").unwrap();

        let edited = save_blog(
            &s.data,
            &Blog {
                name: "renamed".into(),
                ..saved.blog.clone()
            },
        )
        .unwrap();

        assert!(edited.has_github_token);
    }

    #[test]
    fn deleting_a_blog_takes_its_tokens_with_it() {
        let s = Scratch::new("delete");
        let saved = s.saved("notes");
        s.with_keychain();
        set_blog_secret(&s.data, &saved.blog.id, "github", "ghp_hunter2").unwrap();

        delete_blog(&s.data, &saved.blog.id).unwrap();

        assert!(list_blogs(&s.data).is_empty());
        assert!(!s.raw().contains("ghp_hunter2"));
        assert_eq!(blog_secret(&s.data, &saved.blog.id, "github"), None);
    }
}
