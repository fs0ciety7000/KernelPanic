//! Kernel_Panic backend — phase 2 skeleton.
//!
//! Fixes the API contract used by the game. Storage is in-memory for now.
// TODO(phase 2): persist saves in SQLite via sqlx, verify flags server-side,
// expose simulated remote hosts over WebSocket.

use std::{collections::HashMap, sync::Arc};

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::RwLock;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

const PLAYER_HEADER: &str = "x-player-token";
const MAX_SAVE_BYTES: usize = 2 * 1024 * 1024;

/// (player token, scenario id) -> save payload
type SaveStore = HashMap<(String, String), Value>;

#[derive(Clone, Default)]
pub struct AppState {
    saves: Arc<RwLock<SaveStore>>,
}

pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/saves/{scenario}", get(get_save).put(put_save))
        .route("/api/scenarios/{id}/verify", post(verify))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state)
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    version: &'static str,
}

async fn health() -> Json<Health> {
    Json(Health { status: "ok", version: env!("CARGO_PKG_VERSION") })
}

fn player_token(headers: &HeaderMap) -> Result<String, (StatusCode, &'static str)> {
    headers
        .get(PLAYER_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|t| !t.is_empty() && t.len() <= 128)
        .map(str::to_owned)
        .ok_or((StatusCode::UNAUTHORIZED, "missing or invalid X-Player-Token"))
}

async fn get_save(
    State(state): State<AppState>,
    Path(scenario): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, &'static str)> {
    let token = player_token(&headers)?;
    state
        .saves
        .read()
        .await
        .get(&(token, scenario))
        .cloned()
        .map(Json)
        .ok_or((StatusCode::NOT_FOUND, "no save"))
}

async fn put_save(
    State(state): State<AppState>,
    Path(scenario): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<StatusCode, (StatusCode, &'static str)> {
    let token = player_token(&headers)?;
    if body.to_string().len() > MAX_SAVE_BYTES {
        return Err((StatusCode::PAYLOAD_TOO_LARGE, "save too large"));
    }
    state.saves.write().await.insert((token, scenario), body);
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct VerifyRequest {
    objective: String,
    hash: String,
}

async fn verify(Path(_id): Path<String>, Json(_req): Json<VerifyRequest>) -> (StatusCode, Json<Value>) {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(serde_json::json!({ "error": "server-side verification lands in phase 2" })),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    async fn send(app: &Router, req: Request<Body>) -> (StatusCode, String) {
        let res = app.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        (status, String::from_utf8_lossy(&bytes).into_owned())
    }

    #[tokio::test]
    async fn health_ok() {
        let app = app(AppState::default());
        let (status, body) = send(&app, Request::get("/api/health").body(Body::empty()).unwrap()).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.contains("\"status\":\"ok\""));
    }

    #[tokio::test]
    async fn save_roundtrip_is_scoped_by_token() {
        let app = app(AppState::default());
        let put = Request::put("/api/saves/ghost-shift")
            .header(PLAYER_HEADER, "alice")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"version":1}"#))
            .unwrap();
        assert_eq!(send(&app, put).await.0, StatusCode::NO_CONTENT);

        let get_alice = Request::get("/api/saves/ghost-shift").header(PLAYER_HEADER, "alice").body(Body::empty()).unwrap();
        assert_eq!(send(&app, get_alice).await, (StatusCode::OK, r#"{"version":1}"#.to_owned()));

        let get_bob = Request::get("/api/saves/ghost-shift").header(PLAYER_HEADER, "bob").body(Body::empty()).unwrap();
        assert_eq!(send(&app, get_bob).await.0, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn save_requires_token() {
        let app = app(AppState::default());
        let (status, _) = send(&app, Request::get("/api/saves/ghost-shift").body(Body::empty()).unwrap()).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn verify_not_implemented_yet() {
        let app = app(AppState::default());
        let req = Request::post("/api/scenarios/ghost-shift/verify")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"objective":"c2","hash":"abc"}"#))
            .unwrap();
        assert_eq!(send(&app, req).await.0, StatusCode::NOT_IMPLEMENTED);
    }
}
