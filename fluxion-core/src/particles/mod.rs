// ============================================================
// fluxion-core — Particle Simulation Step
//
// Flat Float32Array protocol (16 f32 per particle):
//   [0..=2]  position    (x, y, z)
//   [3..=5]  velocity    (x, y, z)
//   [6]      life        (seconds remaining)
//   [7]      max_life    (original lifetime)
//   [8]      start_size
//   [9]      end_size
//   [10..=12] start_color (r, g, b)
//   [13..=15] end_color   (r, g, b)
//
// Output buffers (one slot per alive particle written front-to-back):
//   offsets  : [x, y, z] per particle  → THREE InstancedBufferAttribute aOffset
//   scales   : [size]    per particle  → THREE InstancedBufferAttribute aScale
//   colors   : [r, g, b] per particle  → THREE InstancedBufferAttribute aColor
//   opacities: [t]       per particle  → THREE InstancedBufferAttribute aOpacity
//
// Returns: new alive count (dead particles removed, survivors compacted).
// ============================================================

const STRIDE: usize = 16;

// Indices into the per-particle state slice
const PX: usize = 0;
const PY: usize = 1;
const PZ: usize = 2;
const VX: usize = 3;
const VY: usize = 4;
const VZ: usize = 5;
const LIFE:       usize = 6;
const MAX_LIFE:   usize = 7;
const START_SIZE: usize = 8;
const END_SIZE:   usize = 9;
const SR: usize = 10;
const SG: usize = 11;
const SB: usize = 12;
const ER: usize = 13;
const EG: usize = 14;
const EB: usize = 15;

#[inline(always)]
fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

/// Simulate one physics/rendering step for up to `count` particles stored in `state`.
///
/// Particles whose `life` drops to zero or below are removed by compaction.
/// Surviving particles are written back to the front of `state`.
///
/// # Panics
/// Panics in debug if any slice is too short for `count` particles.
pub fn simulate_particles(
    state:     &mut [f32],
    count:     usize,
    dt:        f32,
    gravity:   f32,
    offsets:   &mut [f32],
    scales:    &mut [f32],
    colors:    &mut [f32],
    opacities: &mut [f32],
) -> usize {
    debug_assert!(state.len()     >= count * STRIDE);
    debug_assert!(offsets.len()   >= count * 3);
    debug_assert!(scales.len()    >= count);
    debug_assert!(colors.len()    >= count * 3);
    debug_assert!(opacities.len() >= count);

    let mut write = 0usize; // alive-particle write cursor

    for read in 0..count {
        let rs = read  * STRIDE;

        let life = state[rs + LIFE] - dt;

        if life <= 0.0 {
            // Particle dead — skip (don't copy to write position)
            continue;
        }

        // ── Integrate ──────────────────────────────────────────────────────
        state[rs + VY] += gravity * dt;

        state[rs + PX] += state[rs + VX] * dt;
        state[rs + PY] += state[rs + VY] * dt;
        state[rs + PZ] += state[rs + VZ] * dt;
        state[rs + LIFE] = life;

        // ── Lerp t in [0, 1]: 0 = just spawned, 1 = nearly dead ───────────
        let max_life = state[rs + MAX_LIFE];
        let t = if max_life > 0.0 { 1.0 - life / max_life } else { 1.0 };

        let size    = lerp(state[rs + START_SIZE], state[rs + END_SIZE], t);
        let opacity = life / max_life;
        let cr      = lerp(state[rs + SR], state[rs + ER], t);
        let cg      = lerp(state[rs + SG], state[rs + EG], t);
        let cb      = lerp(state[rs + SB], state[rs + EB], t);

        // ── Compact state (may be a no-op when write == read) ──────────────
        if write != read {
            let ws = write * STRIDE;
            state.copy_within(rs..rs + STRIDE, ws);
        }

        // ── Write render output ────────────────────────────────────────────
        let wo3 = write * 3;

        offsets[wo3]     = state[write * STRIDE + PX];
        offsets[wo3 + 1] = state[write * STRIDE + PY];
        offsets[wo3 + 2] = state[write * STRIDE + PZ];

        scales[write] = size;

        colors[wo3]     = cr;
        colors[wo3 + 1] = cg;
        colors[wo3 + 2] = cb;

        opacities[write] = opacity;

        write += 1;
    }

    write
}

// ── wasm-bindgen export ────────────────────────────────────────────────────────
//
// JS call site:
//
//   // stateIn: Float32Array length = count * 16
//   const result = simulate_particles_wasm(stateIn, count, dt, gravity);
//   // result: Float32Array with layout:
//   //   [0]             alive_count (cast to f32)
//   //   [1..1+a*3]      offsets  (xyz per alive particle)
//   //   [1+a*3..1+a*4]  scales   (size per alive particle)
//   //   [1+a*4..1+a*7]  colors   (rgb per alive particle)
//   //   [1+a*7..1+a*8]  opacities (t per alive particle)
//   //   [1+a*8..]       updated state (a × 16, compacted to front)

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn simulate_particles_wasm(
    state_in: &[f32],   // copied from JS Float32Array (16 floats × count)
    count:    u32,
    dt:       f32,
    gravity:  f32,
) -> Box<[f32]> {
    let count = count as usize;

    // Working copy of state — we need mutation for in-place compaction
    let mut state: Vec<f32> = state_in.to_vec();

    // Allocate output buffers sized for worst-case (all alive)
    let mut offsets   = vec![0f32; count * 3];
    let mut scales    = vec![0f32; count];
    let mut colors    = vec![0f32; count * 3];
    let mut opacities = vec![0f32; count];

    let alive = simulate_particles(
        &mut state, count, dt, gravity,
        &mut offsets, &mut scales, &mut colors, &mut opacities,
    );

    // Pack into a single Float32Array returned to JS:
    //   [alive_count, offsets*3, scales*1, colors*3, opacities*1, state*16]
    let header = 1usize;
    let render  = alive * (3 + 1 + 3 + 1);  // 8 floats per alive particle
    let state_n = alive * STRIDE;
    let total   = header + render + state_n;

    let mut out: Vec<f32> = Vec::with_capacity(total);
    out.push(alive as f32);
    out.extend_from_slice(&offsets[..alive * 3]);
    out.extend_from_slice(&scales[..alive]);
    out.extend_from_slice(&colors[..alive * 3]);
    out.extend_from_slice(&opacities[..alive]);
    out.extend_from_slice(&state[..alive * STRIDE]);

    out.into_boxed_slice()
}

/// Returns the per-particle state stride (16).  Use from JS to size buffers.
#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn particle_stride() -> u32 {
    STRIDE as u32
}
