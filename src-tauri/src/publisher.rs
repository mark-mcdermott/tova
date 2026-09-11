/*!
One publish, start to finish — a port of `src/main/publish/publisher.ts`.

Work out the file, push it, clean up after a rename, then follow the deploy
until it settles. Progress is reported as it goes rather than returned at the
end, so the toast can move.

The clock and the sleep are arguments rather than calls, for the same reason
the two API clients are: a loop that polls every three seconds for up to
fifteen minutes is exactly the kind of thing worth being able to run instantly
in a test.
*/

use serde::{Deserialize, Serialize};

use crate::blog_post::{parse_posts, post_filename, post_slug, published_as, to_yaml};
use crate::blogs::{blog_secret, post_url, Blog};
use crate::deploys::{DeployState, Deploys};
use crate::github::{Contents, Target};
use crate::publish_state::{average_for, is_overdue, publish_progress, remember};

const POLL_INTERVAL_MS: f64 = 3_000.0;
/// Long enough for a slow build, short enough that a stuck one stops
/// pretending.
const GIVE_UP_MS: f64 = 15.0 * 60.0 * 1000.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishRequest {
    pub note_id: String,
    pub blog: String,
    pub header_line: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishUpdate {
    pub id: String,
    pub request: PublishRequest,
    pub phase: String,
    pub progress: i64,
    pub message: String,
    pub filename: String,
    pub url: Option<String>,
    pub error: Option<String>,
}

/// Everything the publish needs from outside itself, so a test can supply all
/// of it and a real run can supply none of it by hand.
pub struct World<'a, C: Contents, D: Deploys> {
    pub contents: &'a C,
    pub deploys: &'a D,
    pub data_dir: &'a std::path::Path,
    pub today: chrono::NaiveDate,
    /// Milliseconds since the epoch. A closure so a test can make time pass.
    pub now: &'a dyn Fn() -> f64,
    pub sleep: &'a dyn Fn(f64),
}

struct Publishing<'a> {
    id: String,
    request: &'a PublishRequest,
    started_at: f64,
    filename: String,
}

impl Publishing<'_> {
    fn update(&self, phase: &str, message: &str, progress: i64) -> PublishUpdate {
        PublishUpdate {
            id: self.id.clone(),
            request: self.request.clone(),
            phase: phase.to_string(),
            progress,
            message: message.to_string(),
            filename: self.filename.clone(),
            url: None,
            error: None,
        }
    }
}

fn target<'a>(blog: &'a Blog, path: &'a str) -> Target<'a> {
    Target {
        repo: &blog.github.repo,
        branch: &blog.github.branch,
        path,
    }
}

/// The publish itself, with every failure turned into the one update the
/// renderer shows. The caller reports each update as it arrives.
pub fn publish<C: Contents, D: Deploys>(
    world: &World<C, D>,
    request: &PublishRequest,
    report: &mut dyn FnMut(&PublishUpdate),
) -> PublishUpdate {
    let mut run = Publishing {
        id: uuid::Uuid::new_v4().to_string(),
        request,
        started_at: (world.now)(),
        filename: String::new(),
    };

    match attempt(world, &mut run, report) {
        Ok(done) => done,
        Err(error) => {
            let mut failed = run.update("failed", "Publish failed", 15);
            failed.error = Some(error);
            report(&failed);
            failed
        }
    }
}

