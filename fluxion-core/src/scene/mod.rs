// ============================================================
// fluxion-core — Scene Data Types + Utilities
//
// Mirrors the TypeScript interfaces in Scene.ts and SceneSerializer.ts.
// Key operations:
//   • parse_and_sort_scene  — parse JSON + topo-sort entities (parents first)
//   • serialize_scene       — serialise SceneFileData back to JSON
// ============================================================

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, VecDeque};

// ── Data types (mirror TypeScript interfaces) ─────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneFileData {
    pub name:    String,
    pub version: u32,
    pub settings: SceneSettings,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub editor_camera: Option<EditorCamera>,
    pub entities: Vec<SerializedEntity>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneSettings {
    pub ambient_color:     [f32; 3],
    pub ambient_intensity: f32,
    pub fog_enabled:       bool,
    pub fog_color:         [f32; 3],
    pub fog_density:       f32,
    pub skybox:            Option<String>,
    pub physics_gravity:   [f32; 3],
    // Allow unknown settings fields without failing
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorCamera {
    pub position: [f32; 3],
    pub target:   [f32; 3],
    pub fov:      f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedEntity {
    pub id:     u32,
    pub name:   String,
    pub parent: Option<u32>,
    pub tags:   Vec<String>,
    pub components: Vec<SerializedComponent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedComponent {
    #[serde(rename = "type")]
    pub component_type: String,
    pub data: Value,
}

// ── Core operations ────────────────────────────────────────────────────────────

/// Parse raw JSON + topologically sort entities (parents before children).
/// Returns `Err` if the JSON is malformed or the schema is invalid.
pub fn parse_and_sort_scene(json: &str) -> Result<SceneFileData, String> {
    let mut scene: SceneFileData = serde_json::from_str(json)
        .map_err(|e| format!("Scene JSON parse error: {e}"))?;

    scene.entities = topo_sort_entities(scene.entities)?;
    Ok(scene)
}

/// Serialize a `SceneFileData` to a pretty-printed JSON string.
pub fn serialize_scene(scene: &SceneFileData) -> Result<String, String> {
    serde_json::to_string_pretty(scene)
        .map_err(|e| format!("Scene JSON serialize error: {e}"))
}

/// Topologically sort `entities` so every parent appears before its children.
/// Detects cycles (returns `Err`) and handles missing-parent references gracefully
/// (orphans are appended last, unmodified).
pub fn topo_sort_entities(entities: Vec<SerializedEntity>) -> Result<Vec<SerializedEntity>, String> {
    if entities.is_empty() { return Ok(entities); }

    // Index entities by id
    let n = entities.len();
    let mut id_to_idx: HashMap<u32, usize> = HashMap::with_capacity(n);
    for (i, e) in entities.iter().enumerate() {
        id_to_idx.insert(e.id, i);
    }

    // Build children list and in-degree per node
    let mut children: Vec<Vec<usize>> = vec![Vec::new(); n];
    let mut in_degree: Vec<u32> = vec![0; n];

    for (i, e) in entities.iter().enumerate() {
        if let Some(pid) = e.parent {
            if let Some(&pi) = id_to_idx.get(&pid) {
                children[pi].push(i);
                in_degree[i] += 1;
            }
            // Unknown parent → treat as root (in_degree stays 0)
        }
    }

    // BFS / Kahn's algorithm
    let mut queue: VecDeque<usize> = VecDeque::with_capacity(n);
    for i in 0..n {
        if in_degree[i] == 0 { queue.push_back(i); }
    }

    let mut order: Vec<usize> = Vec::with_capacity(n);
    while let Some(i) = queue.pop_front() {
        order.push(i);
        for &child in &children[i] {
            in_degree[child] -= 1;
            if in_degree[child] == 0 { queue.push_back(child); }
        }
    }

    if order.len() != n {
        return Err(format!(
            "Scene entity hierarchy contains a cycle ({} of {} entities unreachable)",
            n - order.len(), n
        ));
    }

    // Re-order original vec according to BFS order
    let mut result: Vec<Option<SerializedEntity>> = entities.into_iter().map(Some).collect();
    Ok(order.into_iter().map(|i| result[i].take().unwrap()).collect())
}

// ── Tauri-callable helpers (no wasm path needed — file I/O is native-only) ────

/// Read a scene file, parse JSON, topologically sort, and return the data.
#[cfg(not(target_arch = "wasm32"))]
pub fn load_scene_file(path: &str) -> Result<SceneFileData, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read scene file '{path}': {e}"))?;
    parse_and_sort_scene(&raw)
}

/// Validate and atomically write a scene to disk.
/// Writes to `<path>.tmp` first, then renames for crash-safety.
#[cfg(not(target_arch = "wasm32"))]
pub fn save_scene_file(path: &str, scene: &SceneFileData) -> Result<(), String> {
    let json = serialize_scene(scene)?;
    let tmp  = format!("{path}.tmp");
    std::fs::write(&tmp, &json)
        .map_err(|e| format!("Failed to write temp scene '{tmp}': {e}"))?;
    std::fs::rename(&tmp, path)
        .map_err(|e| format!("Failed to rename scene file: {e}"))?;
    Ok(())
}
