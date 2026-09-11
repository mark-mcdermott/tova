/*!
Bringing one blog's posts down — a port of `src/main/publish/sync.ts`.

Deliberately one-directional: a post changed here is reported rather than
pushed, because publishing is something the writer does with the rocket when
the post is ready, not something a background sync decides for them. Conflicts
are left alone with both copies intact.

Every function here takes its GitHub client as an argument. That is what lets
the whole of this be tested without a network, and it is the same seam the
TypeScript gets by mocking the module.
*/

use serde::Serialize;
use std::path::Path;

use crate::blog_post::{apply_edit, from_yaml, parse_posts, published_field_edit};
use crate::blogs::{blog_secret, Blog};
use crate::github::{Contents, Target};
use crate::notes::{self, CreateNoteInput};
use crate::publish_state::{
    hash_content, save_sync_state, sync_state_for, BlogSyncState, PostState,
};
use crate::sync_plan::{plan_sync, LocalPost, RemotePost, SyncAction};
use crate::vault::directory_of;
use crate::vault_file::read_vault_text;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub blog_id: String,
    pub imported: usize,
    pub updated: usize,
    pub unchanged: usize,
    /// Changed here since the last sync; the rocket sends these, not the sync.
    pub awaiting_publish: Vec<String>,
    pub conflicts: Vec<String>,
    pub removed_remotely: Vec<String>,
    pub synced_at: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConflictVersions {
    pub local: String,
    pub remote: String,
}

fn note_id(blog: &Blog, filename: &str) -> String {
    format!("posts/{}/{filename}", blog.name)
}

fn local_path(blog: &Blog, filename: &str) -> Result<std::path::PathBuf, String> {
    Ok(directory_of("posts", Some(&blog.name))?.join(filename))
}

fn remote_path(blog: &Blog, filename: &str) -> String {
    format!("{}{filename}", blog.github.content_path)
}

fn target<'a>(blog: &'a Blog, path: &'a str) -> Target<'a> {
    Target {
        repo: &blog.github.repo,
        branch: &blog.github.branch,
        path,
    }
}

fn token_for(data_dir: &Path, blog: &Blog) -> Result<String, String> {
    blog_secret(data_dir, &blog.id, "github")
        .ok_or_else(|| format!("{} has no GitHub token saved", blog.name))
}

fn local_posts(blog: &Blog) -> Vec<LocalPost> {
    let Ok(directory) = directory_of("posts", Some(&blog.name)) else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(&directory) else {
        return Vec::new();
    };

    entries
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".md"))
        .filter_map(|filename| {
            let content = read_vault_text(&directory.join(&filename)).ok()?;
            Some(LocalPost {
                hash: hash_content(&content),
                filename,
            })
        })
        .collect()
}

/// The title an imported post should carry, taken from its own front matter.
fn title_of(body: &str, filename: &str) -> String {
    let title = parse_posts(body)
        .first()
        .and_then(|post| crate::blog_post::field_value(post, "title").map(str::to_string));

    match title {
        Some(title) if !crate::js::trim(&title).is_empty() => title,
        _ => filename.trim_end_matches(".md").to_string(),
    }
}

fn write_local(blog: &Blog, filename: &str, raw: &str, exists: bool) -> Result<(), String> {
    let imported = from_yaml(raw, &blog.name);

    /*
     * An imported post is already on the blog, under this exact filename.
     * Recording that is what makes a later republish update it rather than
     * create a second file under a name computed from the title.
     */
    let body = match parse_posts(&imported).first() {
        None => imported.clone(),
        Some(post) => apply_edit(&imported, &published_field_edit(&imported, post, filename)),
    };

    let title = title_of(&body, filename);

    if exists {
        notes::write(&note_id(blog, filename), &title, &body)?;
        return Ok(());
    }

    notes::create(CreateNoteInput {
        section: "posts".to_string(),
        folder: Some(blog.name.clone()),
        title: Some(title),
        body: Some(body),
        filename: Some(filename.to_string()),
    })?;
    Ok(())
}

