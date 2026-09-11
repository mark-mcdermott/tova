/*!
Following a build after the push — a port of `src/main/publish/deploys.ts`.

Both providers are read-only here: Tova asks which deployment carries its
commit and what became of it, and never triggers or cancels anything.

`Deploys` is a trait for the same reason `Contents` is: the publisher's loop
has to be testable without a network, and a loop that polls is exactly the kind
of thing worth being able to run instantly.
*/

use serde::Serialize;

use crate::blogs::BlogDeploy;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DeployState {
    Pending,
    Building,
    Succeeded,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeployStatus {
    pub state: DeployState,
    /// The live URL, once there is one.
    pub url: Option<String>,
    pub detail: Option<String>,
}

impl DeployStatus {
    fn pending() -> Self {
        DeployStatus {
            state: DeployState::Pending,
            url: None,
            detail: None,
        }
    }
}

pub trait Deploys {
    fn status(
        &self,
        deploy: &BlogDeploy,
        commit: &str,
        token: &str,
    ) -> Result<DeployStatus, String>;
}

#[derive(Default)]
pub struct Api {
    #[cfg(test)]
    base: Option<String>,
}

impl Api {
    fn root(&self, real: &str) -> String {
        #[cfg(test)]
        if let Some(base) = &self.base {
            return base.clone();
        }
        real.to_string()
    }
}

/// `encodeURIComponent` for the two ids that go into a URL.
fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| {
            let c = byte as char;
            if c.is_ascii_alphanumeric()
                || matches!(c, '-' | '_' | '.' | '!' | '~' | '*' | '\'' | '(' | ')')
            {
                c.to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}

fn fetch_json(url: &str, token: &str) -> Result<serde_json::Value, String> {
    let request = http::Request::builder()
        .method("GET")
        .uri(url)
        .header("Authorization", format!("Bearer {token}"))
        .body(String::new())
        .map_err(|e| e.to_string())?;

    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .build()
        .into();

    let mut response = agent.run(request).map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(format!("Deployment lookup failed: HTTP {status}"));
    }

    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

fn text(value: &serde_json::Value) -> Option<String> {
    value.as_str().map(str::to_string)
}

fn cloudflare_status(
    api: &Api,
    deploy: &BlogDeploy,
    commit: &str,
    token: &str,
) -> Result<DeployStatus, String> {
    let url = format!(
        "{}/client/v4/accounts/{}/pages/projects/{}/deployments",
        api.root("https://api.cloudflare.com"),
        encode(&deploy.account_id),
        encode(&deploy.project_name)
    );
    let body = fetch_json(&url, token)?;

    let found = body["result"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|entry| entry["deployment_trigger"]["metadata"]["commit_hash"] == commit);

    // The push has landed but Cloudflare has not noticed it yet.
    let Some(found) = found else {
        return Ok(DeployStatus::pending());
    };

    let stage = text(&found["latest_stage"]["name"]).unwrap_or_default();
    let status = text(&found["latest_stage"]["status"]).unwrap_or_default();

    // A stage is only conclusive once it has actually finished.
    let state = match status.as_str() {
        "success" => DeployState::Succeeded,
        "failure" | "canceled" => DeployState::Failed,
        _ => DeployState::Building,
    };

    Ok(DeployStatus {
        state,
        url: text(&found["url"]),
        detail: (!stage.is_empty()).then_some(stage),
    })
}

fn vercel_status(
    api: &Api,
    deploy: &BlogDeploy,
    commit: &str,
    token: &str,
) -> Result<DeployStatus, String> {
    let url = format!(
        "{}/v6/deployments?projectId={}&limit=20",
        api.root("https://api.vercel.com"),
        encode(&deploy.project_id)
    );
    let body = fetch_json(&url, token)?;

    let found = body["deployments"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|entry| entry["meta"]["githubCommitSha"] == commit);

    let Some(found) = found else {
        return Ok(DeployStatus::pending());
    };

    let ready = text(&found["readyState"]).unwrap_or_default();
    let state = match ready.as_str() {
        "READY" => DeployState::Succeeded,
        "ERROR" | "CANCELED" => DeployState::Failed,
        _ => DeployState::Building,
    };

    Ok(DeployStatus {
        state,
        url: text(&found["url"]).map(|host| format!("https://{host}")),
        detail: (!ready.is_empty()).then_some(ready),
    })
}

impl Deploys for Api {
    fn status(
        &self,
        deploy: &BlogDeploy,
        commit: &str,
        token: &str,
    ) -> Result<DeployStatus, String> {
        match deploy.provider.as_str() {
            "cloudflare" => cloudflare_status(self, deploy, commit, token),
            "vercel" => vercel_status(self, deploy, commit, token),
            // No provider to ask, so the push is the whole of it.
            _ => Ok(DeployStatus {
                state: DeployState::Succeeded,
                url: None,
                detail: None,
            }),
        }
    }
}
