/*!
Deciding what a sync should do, with no filesystem or network in sight — a port
of `src/shared/syncPlan.ts`.

The whole point is that the awkward cases — a post changed on both sides, one
deleted on one side — are settled by a function that can simply be read.
*/

// Called by the sync, which is the slice after this one.
#![allow(dead_code)]

use serde::Serialize;
use std::collections::BTreeMap;

use crate::publish_state::PostState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SyncAction {
    /// On the blog but not here.
    Import,
    /// Changed on the blog since the last sync; unchanged here.
    Update,
    /// Changed here since the last sync; unchanged on the blog.
    PublishLocal,
    /// Changed on both sides. Tova will not pick a winner.
    Conflict,
    /// Gone from the blog; still here.
    RemovedRemotely,
    /// Same on both sides.
    Unchanged,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemotePost {
    pub filename: String,
    pub sha: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalPost {
    pub filename: String,
    pub hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedPost {
    pub filename: String,
    pub action: SyncAction,
}

fn action_for(
    remote: Option<&RemotePost>,
    local: Option<&LocalPost>,
    known: Option<&PostState>,
) -> SyncAction {
    match (remote, local) {
        // Never seen here, or deleted here since the last sync. Deleting
        // locally is handled explicitly elsewhere, so an unknown file is
        // simply new.
        (Some(_), None) => SyncAction::Import,

        // Only counts as removed if Tova had seen it on the blog before;
        // otherwise it is a local draft that has never been published.
        (None, Some(_)) => match known {
            None => SyncAction::PublishLocal,
            Some(_) => SyncAction::RemovedRemotely,
        },

        (None, None) => SyncAction::Unchanged,

        (Some(remote), Some(local)) => {
            // Present on both sides with no record of a sync — anything but
            // matching content is a conflict rather than a guess.
            let Some(known) = known else {
                return SyncAction::Conflict;
            };

            match (
                remote.sha != known.remote_sha,
                local.hash != known.local_hash,
            ) {
                (true, true) => SyncAction::Conflict,
                (true, false) => SyncAction::Update,
                (false, true) => SyncAction::PublishLocal,
                (false, false) => SyncAction::Unchanged,
            }
        }
    }
}

/// Every filename either side knows about, in order, with what to do about it.
pub fn plan_sync(
    remote: &[RemotePost],
    local: &[LocalPost],
    known: &BTreeMap<String, PostState>,
) -> Vec<PlannedPost> {
    let remote_by: BTreeMap<&str, &RemotePost> = remote
        .iter()
        .map(|post| (post.filename.as_str(), post))
        .collect();
    let local_by: BTreeMap<&str, &LocalPost> = local
        .iter()
        .map(|post| (post.filename.as_str(), post))
        .collect();

    /*
     * Sorted, and sorted the way JavaScript sorts: `Array.prototype.sort` with
     * no comparator orders by UTF-16 code unit, which is not what Rust's `sort`
     * on a String does above the basic plane. A post with an emoji in its
     * filename is unlikely; a plan whose order depends on which backend ran it
     * is worse than unlikely.
     */
    let mut filenames: Vec<&str> = remote_by.keys().chain(local_by.keys()).copied().collect();
    filenames.sort_by(|a, b| crate::js::compare(a, b));
    filenames.dedup();

    filenames
        .into_iter()
        .map(|filename| PlannedPost {
            filename: filename.to_string(),
            action: action_for(
                remote_by.get(filename).copied(),
                local_by.get(filename).copied(),
                known.get(filename),
            ),
        })
        .collect()
}