pub fn sync_blog(
    api: &impl Contents,
    data_dir: &Path,
    blog: &Blog,
    now_ms: f64,
) -> Result<SyncResult, String> {
    let token = token_for(data_dir, blog)?;

    let files = api
        .list_directory(&target(blog, &blog.github.content_path), &token)
        .map_err(|e| e.message)?;

    let remote: Vec<RemotePost> = files
        .iter()
        .map(|file| RemotePost {
            filename: file.name.clone(),
            sha: file.sha.clone(),
        })
        .collect();
    let local = local_posts(blog);
    let state = sync_state_for(data_dir, &blog.id);
    let plan = plan_sync(&remote, &local, &state.posts);

    let mut result = SyncResult {
        blog_id: blog.id.clone(),
        synced_at: now_ms,
        ..Default::default()
    };
    let mut posts = state.posts.clone();

    for step in plan {
        match step.action {
            SyncAction::Conflict => {
                result.conflicts.push(step.filename);
                continue;
            }
            SyncAction::PublishLocal => {
                result.awaiting_publish.push(step.filename);
                continue;
            }
            SyncAction::RemovedRemotely => {
                posts.remove(&step.filename);
                result.removed_remotely.push(step.filename);
                continue;
            }
            SyncAction::Unchanged => {
                result.unchanged += 1;
                continue;
            }
            SyncAction::Import | SyncAction::Update => {}
        }

        let Some(file) = files.iter().find(|entry| entry.name == step.filename) else {
            continue;
        };

        let raw = api
            .read_content(&target(blog, &file.path), &token)
            .map_err(|e| e.message)?;
        write_local(
            blog,
            &step.filename,
            &raw,
            step.action == SyncAction::Update,
        )?;

        // Hashed from what actually landed on disk — Tova adds its own front
        // matter on the way in, so the fetched text is not what the next sync
        // will see.
        posts.insert(
            step.filename.clone(),
            PostState {
                remote_sha: file.sha.clone(),
                local_hash: hash_content(&read_vault_text(&local_path(blog, &step.filename)?)?),
            },
        );

        if step.action == SyncAction::Import {
            result.imported += 1;
        } else {
            result.updated += 1;
        }
    }

    save_sync_state(
        data_dir,
        &blog.id,
        &BlogSyncState {
            last_synced_at: result.synced_at,
            posts,
        },
    )?;
    Ok(result)
}

fn remote_sha_for(
    api: &impl Contents,
    blog: &Blog,
    filename: &str,
    token: &str,
) -> Result<Option<String>, String> {
    api.read_sha(&target(blog, &remote_path(blog, filename)), token)
        .map_err(|e| e.message)
}

/// Both sides of a conflict, so the writer can see what they are choosing
/// between.
pub fn conflict_versions(
    api: &impl Contents,
    data_dir: &Path,
    blog: &Blog,
    filename: &str,
) -> Result<ConflictVersions, String> {
    let token = token_for(data_dir, blog)?;
    let remote = api
        .read_content(&target(blog, &remote_path(blog, filename)), &token)
        .map_err(|e| e.message)?;

    Ok(ConflictVersions {
        local: read_vault_text(&local_path(blog, filename)?)?,
        remote,
    })
}

fn record_synced(
    data_dir: &Path,
    blog: &Blog,
    filename: &str,
    remote_sha: Option<String>,
) -> Result<(), String> {
    let state = sync_state_for(data_dir, &blog.id);
    let content = read_vault_text(&local_path(blog, filename)?).ok();

    let (Some(content), Some(remote_sha)) = (content, remote_sha) else {
        return Ok(());
    };

    let mut posts = state.posts;
    posts.insert(
        filename.to_string(),
        PostState {
            remote_sha,
            local_hash: hash_content(&content),
        },
    );
    save_sync_state(
        data_dir,
        &blog.id,
        &BlogSyncState {
            last_synced_at: state.last_synced_at,
            posts,
        },
    )
}

/// Resolve a conflict by taking the blog's copy, overwriting what is here.
pub fn take_remote(
    api: &impl Contents,
    data_dir: &Path,
    blog: &Blog,
    filename: &str,
) -> Result<(), String> {
    let token = token_for(data_dir, blog)?;
    let raw = api
        .read_content(&target(blog, &remote_path(blog, filename)), &token)
        .map_err(|e| e.message)?;

    write_local(blog, filename, &raw, true)?;
    let sha = remote_sha_for(api, blog, filename, &token)?;
    record_synced(data_dir, blog, filename, sha)
}