fn attempt<C: Contents, D: Deploys>(
    world: &World<C, D>,
    run: &mut Publishing,
    report: &mut dyn FnMut(&PublishUpdate),
) -> Result<PublishUpdate, String> {
    let elapsed = |run: &Publishing| (world.now)() - run.started_at;

    let preparing = run.update(
        "preparing",
        "Reading the post…",
        publish_progress("preparing", elapsed(run), None),
    );
    report(&preparing);

    let blog = crate::blogs::list_blogs(world.data_dir)
        .into_iter()
        .find(|entry| entry.blog.name == run.request.blog)
        .map(|entry| entry.blog)
        .ok_or_else(|| format!("No blog named {} is configured", run.request.blog))?;

    let token = blog_secret(world.data_dir, &blog.id, "github")
        .ok_or_else(|| format!("{} has no GitHub token saved", blog.name))?;

    let note = crate::notes::read(&run.request.note_id)?;
    let posts = parse_posts(&note.body);
    let post = posts
        .iter()
        .find(|entry| entry.header_line == run.request.header_line)
        .ok_or_else(|| "That post is no longer in the note".to_string())?;

    run.filename = post_filename(post, &world.today);
    let path = format!("{}{}", blog.github.content_path, run.filename);
    let previous = published_as(post);

    let pushing = run.update(
        "pushing",
        &format!("Pushing {}…", run.filename),
        publish_progress("pushing", elapsed(run), None),
    );
    report(&pushing);

    let existing = world
        .contents
        .read_sha(&target(&blog, &path), &token)
        .map_err(|e| e.message)?;
    let commit = world
        .contents
        .write(
            &target(&blog, &path),
            &to_yaml(post, &world.today),
            &format!(
                "{} {}",
                if existing.is_none() { "Add" } else { "Update" },
                run.filename
            ),
            &token,
            existing.as_deref(),
        )
        .map_err(|e| e.message)?;

    // A renamed post would otherwise leave its old file behind on the blog.
    if let Some(previous) = previous.filter(|name| *name != run.filename) {
        let stale_path = format!("{}{previous}", blog.github.content_path);
        if let Some(sha) = world
            .contents
            .read_sha(&target(&blog, &stale_path), &token)
            .map_err(|e| e.message)?
        {
            world
                .contents
                .delete(
                    &target(&blog, &stale_path),
                    &sha,
                    &format!("Remove {previous}, renamed to {}", run.filename),
                    &token,
                )
                .map_err(|e| e.message)?;
        }
    }

    // Known as soon as the push lands, whether or not a build is followed.
    let url = post_url(&blog, &post_slug(post));

    let finish = |message: String, url: Option<String>| {
        let mut done = run.update("published", &message, 100);
        done.url = url;
        done
    };

    if blog.deploy.provider == "none" || blog.deploy.provider.is_empty() {
        let done = finish(format!("Pushed {}", run.filename), url);
        report(&done);
        return Ok(done);
    }

    let Some(deploy_token) = blog_secret(world.data_dir, &blog.id, &blog.deploy.provider) else {
        // The push is the part that matters; following the build is a courtesy.
        let done = finish(
            format!(
                "Pushed {} — no deploy token to follow the build",
                run.filename
            ),
            url,
        );
        report(&done);
        return Ok(done);
    };

    let average = average_for(world.data_dir, &blog.id);

    loop {
        let waited = elapsed(run);
        if waited > GIVE_UP_MS {
            return Err(
                "The deploy is still running after 15 minutes; check the blog's dashboard".into(),
            );
        }

        let status = world.deploys.status(&blog.deploy, &commit, &deploy_token)?;

        match status.state {
            DeployState::Failed => {
                return Err(match status.detail {
                    None => "The deploy failed".to_string(),
                    Some(detail) => format!("Deploy {detail}"),
                })
            }
            DeployState::Succeeded => {
                remember(world.data_dir, &blog.id, elapsed(run))?;
                let done = finish(format!("Published {}", run.filename), url.or(status.url));
                report(&done);
                return Ok(done);
            }
            DeployState::Pending | DeployState::Building => {}
        }

        let mut building = run.update(
            "building",
            if is_overdue(waited, average) {
                "Still building — longer than this blog usually takes"
            } else {
                "Building…"
            },
            publish_progress("building", waited, average),
        );
        building.url = None;
        report(&building);

        (world.sleep)(POLL_INTERVAL_MS);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blogs::{BlogDeploy, BlogGithub};
    use crate::deploys::DeployStatus;
    use crate::github::{GithubError, RemoteFile};
    use crate::safe_storage;
    use crate::vault::{one_at_a_time, set_active_vault};
    use std::cell::{Cell, RefCell};
    use std::collections::BTreeMap;

    #[derive(Default)]
    struct FakeGithub {
        files: RefCell<BTreeMap<String, String>>,
        calls: RefCell<Vec<String>>,
    }

    impl FakeGithub {
        fn called(&self, what: &str) -> bool {
            self.calls.borrow().iter().any(|call| call == what)
        }
    }

    impl Contents for FakeGithub {
        fn read_sha(&self, t: &Target, _token: &str) -> Result<Option<String>, GithubError> {
            Ok(self.files.borrow().get(t.path).map(|_| "sha".to_string()))
        }

        fn write(
            &self,
            t: &Target,
            content: &str,
            message: &str,
            _token: &str,
            _sha: Option<&str>,
        ) -> Result<String, GithubError> {
            self.calls
                .borrow_mut()
                .push(format!("write {} :: {message}", t.path));
            self.files
                .borrow_mut()
                .insert(t.path.to_string(), content.to_string());
            Ok("commit-sha".to_string())
        }

        fn list_directory(
            &self,
            _t: &Target,
            _token: &str,
        ) -> Result<Vec<RemoteFile>, GithubError> {
            Ok(Vec::new())
        }

        fn read_content(&self, _t: &Target, _token: &str) -> Result<String, GithubError> {
            Ok(String::new())
        }

        fn delete(
            &self,
            t: &Target,
            _sha: &str,
            message: &str,
            _token: &str,
        ) -> Result<(), GithubError> {
            self.calls
                .borrow_mut()
                .push(format!("delete {} :: {message}", t.path));
            self.files.borrow_mut().remove(t.path);
            Ok(())
        }
    }

    /// A deploy that reports `building` a set number of times and then settles.
    struct FakeDeploys {
        building_for: Cell<usize>,
        then: DeployState,
        asked: Cell<usize>,
    }

    impl FakeDeploys {
        fn settling_after(polls: usize, then: DeployState) -> Self {
            FakeDeploys {
                building_for: Cell::new(polls),
                then,
                asked: Cell::new(0),
            }
        }
    }

    impl Deploys for FakeDeploys {
        fn status(
            &self,
            _deploy: &BlogDeploy,
            _commit: &str,
            _token: &str,
        ) -> Result<DeployStatus, String> {
            self.asked.set(self.asked.get() + 1);
            let left = self.building_for.get();
            if left > 0 {
                self.building_for.set(left - 1);
                return Ok(DeployStatus {
                    state: DeployState::Building,
                    url: None,
                    detail: Some("build".into()),
                });
            }
            Ok(DeployStatus {
                state: self.then,
                url: Some("https://deployed.example".into()),
                detail: Some("deploy".into()),
            })
        }
    }

    struct Scratch {
        vault: std::path::PathBuf,
        data: std::path::PathBuf,
        clock: std::rc::Rc<Cell<f64>>,
        _held: std::sync::MutexGuard<'static, ()>,
    }

    impl Scratch {
        fn new(name: &str, provider: &str) -> Self {
            let held = one_at_a_time();
            safe_storage::stand_in(Some(b"c2hvcnQtbGl2ZWQtdGVzdA=="));
            let base = std::env::temp_dir().join(format!("tova-publisher-{name}"));
            let _ = std::fs::remove_dir_all(&base);
            let (vault, data) = (base.join("vault"), base.join("data"));
            std::fs::create_dir_all(vault.join("notes")).unwrap();
            std::fs::create_dir_all(&data).unwrap();
            set_active_vault(Some(vault.clone()));

            let s = Scratch {
                vault,
                data,
                clock: std::rc::Rc::new(Cell::new(1_000.0)),
                _held: held,
            };

            crate::blogs::save_blog(
                &s.data,
                &Blog {
                    name: "me.io".into(),
                    site_url: "https://me.io".into(),
                    live_post_path: "/posts/".into(),
                    github: BlogGithub {
                        repo: "me/blog".into(),
                        branch: "main".into(),
                        content_path: "src/content/posts/".into(),
                    },
                    deploy: BlogDeploy {
                        provider: provider.to_string(),
                        account_id: "acct".into(),
                        project_name: "proj".into(),
                        project_id: "prj".into(),
                    },
                    ..Default::default()
                },
            )
            .unwrap();
            let id = crate::blogs::list_blogs(&s.data)[0].blog.id.clone();
            crate::blogs::set_blog_secret(&s.data, &id, "github", "ghp_token").unwrap();
            if provider != "none" {
                crate::blogs::set_blog_secret(&s.data, &id, provider, "deploy_token").unwrap();
            }
            s
        }

        fn note(&self, body: &str) -> String {
            crate::notes::create(crate::notes::CreateNoteInput {
                section: "notes".into(),
                title: Some("A Note".into()),
                body: Some(body.to_string()),
                ..Default::default()
            })
            .unwrap()
            .summary
            .id
        }

        fn blog_id(&self) -> String {
            crate::blogs::list_blogs(&self.data)[0].blog.id.clone()
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            safe_storage::stand_in(None);
            set_active_vault(None);
            let _ = std::fs::remove_dir_all(self.vault.parent().unwrap());
        }
    }

    const POST: &str = "@me.io post\n@title Slow Morning\n@date 26-09-03\n\nCoffee.\n";

    fn run<C: Contents, D: Deploys>(
        s: &Scratch,
        contents: &C,
        deploys: &D,
        note_id: &str,
    ) -> (PublishUpdate, Vec<PublishUpdate>) {
        let clock = s.clock.clone();
        let now = move || clock.get();
        let ticking = s.clock.clone();
        let sleep = move |ms: f64| ticking.set(ticking.get() + ms);

        let world = World {
            contents,
            deploys,
            data_dir: &s.data,
            today: chrono::NaiveDate::from_ymd_opt(2026, 9, 11).unwrap(),
            now: &now,
            sleep: &sleep,
        };

        let mut seen = Vec::new();
        let done = publish(
            &world,
            &PublishRequest {
                note_id: note_id.to_string(),
                blog: "me.io".into(),
                header_line: 0,
            },
            &mut |update| seen.push(update.clone()),
        );
        (done, seen)
    }

    #[test]
    fn a_push_with_no_deploy_provider_is_the_whole_of_it() {
        let s = Scratch::new("nodeploy", "none");
        let note = s.note(POST);
        let github = FakeGithub::default();
        let deploys = FakeDeploys::settling_after(0, DeployState::Succeeded);

        let (done, seen) = run(&s, &github, &deploys, &note);

        assert_eq!(done.phase, "published");
        assert_eq!(done.progress, 100);
        assert_eq!(done.filename, "26-09-03-slow-morning.md");
        assert_eq!(
            done.url.as_deref(),
            Some("https://me.io/posts/slow-morning")
        );
        assert_eq!(deploys.asked.get(), 0, "nothing to follow");
        // preparing, pushing, published — in that order.
        let phases: Vec<&str> = seen.iter().map(|u| u.phase.as_str()).collect();
        assert_eq!(phases, ["preparing", "pushing", "published"]);
    }

    #[test]
    fn the_pushed_file_is_the_yaml_the_repo_expects() {
        let s = Scratch::new("yaml", "none");
        let note = s.note(POST);
        let github = FakeGithub::default();

        run(
            &s,
            &github,
            &FakeDeploys::settling_after(0, DeployState::Succeeded),
            &note,
        );

        let pushed = github.files.borrow()["src/content/posts/26-09-03-slow-morning.md"].clone();
        assert!(pushed.starts_with("---\ntitle: \"Slow Morning\"\ndate: \"2026-09-03\"\n---\n"));
        assert!(pushed.contains("Coffee."));
    }

    #[test]
    fn a_first_push_says_add_and_a_second_says_update() {
        let s = Scratch::new("addupdate", "none");
        let note = s.note(POST);
        let github = FakeGithub::default();
        let deploys = FakeDeploys::settling_after(0, DeployState::Succeeded);

        run(&s, &github, &deploys, &note);
        run(&s, &github, &deploys, &note);

        assert!(github.called(
            "write src/content/posts/26-09-03-slow-morning.md :: Add 26-09-03-slow-morning.md"
        ));
        assert!(github.called(
            "write src/content/posts/26-09-03-slow-morning.md :: Update 26-09-03-slow-morning.md"
        ));
    }

    #[test]
    fn a_renamed_post_does_not_leave_its_old_file_on_the_blog() {
        let s = Scratch::new("rename", "none");
        let note = s.note(
            "@me.io post\n@title Slow Morning\n@date 26-09-03\n@published 26-09-03-old-name.md\n\nCoffee.\n",
        );
        let github = FakeGithub::default();
        github.files.borrow_mut().insert(
            "src/content/posts/26-09-03-old-name.md".into(),
            "old".into(),
        );

        run(
            &s,
            &github,
            &FakeDeploys::settling_after(0, DeployState::Succeeded),
            &note,
        );

        assert!(github.called(
            "delete src/content/posts/26-09-03-old-name.md :: Remove 26-09-03-old-name.md, renamed to 26-09-03-slow-morning.md"
        ));
        assert!(!github
            .files
            .borrow()
            .contains_key("src/content/posts/26-09-03-old-name.md"));
    }

    #[test]
    fn a_post_that_kept_its_name_is_not_deleted_and_rewritten() {
        let s = Scratch::new("samename", "none");
        let note = s.note(
            "@me.io post\n@title Slow Morning\n@date 26-09-03\n@published 26-09-03-slow-morning.md\n\nCoffee.\n",
        );
        let github = FakeGithub::default();

        run(
            &s,
            &github,
            &FakeDeploys::settling_after(0, DeployState::Succeeded),
            &note,
        );

        assert!(!github
            .calls
            .borrow()
            .iter()
            .any(|call| call.starts_with("delete")));
    }

    #[test]
    fn a_build_is_followed_until_it_settles_and_the_bar_moves_while_it_does() {
        let s = Scratch::new("follow", "vercel");
        let note = s.note(POST);
        let github = FakeGithub::default();
        let deploys = FakeDeploys::settling_after(3, DeployState::Succeeded);

        let (done, seen) = run(&s, &github, &deploys, &note);

        assert_eq!(done.phase, "published");
        assert_eq!(deploys.asked.get(), 4);
        let building: Vec<i64> = seen
            .iter()
            .filter(|u| u.phase == "building")
            .map(|u| u.progress)
            .collect();
        assert_eq!(building.len(), 3);
        // Moving, and never past the ceiling that says the build is still on.
        assert!(building.windows(2).all(|pair| pair[0] <= pair[1]));
        assert!(building.iter().all(|percent| *percent <= 98));
    }

    #[test]
    fn a_failed_deploy_says_what_the_provider_called_it() {
        let s = Scratch::new("failed", "cloudflare");
        let note = s.note(POST);
        let deploys = FakeDeploys::settling_after(0, DeployState::Failed);

        let (done, _) = run(&s, &FakeGithub::default(), &deploys, &note);

        assert_eq!(done.phase, "failed");
        assert_eq!(done.error.as_deref(), Some("Deploy deploy"));
        assert_eq!(done.progress, 15);
    }

    #[test]
    fn a_build_that_never_settles_gives_up_rather_than_pretending() {
        // Fifteen minutes, and the clock here moves three seconds a poll.
        let s = Scratch::new("stuck", "vercel");
        let note = s.note(POST);
        let deploys = FakeDeploys::settling_after(usize::MAX, DeployState::Succeeded);

        let (done, _) = run(&s, &FakeGithub::default(), &deploys, &note);

        assert_eq!(done.phase, "failed");
        assert!(done.error.unwrap().contains("after 15 minutes"));
    }

    #[test]
    fn a_blog_with_no_deploy_token_still_counts_the_push_as_done() {
        // The push is the part that matters; following the build is a courtesy.
        let s = Scratch::new("notoken", "vercel");
        crate::blogs::set_blog_secret(&s.data, &s.blog_id(), "vercel", "").unwrap();
        let note = s.note(POST);
        let deploys = FakeDeploys::settling_after(0, DeployState::Succeeded);

        let (done, _) = run(&s, &FakeGithub::default(), &deploys, &note);

        assert_eq!(done.phase, "published");
        assert!(done.message.contains("no deploy token"));
        assert_eq!(deploys.asked.get(), 0);
    }

    #[test]
    fn how_long_the_build_took_is_remembered_for_the_next_bar() {
        let s = Scratch::new("timing", "vercel");
        let note = s.note(POST);
        let deploys = FakeDeploys::settling_after(2, DeployState::Succeeded);

        run(&s, &FakeGithub::default(), &deploys, &note);

        // Two polls at three seconds each.
        assert_eq!(average_for(&s.data, &s.blog_id()), Some(6_000.0));
    }

    #[test]
    fn a_post_that_is_no_longer_in_the_note_says_so() {
        let s = Scratch::new("gone", "none");
        let note = s.note("Just prose now.\n");

        let (done, _) = run(
            &s,
            &FakeGithub::default(),
            &FakeDeploys::settling_after(0, DeployState::Succeeded),
            &note,
        );

        assert_eq!(done.phase, "failed");
        assert_eq!(
            done.error.as_deref(),
            Some("That post is no longer in the note")
        );
    }

    #[test]
    fn a_blog_that_is_not_configured_says_so_before_anything_is_pushed() {
        let s = Scratch::new("noblog", "none");
        let note = s.note("@other.io post\n@title A\n\nBody.\n");
        let github = FakeGithub::default();
        let clock = s.clock.clone();
        let now = move || clock.get();
        let sleep = |_: f64| {};
        let deploys = FakeDeploys::settling_after(0, DeployState::Succeeded);

        let world = World {
            contents: &github,
            deploys: &deploys,
            data_dir: &s.data,
            today: chrono::NaiveDate::from_ymd_opt(2026, 9, 11).unwrap(),
            now: &now,
            sleep: &sleep,
        };
        let done = publish(
            &world,
            &PublishRequest {
                note_id: note,
                blog: "other.io".into(),
                header_line: 0,
            },
            &mut |_| {},
        );

        assert_eq!(done.phase, "failed");
        assert_eq!(
            done.error.as_deref(),
            Some("No blog named other.io is configured")
        );
        assert!(github.files.borrow().is_empty());
    }
}