/// Resolve a conflict by keeping the local copy.
///
/// Nothing is pushed, and the local fingerprint is deliberately left as it
/// was: only the blog's version is marked as seen. The next sync then reports
/// the post as one waiting for the rocket — which is true, because the blog is
/// still carrying the older text — rather than either re-raising the conflict
/// or calling the two reconciled.
pub fn keep_local(
    api: &impl Contents,
    data_dir: &Path,
    blog: &Blog,
    filename: &str,
) -> Result<(), String> {
    let token = token_for(data_dir, blog)?;
    let Some(remote_sha) = remote_sha_for(api, blog, filename, &token)? else {
        return Ok(());
    };

    let state = sync_state_for(data_dir, &blog.id);
    let Some(previous) = state.posts.get(filename).cloned() else {
        return Ok(());
    };

    let mut posts = state.posts;
    posts.insert(
        filename.to_string(),
        PostState {
            remote_sha,
            local_hash: previous.local_hash,
        },
    );
    save_sync_state(
        data_dir,
        &blog.id,
        &BlogSyncState {
            last_synced_at: state.last_synced_at,
            posts,
        },
    )
}

/// Trashes a local post and, when asked, removes the file from the blog too.
/// The two are separate on purpose: deleting a draft locally should not quietly
/// unpublish it.
pub fn delete_post(
    api: &impl Contents,
    data_dir: &Path,
    blog: &Blog,
    filename: &str,
    also_remote: bool,
) -> Result<(), String> {
    if also_remote {
        let token = token_for(data_dir, blog)?;
        let path = remote_path(blog, filename);

        if let Some(sha) = api
            .read_sha(&target(blog, &path), &token)
            .map_err(|e| e.message)?
        {
            api.delete(
                &target(blog, &path),
                &sha,
                &format!("Remove {filename}"),
                &token,
            )
            .map_err(|e| e.message)?;
        }
    }

    notes::trash_note(&note_id(blog, filename))?;

    let state = sync_state_for(data_dir, &blog.id);
    let mut posts = state.posts;
    posts.remove(filename);
    save_sync_state(
        data_dir,
        &blog.id,
        &BlogSyncState {
            last_synced_at: state.last_synced_at,
            posts,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blogs::BlogGithub;
    use crate::github::{GithubError, RemoteFile};
    use crate::safe_storage;
    use crate::vault::{one_at_a_time, set_active_vault};
    use std::cell::RefCell;
    use std::collections::BTreeMap;

    /*
     * A GitHub that is a map, which is what the TypeScript gets by mocking the
     * module. Every call is recorded, so a test can assert on what was asked
     * for as well as on what came back — and `delete` in particular has to be
     * provably not called when nobody asked for it.
     */
    #[derive(Default)]
    struct Fake {
        files: RefCell<BTreeMap<String, (String, String)>>,
        calls: RefCell<Vec<String>>,
        fail: RefCell<Option<GithubError>>,
    }

    impl Fake {
        fn with(files: &[(&str, &str, &str)]) -> Self {
            let fake = Fake::default();
            for (name, sha, content) in files {
                fake.files
                    .borrow_mut()
                    .insert(name.to_string(), (sha.to_string(), content.to_string()));
            }
            fake
        }

        fn called(&self, what: &str) -> bool {
            self.calls.borrow().iter().any(|call| call == what)
        }

        fn note(&self, what: &str) -> Result<(), GithubError> {
            self.calls.borrow_mut().push(what.to_string());
            match self.fail.borrow().clone() {
                Some(error) => Err(error),
                None => Ok(()),
            }
        }

        /// The filename at the end of a content path.
        fn name_of(path: &str) -> String {
            path.rsplit('/').next().unwrap_or(path).to_string()
        }
    }

    impl Contents for Fake {
        fn read_sha(&self, t: &Target, _token: &str) -> Result<Option<String>, GithubError> {
            self.note(&format!("read_sha {}", t.path))?;
            Ok(self
                .files
                .borrow()
                .get(&Fake::name_of(t.path))
                .map(|(sha, _)| sha.clone()))
        }

        fn write(
            &self,
            t: &Target,
            content: &str,
            _message: &str,
            _token: &str,
            _sha: Option<&str>,
        ) -> Result<String, GithubError> {
            self.note(&format!("write {}", t.path))?;
            self.files.borrow_mut().insert(
                Fake::name_of(t.path),
                ("pushed".to_string(), content.to_string()),
            );
            Ok("commit".to_string())
        }

        fn list_directory(&self, t: &Target, _token: &str) -> Result<Vec<RemoteFile>, GithubError> {
            self.note(&format!("list {}", t.path))?;
            Ok(self
                .files
                .borrow()
                .iter()
                .map(|(name, (sha, _))| RemoteFile {
                    name: name.clone(),
                    path: format!("{}{name}", t.path),
                    sha: sha.clone(),
                })
                .collect())
        }

        fn read_content(&self, t: &Target, _token: &str) -> Result<String, GithubError> {
            self.note(&format!("read {}", t.path))?;
            self.files
                .borrow()
                .get(&Fake::name_of(t.path))
                .map(|(_, content)| content.clone())
                .ok_or_else(|| GithubError {
                    message: "Not Found".into(),
                    status: 404,
                })
        }

        fn delete(
            &self,
            t: &Target,
            _sha: &str,
            _message: &str,
            _token: &str,
        ) -> Result<(), GithubError> {
            self.note(&format!("delete {}", t.path))?;
            self.files.borrow_mut().remove(&Fake::name_of(t.path));
            Ok(())
        }
    }

    struct Scratch {
        vault: std::path::PathBuf,
        data: std::path::PathBuf,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str) -> Self {
            let held = one_at_a_time();
            safe_storage::stand_in(Some(b"c2hvcnQtbGl2ZWQtdGVzdA=="));
            let base = std::env::temp_dir().join(format!("tova-sync-{name}"));
            let _ = std::fs::remove_dir_all(&base);
            let (vault, data) = (base.join("vault"), base.join("data"));
            std::fs::create_dir_all(vault.join("posts").join("me.io")).unwrap();
            std::fs::create_dir_all(vault.join("trash")).unwrap();
            std::fs::create_dir_all(&data).unwrap();
            set_active_vault(Some(vault.clone()));

            let scratch = Scratch {
                vault,
                data,
                _held: held,
            };
            crate::blogs::save_blog(&scratch.data, &blog()).unwrap();
            let id = crate::blogs::list_blogs(&scratch.data)[0].blog.id.clone();
            crate::blogs::set_blog_secret(&scratch.data, &id, "github", "ghp_token").unwrap();
            scratch
        }

        fn blog(&self) -> Blog {
            crate::blogs::list_blogs(&self.data)[0].blog.clone()
        }

        fn local(&self, filename: &str, body: &str) {
            std::fs::write(self.vault.join("posts/me.io").join(filename), body).unwrap();
        }

        fn read_local(&self, filename: &str) -> String {
            std::fs::read_to_string(self.vault.join("posts/me.io").join(filename)).unwrap()
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            safe_storage::stand_in(None);
            set_active_vault(None);
            let _ = std::fs::remove_dir_all(self.vault.parent().unwrap());
        }
    }

    fn blog() -> Blog {
        Blog {
            name: "me.io".into(),
            live_post_path: "/posts/".into(),
            github: BlogGithub {
                repo: "me/blog".into(),
                branch: "main".into(),
                content_path: "src/content/posts/".into(),
            },
            ..Default::default()
        }
    }

    const REMOTE: &str = "---\ntitle: Slow Morning\ndate: \"2026-09-03\"\n---\n\nCoffee.\n";

    fn at(ms: f64) -> f64 {
        ms
    }

    #[test]
    fn a_post_on_the_blog_and_not_here_is_imported() {
        let s = Scratch::new("import");
        let api = Fake::with(&[("26-09-03-slow-morning.md", "r1", REMOTE)]);

        let result = sync_blog(&api, &s.data, &s.blog(), at(1000.0)).unwrap();

        assert_eq!(result.imported, 1);
        assert_eq!(result.updated, 0);
        let landed = s.read_local("26-09-03-slow-morning.md");
        assert!(landed.contains("@me.io post"));
        assert!(landed.contains("@title Slow Morning"));
        // And it knows what it went out as, so a republish updates rather than
        // creating a second file under a name computed from the title.
        assert!(landed.contains("@published 26-09-03-slow-morning.md"));
    }

    #[test]
    fn what_the_sync_remembers_is_what_landed_not_what_was_fetched() {
        /*
         * Tova adds its own front matter on the way in, so hashing the fetched
         * text would make the very next sync see a local change that nobody
         * made — and report every imported post as awaiting the rocket.
         */
        let s = Scratch::new("hash");
        let api = Fake::with(&[("26-09-03-slow-morning.md", "r1", REMOTE)]);
        sync_blog(&api, &s.data, &s.blog(), at(1000.0)).unwrap();

        let again = sync_blog(&api, &s.data, &s.blog(), at(2000.0)).unwrap();

        assert_eq!(again.unchanged, 1);
        assert!(again.awaiting_publish.is_empty());
        assert_eq!(again.imported, 0);
    }

    #[test]
    fn a_post_changed_here_is_reported_rather_than_pushed() {
        // One-directional on purpose: publishing is the rocket's job.
        let s = Scratch::new("local");
        let api = Fake::with(&[("26-09-03-slow-morning.md", "r1", REMOTE)]);
        sync_blog(&api, &s.data, &s.blog(), at(1000.0)).unwrap();
        s.local(
            "26-09-03-slow-morning.md",
            "@me.io post\n@title Changed\n\nNew words.\n",
        );

        let result = sync_blog(&api, &s.data, &s.blog(), at(2000.0)).unwrap();

        assert_eq!(result.awaiting_publish, ["26-09-03-slow-morning.md"]);
        assert!(!api.called("write src/content/posts/26-09-03-slow-morning.md"));
    }

    #[test]
    fn a_post_changed_on_the_blog_is_brought_down() {
        let s = Scratch::new("update");
        let api = Fake::with(&[("26-09-03-slow-morning.md", "r1", REMOTE)]);
        sync_blog(&api, &s.data, &s.blog(), at(1000.0)).unwrap();
        api.files.borrow_mut().insert(
            "26-09-03-slow-morning.md".into(),
            (
                "r2".into(),
                "---\ntitle: Slow Morning\n---\n\nRewritten.\n".into(),
            ),
        );

        let result = sync_blog(&api, &s.data, &s.blog(), at(2000.0)).unwrap();

        assert_eq!(result.updated, 1);
        assert!(s
            .read_local("26-09-03-slow-morning.md")
            .contains("Rewritten."));
    }

    #[test]
    fn a_post_changed_on_both_sides_is_a_conflict_and_nothing_is_touched() {
        let s = Scratch::new("conflict");
        let api = Fake::with(&[("26-09-03-slow-morning.md", "r1", REMOTE)]);
        sync_blog(&api, &s.data, &s.blog(), at(1000.0)).unwrap();
        s.local(
            "26-09-03-slow-morning.md",
            "@me.io post\n@title Mine\n\nMy words.\n",
        );
        api.files.borrow_mut().insert(
            "26-09-03-slow-morning.md".into(),
            (
                "r2".into(),
                "---\ntitle: Theirs\n---\n\nTheir words.\n".into(),
            ),
        );

        let result = sync_blog(&api, &s.data, &s.blog(), at(2000.0)).unwrap();

        assert_eq!(result.conflicts, ["26-09-03-slow-morning.md"]);
        // Both copies intact.
        assert!(s
            .read_local("26-09-03-slow-morning.md")
            .contains("My words."));
        assert!(api.files.borrow()["26-09-03-slow-morning.md"]
            .1
            .contains("Their words."));
    }

    #[test]
    fn a_local_draft_that_was_never_published_is_not_a_deletion() {
        // Only counts as removed if Tova had seen it on the blog before.
        let s = Scratch::new("draft");
        let api = Fake::default();
        s.local("a-draft.md", "@me.io post\n@title Draft\n\nWords.\n");

        let result = sync_blog(&api, &s.data, &s.blog(), at(1000.0)).unwrap();

        assert_eq!(result.awaiting_publish, ["a-draft.md"]);
        assert!(result.removed_remotely.is_empty());
    }

    #[test]
    fn a_post_taken_off_the_blog_is_reported_and_forgotten() {
        let s = Scratch::new("removed");
        let api = Fake::with(&[("26-09-03-slow-morning.md", "r1", REMOTE)]);
        sync_blog(&api, &s.data, &s.blog(), at(1000.0)).unwrap();
        api.files.borrow_mut().clear();

        let result = sync_blog(&api, &s.data, &s.blog(), at(2000.0)).unwrap();

        assert_eq!(result.removed_remotely, ["26-09-03-slow-morning.md"]);
        // The local file stays; only the record of having seen it goes.
        assert!(s
            .vault
            .join("posts/me.io/26-09-03-slow-morning.md")
            .is_file());
        assert!(!sync_state_for(&s.data, &s.blog().id)
            .posts
            .contains_key("26-09-03-slow-morning.md"));
    }

    #[test]
    fn a_blog_with_no_token_says_so_rather_than_failing_at_the_request() {
        let s = Scratch::new("notoken");
        let id = s.blog().id;
        crate::blogs::set_blog_secret(&s.data, &id, "github", "").unwrap();

        let failed = sync_blog(&Fake::default(), &s.data, &s.blog(), at(1000.0)).unwrap_err();

        assert_eq!(failed, "me.io has no GitHub token saved");
    }

    #[test]
    fn a_conflict_can_be_read_from_both_sides() {
        let s = Scratch::new("versions");
        let api = Fake::with(&[("a.md", "r1", REMOTE)]);
        s.local("a.md", "@me.io post\n@title Mine\n\nMy words.\n");

        let both = conflict_versions(&api, &s.data, &s.blog(), "a.md").unwrap();

        assert!(both.local.contains("My words."));
        assert!(both.remote.contains("Coffee."));
    }

    #[test]
    fn taking_the_blogs_copy_overwrites_what_is_here_and_settles_it() {
        let s = Scratch::new("takeremote");
        let api = Fake::with(&[("a.md", "r1", REMOTE)]);
        sync_blog(&api, &s.data, &s.blog(), at(1000.0)).unwrap();
        s.local("a.md", "@me.io post\n@title Mine\n\nMy words.\n");
        api.files.borrow_mut().insert(
            "a.md".into(),
            ("r2".into(), "---\ntitle: T\n---\n\nTheirs.\n".into()),
        );

        take_remote(&api, &s.data, &s.blog(), "a.md").unwrap();

        assert!(s.read_local("a.md").contains("Theirs."));
        // And the next sync agrees it is settled.
        assert_eq!(
            sync_blog(&api, &s.data, &s.blog(), at(2000.0))
                .unwrap()
                .unchanged,
            1
        );
    }

    #[test]
    fn keeping_the_local_copy_leaves_it_waiting_for_the_rocket() {
        /*
         * Not "reconciled": the blog is still carrying the older text, so the
         * honest next report is that this post is waiting to be published.
         * Only the blog's version is marked as seen.
         */
        let s = Scratch::new("keeplocal");
        let api = Fake::with(&[("a.md", "r1", REMOTE)]);
        sync_blog(&api, &s.data, &s.blog(), at(1000.0)).unwrap();
        s.local("a.md", "@me.io post\n@title Mine\n\nMy words.\n");
        api.files.borrow_mut().insert(
            "a.md".into(),
            ("r2".into(), "---\ntitle: T\n---\n\nTheirs.\n".into()),
        );

        keep_local(&api, &s.data, &s.blog(), "a.md").unwrap();

        let result = sync_blog(&api, &s.data, &s.blog(), at(2000.0)).unwrap();
        assert_eq!(result.awaiting_publish, ["a.md"]);
        assert!(result.conflicts.is_empty());
        assert!(s.read_local("a.md").contains("My words."));
    }

    #[test]
    fn deleting_a_post_locally_does_not_quietly_unpublish_it() {
        let s = Scratch::new("deletelocal");
        let api = Fake::with(&[("a.md", "r1", REMOTE)]);
        sync_blog(&api, &s.data, &s.blog(), at(1000.0)).unwrap();

        delete_post(&api, &s.data, &s.blog(), "a.md", false).unwrap();

        assert!(!api.called("delete src/content/posts/a.md"));
        assert!(api.files.borrow().contains_key("a.md"));
        // Trashed rather than destroyed.
        assert!(notes::read("trash/a.md").is_ok());
    }

    #[test]
    fn deleting_a_post_everywhere_takes_it_off_the_blog_too() {
        let s = Scratch::new("deleteboth");
        let api = Fake::with(&[("a.md", "r1", REMOTE)]);
        sync_blog(&api, &s.data, &s.blog(), at(1000.0)).unwrap();

        delete_post(&api, &s.data, &s.blog(), "a.md", true).unwrap();

        assert!(api.files.borrow().is_empty());
        assert!(!sync_state_for(&s.data, &s.blog().id)
            .posts
            .contains_key("a.md"));
    }

    #[test]
    fn a_github_failure_stops_the_sync_rather_than_recording_a_half_one() {
        let s = Scratch::new("failure");
        let api = Fake::with(&[("a.md", "r1", REMOTE)]);
        *api.fail.borrow_mut() = Some(GithubError {
            message: "Bad credentials".into(),
            status: 401,
        });

        let failed = sync_blog(&api, &s.data, &s.blog(), at(1000.0)).unwrap_err();

        assert_eq!(failed, "Bad credentials");
        // Nothing written, so the next attempt starts from where it was.
        assert_eq!(sync_state_for(&s.data, &s.blog().id).last_synced_at, 0.0);
    }
}
