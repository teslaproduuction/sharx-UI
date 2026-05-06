# Telemt Relay Hardening — Implementation Plan

## Ground Rules

Every workstream follows this mandatory sequence:

1. Write the full test suite first. Tests must fail on the current code for the reason being fixed.
2. Implement production changes until all new tests pass and no existing test regresses.
3. A failing red test is evidence of a real bug or gap. Never relax a test assertion — fix the code.
4. All test code goes in dedicated files under `src/proxy/tests/` (or the owning module's `#[cfg(test)]` block via `#[path]`). No inline `#[cfg(test)]` inside production code.
5. No PR lands in a non-compiling state. Every diff must be self-contained and `cargo test`-green.

## Agreed Decisions

| Topic | Decision |
|---|---|
| Item 3 `_buffer_pool` | Option B — repurpose the parameter for adaptive startup buffer sizes, not remove it |
| Item 4b in-session adaptation | Decision-gate phase: run experiment, measure, then choose one path |
| Item 1 Level 1 log-normal | Independent of PR-B and PR-C — can land after PR-A only |
| Scope | All items (1, 2, 3, 4a, 4b, 5) in one master plan, separate PRs |

---

## PR Dependency Graph

```
PR-A  (baseline test harness)
  ├─► PR-C  (Item 5: DRS — independent of DI, self-contained)
  ├─► PR-F  (Item 1 Level 1: log-normal — independent, no shared-state changes)
  └─► PR-B  (Item 2: DI migration — high-risk blast radius)
        └─► PR-D  (Items 3+4a: adaptive startup)
              └─► PR-E  (Item 4b: decision gate)
                    └─► PR-G  (Item 1 Level 2: state-aware IPT)
PR-H  (docs + release gate)
```

**NEW ORDERING RATIONALE** (per audit recommendations):
- **PR-C before PR-B**: DRS is self-contained, needs only `is_tls` flag (already in `HandshakeSuccess`) and a new `drs_enabled` config field. No dependency on the large DI refactor. Delivers anti-censorship value immediately. Reduces risk of a stuck dependency chain if PR-B becomes complicated.
- **PR-F independent**: Log-normal replacement modifies only two `rng.random_range()` call sites in `masking.rs` and `handshake.rs`. Zero dependency on DI or DRS. Can be parallelized with PR-C and PR-B.
- **PR-B then PR-D**: DI must be complete before adaptive startup wiring, as both involve injecting state.
- **PR-A first, always**: Baseline gates must lock before any code changes.

Parallelization: PR-C and PR-B test-writing can happen in parallel once PR-A is done; production code integration is sequential.

---

## PR-A — Baseline Test Harness (Phase 1)

**Goal**: Establish regression gates and shared test utilities that all subsequent PRs depend on. No runtime behavior changes.

**TDD compatibility note**: Phase 1 is a characterization and invariant-lock phase. Its baseline tests are intentionally green on current code and exist to freeze security-critical behavior before refactors. This does **not** waive red-first TDD for later phases: every behavior-changing PR after Phase 1 must begin with red tests that fail on then-current code.

**Security objective for Phase 1**: lock anti-probing and anti-fingerprinting behavior before protocol-shape changes. Phase 1 tests must include positive, negative, edge, and adversarial scanner cases with deterministic CI execution and strict fail-closed oracles.

**Split into two sub-phases** (reduces risk: if test utilities need iteration, baseline tests aren't blocked):

- **PR-A.1**: Shared test utilities only. Zero behavior assertions. Merge gate: compiles.
- **PR-A.2**: Baseline invariant tests. All green on current code. Depends on PR-A.1.

### PR-A.1: Shared test utilities

#### New file: `src/proxy/tests/test_harness_common.rs`

**MODULE DECLARATION**: Declare **once** in `src/proxy/mod.rs` as:
```rust
#[cfg(test)]
#[path = "tests/test_harness_common.rs"]
mod test_harness_common;
```

**DO NOT** declare via `#[path]` in relay.rs, handshake.rs, or middle_relay.rs. Including the same file via `#[path]` in multiple modules duplicates all definitions and causes compilation errors (see F15). Consuming test modules import via `use crate::proxy::test_harness_common::*;` (or selective imports).

**NOTE**: Existing 104 test files already define ad-hoc test utilities inline (e.g., `ScriptedWriter` in `relay_atomic_quota_invariant_tests.rs`, `PendingWriter` in `masking_security_tests.rs`, `seeded_rng` in `masking_lognormal_timing_security_tests.rs`, `test_config_with_secret_hex` in `handshake_security_tests.rs`). The harness consolidates these for reuse but does **not** retroactively migrate existing files — that would inflate PR-A's blast radius for zero safety gain.

Contents:

```rust
use crate::config::ProxyConfig;
use rand::rngs::StdRng;
use rand::SeedableRng;
use std::io;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use tokio::io::AsyncWrite;

// ── RecordingWriter ─────────────────────────────────────────────────
// In-memory AsyncWrite that records both per-write and per-flush granularity.
//
// `writes`: one entry per poll_write call (records write-call boundaries).
// `flushed`: one entry per poll_flush call (records record/TLS-frame boundaries).
//            Each entry is all bytes accumulated since the previous flush.
//
// DRS tests (PR-C) need flush-boundary tracking to verify TLS record framing.
// The dual tracking avoids needing separate writer types for different test needs.
pub struct RecordingWriter {
    pub writes: Vec<Vec<u8>>,
    pub flushed: Vec<Vec<u8>>,
    current_record: Vec<u8>,
}

impl RecordingWriter {
    pub fn new() -> Self {
        Self {
            writes: Vec::new(),
            flushed: Vec::new(),
            current_record: Vec::new(),
        }
    }

    /// Total bytes written across all writes.
    pub fn total_bytes(&self) -> usize {
        self.writes.iter().map(|w| w.len()).sum()
    }
}

impl AsyncWrite for RecordingWriter {
    fn poll_write(
        mut self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        let me = self.as_mut().get_mut();
        me.writes.push(buf.to_vec());
        me.current_record.extend_from_slice(buf);
        Poll::Ready(Ok(buf.len()))
    }

    fn poll_flush(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let me = self.as_mut().get_mut();
        let record = std::mem::take(&mut me.current_record);
        if !record.is_empty() {
            me.flushed.push(record);
        }
        Poll::Ready(Ok(()))
    }

    fn poll_shutdown(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Poll::Ready(Ok(()))
    }
}

// ── PendingCountWriter ──────────────────────────────────────────────
// Returns Poll::Pending for the first N poll_write calls, then delegates to inner.
// Also supports separate pending-count control for poll_flush calls.
//
// Needed for DRS tests (PR-C):
//   - drs_pending_on_write_does_not_increment_completed_counter
//   - drs_pending_on_flush_propagates_pending_without_spurious_wake
//
// Unlike the existing masking_security_tests.rs PendingWriter (which is
// unconditionally Pending forever), this supports counted transitions.
pub struct PendingCountWriter<W> {
    pub inner: W,
    pub write_pending_remaining: usize,
    pub flush_pending_remaining: usize,
}

impl<W> PendingCountWriter<W> {
    pub fn new(inner: W, write_pending: usize, flush_pending: usize) -> Self {
        Self {
            inner,
            write_pending_remaining: write_pending,
            flush_pending_remaining: flush_pending,
        }
    }
}

impl<W: AsyncWrite + Unpin> AsyncWrite for PendingCountWriter<W> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        let me = self.as_mut().get_mut();
        if me.write_pending_remaining > 0 {
            me.write_pending_remaining -= 1;
            cx.waker().wake_by_ref();
            return Poll::Pending;
        }
        Pin::new(&mut me.inner).poll_write(cx, buf)
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let me = self.as_mut().get_mut();
        if me.flush_pending_remaining > 0 {
            me.flush_pending_remaining -= 1;
            cx.waker().wake_by_ref();
            return Poll::Pending;
        }
        Pin::new(&mut me.inner).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}

// ── Deterministic seeded RNG ────────────────────────────────────────
// Wraps StdRng::seed_from_u64 for reproducible CI runs.
//
// LIMITATION: Cannot substitute for SecureRandom in production function calls.
// Production code that accepts &SecureRandom requires a project-specific wrapper.
// Tests needing deterministic behavior of production functions that accept
// `impl Rng` (like sample_lognormal_percentile_bounded) can use this directly.
// Tests calling functions that take &SecureRandom must use SecureRandom::new().
pub fn seeded_rng(seed: u64) -> StdRng {
    StdRng::seed_from_u64(seed)
}

// ── Config builders ─────────────────────────────────────────────────
// Builds a minimal ProxyConfig with TLS mode enabled.
// Unlike the per-test-file `test_config_with_secret_hex` helpers, this produces
// a config suitable for relay tests that need is_tls=true but don't need
// handshake secret validation.
pub fn tls_only_config() -> Arc<ProxyConfig> {
    let mut cfg = ProxyConfig::default();
    cfg.general.modes.tls = true;
    Arc::new(cfg)
}

// Builds a ProxyConfig with a test user and secret for handshake tests.
// Requires auth_probe, masking, and SNI configuration for full handshake paths.
pub fn handshake_test_config(secret_hex: &str) -> ProxyConfig {
    let mut cfg = ProxyConfig::default();
    cfg.access.users.clear();
    cfg.access
        .users
        .insert("test-user".to_string(), secret_hex.to_string());
    cfg.access.ignore_time_skew = true;
    cfg.censorship.mask = true;
    cfg.censorship.mask_host = Some("127.0.0.1".to_string());
    cfg.censorship.mask_port = 0; // Overridden by caller with actual listener port
    cfg
}
```

**DROPPED UTILITIES** (vs original plan):
- `SliceReader`: Unnecessary. `tokio::io::duplex()` channels (used in every existing relay test) and `std::io::Cursor<Vec<u8>>` (which implements `AsyncRead` via tokio) already solve this. Adding a `bytes`-crate-dependent `SliceReader` introduces coupling for zero gain.
- `test_stats() -> Arc<Stats>`: Trivial one-liner (`Arc::new(Stats::new())`). Every existing test already constructs this inline. A wrapper adds indirection without value.
- `test_buffer_pool() -> Arc<BufferPool>`: Same reasoning — `Arc::new(BufferPool::new())` is a one-liner already used everywhere.

#### PR-A.1 Merge gate

`cargo check --tests` — compiles with no errors. No behavior assertions yet.

Determinism gate for all new Phase 1 tests:
- Seed RNG-dependent tests via `seeded_rng(...)` (or explicit fixed seeds).
- For timing-sensitive async-delay tests (for example server-hello delay or relay watchdog timing), use paused tokio time and explicit time advancement instead of wall-clock sleeps.
- Avoid shared mutable cross-test coupling except temporary helpers explicitly called out in this plan (`auth_probe_test_lock`, `relay_idle_pressure_test_scope`, `desync_dedup_test_lock`) until PR-B removes them.
- Use explicit per-test IO timeouts (`tokio::time::timeout`) on network/fallback paths to prevent deadlocks and scheduler-dependent flakes.
- Keep all adversarial corpora deterministic (fixed vectors, fixed seed order). No nondeterministic fuzz in default CI.

---

### PR-A.2: Baseline invariant tests

All tests in this sub-phase **must pass on current code** — they are regression locks, not red tests. They lock existing behavior before subsequent PRs modify it.

**DESIGN PRINCIPLE**: Tests must be **implementation-agnostic**. Test through public/`pub(crate)` functions, not through direct static access. This ensures PR-B (which moves statics into `ProxySharedState`) does not break baseline tests.

**SCOPE DISCIPLINE**: Phase 1 should lock boundary behavior and narrow invariants only. It must not duplicate deep transport choreography, quota accounting, or close-matrix coverage that is already exercised elsewhere unless the baseline adds a new security oracle that later PRs could realistically regress unnoticed.

**TEST ISOLATION**: All handshake baseline tests must use the existing `auth_probe_test_lock()` / `clear_auth_probe_state_for_testing()` pattern until PR-B replaces it. Middle-relay idle tests use `relay_idle_pressure_test_scope()` / `clear_relay_idle_pressure_state_for_testing()`, while desync tests use `desync_dedup_test_lock()` / `clear_desync_dedup_for_testing()`. This is temporary coupling that PR-B will eliminate.

**FAIL-CLOSED ASSERTION POLICY (mandatory for Phase 1)**:
- Any probe/fallback error path must assert one of: (a) transparent mask-host relay behavior or (b) silent close / generic transport failure.
- Tests must never assert proxy-identifying payloads, banners, or protocol-specific error hints.
- For "no identity leak" cases, assert observable behavior (bytes sent, connection state, error class) rather than brittle log text matching.

#### New file: `src/proxy/tests/relay_baseline_invariant_tests.rs`

Declared in `src/proxy/relay.rs` via:
```rust
#[cfg(test)]
#[path = "tests/relay_baseline_invariant_tests.rs"]
mod relay_baseline_invariant_tests;
```

**De-duplication audit**: The existing 7 relay test files cover quota boundary attacks, quota overflow, watchdog delta, and adversarial HOL blocking. The baseline tests below cover **different invariants** not locked by existing tests, verified against the existing test names:
- `relay_watchdog_delta_security_tests.rs` tests `watchdog_delta()` function exhaustively — **overlaps** with `relay_baseline_watchdog_delta_handles_wraparound_gracefully`. **DROP** the watchdog delta baseline test (existing tests already lock this behavior fully).
- `relay_adversarial_tests.rs::relay_hol_blocking_prevention_regression` exercises bidirectional transfer but does not assert symmetric byte counting. **KEEP** the symmetric-counting baseline.
- No existing test covers the zero-byte transfer case. **KEEP**.
- No existing test covers the activity timeout firing path. **KEEP**.
- Existing end-to-end quota cutoff coverage already exists in `relay_quota_boundary_blackhat_tests.rs`. **DROP** duplicate quota-cutoff baseline here.
- Existing half-close chaos coverage already exists in `relay_adversarial_tests.rs::relay_chaos_half_close_crossfire_terminates_without_hang`. **DROP** duplicate half-close baseline here.

```
// Positive: relay with no data flow for >ACTIVITY_TIMEOUT returns Ok.
// Verifies watchdog fires and select! cancels copy_bidirectional cleanly.
relay_baseline_activity_timeout_fires_after_inactivity

// Positive: relay with immediate close on both sides returns Ok(())
// and both StatsIo byte counters read zero.
relay_baseline_zero_bytes_returns_ok_and_counters_zero

// Positive: transfer N bytes C→S and M bytes S→C simultaneously.
// Assert StatsIo counters match exactly (no double-counting or loss).
relay_baseline_bidirectional_bytes_counted_symmetrically

// Error path: both duplex sides close simultaneously (EOF race).
// relay_bidirectional returns without panic.
relay_baseline_both_sides_close_simultaneously_no_panic

// Error path: server-side writer returns BrokenPipe mid-transfer.
// relay_bidirectional propagates error without panic.
relay_baseline_broken_pipe_midtransfer_returns_error

// Adversarial: single-byte writes for 10000 iterations.
// Assert counters exactly 10000 (no off-by-one in StatsIo accounting).
relay_baseline_many_small_writes_exact_counter
```

Oracle requirements (mandatory):
- `relay_baseline_activity_timeout_fires_after_inactivity`: use paused tokio time. Assert the relay does **not** complete before `ACTIVITY_TIMEOUT`, then does complete after advancing past `ACTIVITY_TIMEOUT + WATCHDOG_INTERVAL` with bounded slack. Do not assert a wall-clock range that ignores the watchdog cadence.
- `relay_baseline_zero_bytes_returns_ok_and_counters_zero`: assert both directions observe EOF (`read` returns `0`) and `stats.get_user_total_octets(user) == 0`.
- `relay_baseline_bidirectional_bytes_counted_symmetrically`: send fixed payload sizes `N` and `M`; assert exact byte equality on both peers and exact counter equality (`N + M` total accounted where applicable).
- `relay_baseline_both_sides_close_simultaneously_no_panic`: assert join result is `Ok(Ok(()))` (not just "did not panic").
- `relay_baseline_broken_pipe_midtransfer_returns_error`: assert typed error class (`io::ErrorKind::BrokenPipe` or mapped proxy error) and no process crash.
- `relay_baseline_many_small_writes_exact_counter`: enforce upper runtime bound with `timeout(Duration::from_secs(3), ...)` and assert exact transferred/accounted byte count.

#### New file: `src/proxy/tests/handshake_baseline_invariant_tests.rs`

Declared in `src/proxy/handshake.rs` via:
```rust
#[cfg(test)]
#[path = "tests/handshake_baseline_invariant_tests.rs"]
mod handshake_baseline_invariant_tests;
```

**De-duplication audit**: The existing 13 handshake test files heavily test auth_probe behavior, bit-flip rejection, key zeroization, and timing. The baseline tests below lock specific invariants at the function-call boundary level:

**LAYERING RULE**: `handle_tls_handshake(...)` is a handshake classifier/authenticator, not the masking relay itself. Handshake baseline tests must stop at the `HandshakeResult` boundary. Actual client-visible fallback relay behavior belongs in masking/client baselines, not in direct handshake tests.

**TEST ISOLATION**: Each test acquires `auth_probe_test_lock()` / `unknown_sni_warn_test_lock()` / `warned_secrets_test_lock()` as needed. Each test calls the corresponding `clear_*_for_testing()` at the start. All tests use the existing `test_config_with_secret_hex`-style config construction (via the new `handshake_test_config` helper or inline).

```
// Positive: unrecognized handshake bytes classify as `BadClient` rather than
// a success path. This locks the invariant that garbage input is rejected
// without exposing proxy-specific success semantics at the handshake boundary.
handshake_baseline_probe_always_falls_back_to_masking

// Positive: valid TLS ClientHello but wrong secret stays on the non-success
// path, not an authenticated handshake success.
handshake_baseline_invalid_secret_triggers_fallback_not_error_response

// Positive: consecutive failed handshakes from same IP increment
// auth_probe_fail_streak for that IP.
// Tests through the public auth_probe_fail_streak_for_testing() accessor.
handshake_baseline_auth_probe_streak_increments_per_ip

// Positive: after AUTH_PROBE_BACKOFF_START_FAILS consecutive failures,
// the IP is throttled. Tests through auth_probe_is_throttled_for_testing().
// NOTE: AUTH_PROBE_BACKOFF_START_FAILS is a compile-time constant
// (different values for #[cfg(test)] and production). Name reflects this.
handshake_baseline_saturation_fires_at_compile_time_threshold

// Adversarial: attacker sends 100 handshakes with distinct invalid secrets
// from the same IP. Verify auth_probe streak grows monotonically.
handshake_baseline_repeated_probes_streak_monotonic

// Security: after throttle engages, the tracked auth-probe block window lasts
// for the computed backoff duration and then expires.
handshake_baseline_throttled_ip_incurs_backoff_delay

// Adversarial: malformed TLS-like probe frames (truncated record header,
// impossible length fields, random high-entropy payload) never panic and
// never classify as successful handshakes.
handshake_baseline_malformed_probe_frames_fail_closed_to_masking
```

Oracle requirements (mandatory):
- `handshake_baseline_probe_always_falls_back_to_masking`: assert `HandshakeResult::BadClient { .. }` (or equivalent non-success fallback classification). Do **not** require direct observation of downstream mask-host IO at this layer.
- `handshake_baseline_invalid_secret_triggers_fallback_not_error_response`: assert non-success handshake classification and no success-path key material/result. Client-visible fallback behavior is covered in masking/client tests.
- `handshake_baseline_auth_probe_streak_increments_per_ip`: assert monotonic increment by exact delta `+1` per failed attempt for one IP, with no mutation for untouched IPs.
- `handshake_baseline_saturation_fires_at_compile_time_threshold`: assert transition point occurs exactly at `AUTH_PROBE_BACKOFF_START_FAILS` (not before) and remains throttled after threshold.
- `handshake_baseline_repeated_probes_streak_monotonic`: assert strictly non-decreasing streak over deterministic 100-attempt corpus.
- `handshake_baseline_throttled_ip_incurs_backoff_delay`: this Phase 1 baseline locks the **internal throttle window semantics**, not wire-visible sleep duration. Assert the tracked block window lasts at least `auth_probe_backoff(AUTH_PROBE_BACKOFF_START_FAILS)` and expires after that bound. If client-visible delay coverage is desired, add a separate async test with `server_hello_delay_min_ms == server_hello_delay_max_ms` through the client/handshake entrypoint.
- `handshake_baseline_malformed_probe_frames_fail_closed_to_masking`: run deterministic malformed corpus; assert no success result, no panic, and bounded completion per case. Do not over-assert downstream masking transport from the handshake-only boundary.

Timing requirement for this file:
- Use paused tokio time only for tests that actually measure async sleep behavior. Tracker-only tests may use synthetic `Instant` arithmetic and must avoid wall-clock sleeps.

#### New file: `src/proxy/tests/middle_relay_baseline_invariant_tests.rs`

Declared in `src/proxy/middle_relay.rs` via:
```rust
#[cfg(test)]
#[path = "tests/middle_relay_baseline_invariant_tests.rs"]
mod middle_relay_baseline_invariant_tests;
```

**DESIGN**: Existing middle-relay suites already exercise idle/desync behavior extensively, but many assertions are tightly coupled to current internals/statics. Phase 1 only adds minimal **stable helper-boundary contract locks** that must remain stable across PR-B.

**TEST ISOLATION**: Idle-registry tests acquire `relay_idle_pressure_test_scope()` and call `clear_relay_idle_pressure_state_for_testing()` at the start. Desync-dedup tests acquire `desync_dedup_test_lock()` and call `clear_desync_dedup_for_testing()` at the start. Do not rely on one lock to serialize the other registry.

```
// API contract: mark+oldest+clear round-trip through stable helper functions only,
// without direct access to internal registries/statics.
middle_relay_baseline_public_api_idle_roundtrip_contract

// API contract: dedup suppress/allow semantics through stable helper entry,
// without asserting internal map layout.
middle_relay_baseline_public_api_desync_window_contract
```

Oracle requirements (mandatory):
- `middle_relay_baseline_public_api_idle_roundtrip_contract`: assert first `mark_relay_idle_candidate(conn)` returns `true`, `oldest_relay_idle_candidate() == Some(conn)`, after clear it is not `Some(conn)`, and a second mark after clear succeeds.
- `middle_relay_baseline_public_api_desync_window_contract`: through the stable helper boundary only, assert first event emits, duplicate within window suppresses, and post-rotation/window-advance emits again.

#### New file: `src/proxy/tests/masking_baseline_invariant_tests.rs`

Declared in `src/proxy/masking.rs` via:
```rust
#[cfg(test)]
#[path = "tests/masking_baseline_invariant_tests.rs"]
mod masking_baseline_invariant_tests;
```

**RATIONALE**: The masking module is the **primary anti-DPI component** — it makes the proxy appear to be a legitimate website when probed by censors. PR-F modifies `mask_outcome_target_budget` (log-normal replacement). Without baseline locks on masking timing behavior, PR-F could subtly regress the timing envelope with no detection.

**DETERMINISM NOTE**: `mask_outcome_target_budget(...)` currently samples through an internal RNG, so Phase 1 cannot require a seeded exact output sequence from that function. Baseline tests here must assert stable invariants such as bounds and fail-closed behavior, not exact sample values or distribution shape. Distribution-quality assertions belong in PR-F once a deterministic seam exists or when tests force deterministic config such as `floor == ceiling`.

The existing 37 masking test files cover specific attack scenarios but don't lock the **high-level behavioral contracts** that all subsequent PRs must preserve:

```
// Positive: mask_outcome_target_budget returns a Duration within
// [floor_ms, ceiling_ms] when normalization is enabled.
// This is the core anti-fingerprinting timing envelope.
masking_baseline_timing_normalization_budget_within_bounds

// Positive: handle_bad_client with mask=true connects to the configured
// mask_host and forwards initial_data verbatim. Verifies the proxy
// correctly impersonates a legitimate website by relaying to the real backend.
masking_baseline_fallback_relays_to_mask_host

// Security: mask_outcome_target_budget with timing_normalization_enabled=false
// returns the default masking budget (MASK_TIMEOUT), preserving legacy timing posture.
masking_baseline_no_normalization_returns_default_budget

// Adversarial: mask_host is unreachable (connection refused).
// handle_bad_client must not panic and must fail closed (silent close or
// generic transport error), without proxy-identifying response bytes.
masking_baseline_unreachable_mask_host_silent_failure

// Light fuzz: deterministic malformed initial_data corpus (length extremes,
// random binary, invalid UTF-8) must never panic.
masking_baseline_light_fuzz_initial_data_no_panic
```

Oracle requirements (mandatory):
- `masking_baseline_timing_normalization_budget_within_bounds`: assert every sampled budget satisfies `floor <= budget <= ceiling` across a fixed-size repeated sample loop. Do not require a seeded exact sequence from the current implementation.
- `masking_baseline_fallback_relays_to_mask_host`: assert exact byte preservation for forwarded `initial_data` and backend response relay to client.
- `masking_baseline_no_normalization_returns_default_budget`: assert exact default budget (`MASK_TIMEOUT`).
- `masking_baseline_unreachable_mask_host_silent_failure`: assert no proxy-identifying bytes are written to client and completion remains bounded.
- `masking_baseline_light_fuzz_initial_data_no_panic`: fixed malformed corpus only; assert no panic, bounded runtime per case, and no identity leak.

De-duplication note:
- Existing masking suites already cover half-close lifecycle and bounded offline fallback timing (`masking_self_target_loop_security_tests.rs`, `masking_adversarial_tests.rs`, `masking_relay_guardrails_security_tests.rs`).
- Existing masking suites already cover strict byte-cap enforcement and cap overshoot regression (`masking_production_cap_regression_security_tests.rs`) plus broader close/failure matrices (`masking_connect_failure_close_matrix_security_tests.rs`).
- Phase 1 baseline masking tests therefore focus on top-level contracts (timing envelope bounds, fallback posture, unreachable-backend fail-closed behavior, light malformed-input robustness), not re-testing transport choreography already covered elsewhere.

#### PR-A.2 Merge gate

All tests pass on current code:
```
cargo test -- relay_baseline_
cargo test -- handshake_baseline_
cargo test -- middle_relay_baseline_
cargo test -- masking_baseline_
cargo test -- --test-threads=1
cargo test -- --test-threads=32
cargo test  # full suite — no regressions
```

Notes:
- `--test-threads=1` catches hidden ordering assumptions.
- `--test-threads=32` catches shared-state bleed and race-sensitive flakes.
- Heavy stress scenarios that are too expensive for default CI must be marked `#[ignore]` and run in dedicated security/perf pipelines, never deleted.
- Each adversarial baseline test must have an explicit upper runtime bound to keep CI deterministic.
- Any assertion that depends on wall-clock variance must use bounded ranges and paused time where applicable; exact wall-clock equality checks are forbidden.

Phase 1 ASVS L2 alignment focus (test intent mapping):
- V1.2 / V1.4: fail-closed behavior and concurrency isolation under adversarial probe traffic.
- V7.4: cryptographic/protocol error handling does not leak identifying behavior.
- V9.1: communication behavior under malformed input is deterministic, bounded, and non-panicking.
- V13.2: degradation paths (fallback/masking) preserve security posture and do not disclose gateway identity.

---

### Critical Review Issues Found and Addressed in PR-A

| # | Severity | Issue from critique | Resolution |
|---|---|---|---|
| 1 | **Critical** | `test_harness_common.rs` has no valid declaration site; triple `#[path]` causes duplicate symbols | Declared once in `proxy/mod.rs`; consuming tests import via `use crate::proxy::test_harness_common::*` |
| 2 | **High** | `RecordingWriter` semantics ambiguous; flush-boundary tracking missing for DRS tests | Dual tracking: `writes` (per poll_write) + `flushed` (per poll_flush boundary with accumulator) |
| 3 | **High** | `SliceReader` unnecessarily requires `bytes` crate | **Dropped**. `tokio::io::duplex()` and `std::io::Cursor` already solve this |
| 4 | **Medium** | `PendingWriter` only controls `poll_write`; flush pending tests need separate control | Renamed to `PendingCountWriter` with separate `write_pending_remaining` and `flush_pending_remaining` |
| 5 | **Critical** | Baseline tests duplicate existing tests; `watchdog_delta` wraparound test trivially green | Watchdog delta baseline **dropped** (7 existing tests in `relay_watchdog_delta_security_tests.rs` cover it exhaustively). All other baselines audited against 104 existing test files. |
| 6 | **High** | Handshake baseline tests require complex scaffold not provided by `tls_only_config()` | Added `handshake_test_config(secret_hex)` builder with user, secret, auth settings, and masking config |
| 7 | **Medium** | `test_stats()` / `test_buffer_pool()` are trivial wrappers | **Dropped**. `Arc::new(Stats::new())` and `Arc::new(BufferPool::new())` are one-liners, universally inlined already |
| 8 | **High** | Middle relay baseline tests lock on global statics; PR-B removes them → guaranteed breakage | Tests call public functions (`mark_relay_idle_candidate`, `clear_relay_idle_candidate`) not statics. PR-B changes implementations, not function signatures. |
| 9 | **Medium** | `seeded_rng` returns `StdRng`, can't substitute for `SecureRandom` | Documented as explicit limitation in code comment |
| 10 | **Medium** | No test isolation strategy for auth_probe global state | Each handshake baseline test acquires `auth_probe_test_lock()` and calls `clear_auth_probe_state_for_testing()`. Documented as temporary coupling. |
| 11 | **Low** | "configured threshold" misnomer for compile-time constant | Renamed to `handshake_baseline_saturation_fires_at_compile_time_threshold` |
| 12 | **High** | Zero error-path regression locks in baseline suite | Added: `relay_baseline_both_sides_close_simultaneously_no_panic`, `relay_baseline_broken_pipe_midtransfer_returns_error` |
| 13 | **Medium** | `relay_baseline_empty_transfer_completes_without_error` is vague | Replaced with: `relay_baseline_zero_bytes_returns_ok_and_counters_zero` (sharp assertion) |
| 14 | **Medium** | No masking.rs baseline tests despite PR-F modifying masking | Added `masking_baseline_invariant_tests.rs` with timing/fallback/cap/adversarial tests |
| NEW-1 | **High** | PR-A text could be read as violating global TDD "red first" rule | Clarified Phase 1 as characterization-only; red-first remains mandatory for all behavior-changing phases |
| NEW-2 | **Medium** | "No production code changes" wording conflicts with required `#[cfg(test)]` module wiring | Corrected scope statement to "No runtime behavior changes" |
| NEW-3 | **High** | Fail-closed requirement was implicit, allowing weak "no panic"-only assertions | Added explicit fail-closed assertion policy for anti-probing paths |
| NEW-4 | **High** | Timing and network-path baselines risk CI flakiness/deadlocks | Added deterministic timeout and paused-time requirements |
| NEW-5 | **Medium** | Several proposed baselines duplicated existing relay/middle-relay/handshake coverage | Pruned duplicate cases (relay quota cutoff, relay half-close, unknown-SNI warn rate-limit) and reduced middle-relay baseline to API-contract-only tests |
| NEW-6 | **High** | Relay inactivity oracle ignored `WATCHDOG_INTERVAL`, making the timeout assertion architecturally wrong | Rewrote the oracle around paused-time advancement past `ACTIVITY_TIMEOUT + WATCHDOG_INTERVAL` |
| NEW-7 | **High** | Handshake baselines conflated `HandshakeResult::BadClient` with downstream masking relay behavior | Separated handshake-layer classification assertions from masking/client-layer fallback IO assertions |
| NEW-8 | **High** | Handshake "backoff delay" wording conflated auth-probe state tracking with wire-visible sleep latency | Re-scoped the baseline to throttle-window semantics and deferred client-visible delay checks to an explicit async entrypoint test |
| NEW-9 | **Medium** | Masking timing determinism requirement overstated what the current internal-RNG API can guarantee | Limited Phase 1 masking timing assertions to invariant bounds instead of seeded exact sequences |
| NEW-10 | **Medium** | Middle-relay isolation guidance omitted `desync_dedup_test_lock()`, leaving desync tests underspecified | Split idle-registry and desync-dedup isolation requirements by helper/lock |
| NEW-11 | **Medium** | Masking baseline list still carried redundant cases already covered by dedicated cap and close-matrix suites | Pruned duplicate cap/empty-input/partial-close baseline cases from mandatory Phase 1 scope |

---

## PR-B — Item 2: Dependency Injection for Global Proxy State

**Priority**: High. Blocks PR-D. (PR-C and PR-F are independent — see D1 below.)

**TDD compatibility note**: PR-B cannot start with red tests that reference a non-existent `ProxySharedState` API, because that would fail at compile time rather than exposing the current runtime bug. Split PR-B into:
- **PR-B.0 (seam only, green)**: add `shared_state.rs`, define `ProxySharedState`, and thread an instance parameter through the call chain without changing storage semantics yet.
- **PR-B.1 (red)**: add isolation tests against the new seam; they must compile and fail on then-current code because the seam still routes into global state.
- **PR-B.2 (green)**: cut storage over from globals to per-instance state, then remove global reset/lock helpers.

This keeps red-first TDD for the behavior change while allowing the minimum compile-time scaffolding needed to express the tests.

### Problem (concrete)

The **core blocker set** is the 12 handshake and middle-relay statics below. These are logically scoped to one running proxy instance but currently live at process scope, which forces test serialization and prevents two proxy instances in one process from remaining isolated:

| Static | File | Line | Type |
|---|---|---|---|
| `AUTH_PROBE_STATE` | `src/proxy/handshake.rs` | 52 | `OnceLock<DashMap<IpAddr, AuthProbeState>>` |
| `AUTH_PROBE_SATURATION_STATE` | `src/proxy/handshake.rs` | 53 | `OnceLock<Mutex<Option<AuthProbeSaturationState>>>` |
| `AUTH_PROBE_EVICTION_HASHER` | `src/proxy/handshake.rs` | 55 | `OnceLock<RandomState>` |
| `INVALID_SECRET_WARNED` | `src/proxy/handshake.rs` | 33 | `OnceLock<Mutex<HashSet<(String, String)>>>` |
| `UNKNOWN_SNI_WARN_NEXT_ALLOWED` | `src/proxy/handshake.rs` | 39 | `OnceLock<Mutex<Option<Instant>>>` |
| `DESYNC_DEDUP` | `src/proxy/middle_relay.rs` | 54 | `OnceLock<DashMap<u64, Instant>>` |
| `DESYNC_DEDUP_PREVIOUS` | `src/proxy/middle_relay.rs` | 55 | `OnceLock<DashMap<u64, Instant>>` |
| `DESYNC_HASHER` | `src/proxy/middle_relay.rs` | 56 | `OnceLock<RandomState>` |
| `DESYNC_FULL_CACHE_LAST_EMIT_AT` | `src/proxy/middle_relay.rs` | 57 | `OnceLock<Mutex<Option<Instant>>>` |
| `DESYNC_DEDUP_ROTATION_STATE` | `src/proxy/middle_relay.rs` | 58 | `OnceLock<Mutex<DesyncDedupRotationState>>` |
| `RELAY_IDLE_CANDIDATE_REGISTRY` | `src/proxy/middle_relay.rs` | 61 | `OnceLock<Mutex<RelayIdleCandidateRegistry>>` |
| `RELAY_IDLE_MARK_SEQ` | `src/proxy/middle_relay.rs` | 62 | `AtomicU64` (direct static) |

**Explicitly out of core PR-B scope**:
- `USER_PROFILES` in `adaptive_buffers.rs` stays process-global for PR-D cross-session memory. It must **not** be counted as a per-instance DI blocker for PR-B.
- `LOGGED_UNKNOWN_DCS` in `direct_relay.rs` and the warning-dedup `AtomicBool` statics in `client.rs` are ancillary diagnostics caches, not core handshake/relay isolation state. Keep them for a follow-up consistency PR after the handshake and middle-relay cutover lands.

These force a large body of tests to use `auth_probe_test_lock()`, `relay_idle_pressure_test_scope()`, and `desync_dedup_test_lock()` to stay deterministic. The current branch also has tests that read `AUTH_PROBE_STATE` and `DESYNC_DEDUP` directly, so the migration scope is larger than helper removal alone.

### Step 1: Add seam, then write red tests (must fail on then-current code)

**Important sequencing correction**: red tests for PR-B must be written **after** the non-behavioral seam from PR-B.0 exists, otherwise they cannot compile. They still remain red-first for the actual behavior change because the seam initially points to the old globals.

**New file**: `src/proxy/tests/proxy_shared_state_isolation_tests.rs`
Declared in `src/proxy/mod.rs` via a single `#[cfg(test)] #[path = "tests/proxy_shared_state_isolation_tests.rs"] mod proxy_shared_state_isolation_tests;` declaration. **Do NOT declare in both handshake.rs and middle_relay.rs** — including the same file via `#[path]` in two modules duplicates all definitions and causes compilation errors.

**TEST SCOPE**: These tests cover only the handshake and middle-relay state being migrated in core PR-B. Do not mix in `direct_relay.rs` unknown-DC logging or `client.rs` warning-dedup behavior here.

```
// Fails because AUTH_PROBE_STATE is global — second instance shares first's state.
proxy_shared_state_two_instances_do_not_share_auth_probe_state
// Fails because DESYNC_DEDUP is global.
proxy_shared_state_two_instances_do_not_share_desync_dedup
// Fails because RELAY_IDLE_CANDIDATE_REGISTRY is global.
proxy_shared_state_two_instances_do_not_share_idle_registry
// Fails: resetting state in instance A must not affect instance B.
proxy_shared_state_reset_in_one_instance_does_not_affect_another
// Fails: parallel tests increment the same IP counter in AUTH_PROBE_STATE.
proxy_shared_state_parallel_auth_probe_updates_stay_per_instance
// Fails: desync rotation in instance A must not advance rotation state of instance B.
proxy_shared_state_desync_window_rotation_is_per_instance
// Fails: idle seq counter is global AtomicU64, shared between instances.
proxy_shared_state_idle_mark_seq_is_per_instance
// Adversarial: attacker floods auth probe state in "proxy A" must not exhaust probe
// budget of unrelated "proxy B" sharing the process.
proxy_shared_state_auth_saturation_does_not_bleed_across_instances
```

**DROP from mandatory core PR-B**:
- `proxy_shared_state_poisoned_mutex_in_one_instance_does_not_panic_other`. This is too implementation-coupled for the initial red phase and is better expressed as targeted unit tests once per-instance lock recovery helpers exist. The core risk is cross-instance state bleed, not synthetic poisoning choreography.

**New file**: `src/proxy/tests/proxy_shared_state_parallel_execution_tests.rs`

```
// Spawns 50 concurrent auth-probe updates against distinct ProxySharedState instances,
// asserts each instance's counter matches exactly what it received (no cross-talk).
proxy_shared_state_50_concurrent_instances_no_counter_bleed
// Desync dedup: 20 concurrent instances each performing window rotation,
// asserts rotation state is per-instance and not double-rotated.
proxy_shared_state_desync_rotation_concurrent_20_instances
// Idle registry: 10 concurrent mark+evict cycles across isolated instances,
// asserts no cross-eviction.
proxy_shared_state_idle_registry_concurrent_10_instances
```

### Step 2: Implement `ProxySharedState`

**New file**: `src/proxy/shared_state.rs`

**MUTEX TYPE**: All `Mutex` fields below are `std::sync::Mutex`, NOT `tokio::sync::Mutex`. The current codebase uses `std::sync::Mutex` for all these statics, and all critical sections are short (insert/get/retain) with no await points inside. Per Architecture.md §5: "Never hold a lock across an `await` unless atomicity explicitly requires it." Using `std::sync::Mutex` is correct here because:
1. Lock hold times are bounded (microseconds for DashMap/HashSet operations)
2. No `.await` is called while holding any of these locks
3. `tokio::sync::Mutex` would add unnecessary overhead for these synchronous operations

```rust
use std::sync::Mutex; // NOT tokio::sync::Mutex — see note above

pub struct HandshakeSharedState {
    pub auth_probe: DashMap<IpAddr, AuthProbeState>,
    pub auth_probe_saturation: Mutex<Option<AuthProbeSaturationState>>,
    pub auth_probe_eviction_hasher: RandomState,
    pub invalid_secret_warned: Mutex<HashSet<(String, String)>>,
    pub unknown_sni_warn_next_allowed: Mutex<Option<Instant>>,
}

pub struct MiddleRelaySharedState {
    pub desync_dedup: DashMap<u64, Instant>,
    pub desync_dedup_previous: DashMap<u64, Instant>,
    pub desync_hasher: RandomState,
    pub desync_full_cache_last_emit_at: Mutex<Option<Instant>>,
    pub desync_dedup_rotation_state: Mutex<DesyncDedupRotationState>,
    pub relay_idle_registry: Mutex<RelayIdleCandidateRegistry>,
    // Monotonic counter; kept as AtomicU64 inside the struct, not a global.
    pub relay_idle_mark_seq: AtomicU64,
}

pub struct ProxySharedState {
    pub handshake: HandshakeSharedState,
    pub middle_relay: MiddleRelaySharedState,
}

impl ProxySharedState {
    pub fn new() -> Arc<Self> { ... }
}
```

Declare `pub mod shared_state;` in `src/proxy/mod.rs` between lines 61–69.

`ProxySharedState` is architecturally: state that (a) must survive across multiple concurrent connections, (b) is logically scoped to one running proxy instance, not the whole process. Aligns with Architecture.md §3.1 Singleton rule: "pass shared state explicitly via `Arc<T>`."

**Scope correction**: `ProxySharedState` in core PR-B should contain only handshake and middle-relay shared state. Do **not** add `adaptive_buffers::USER_PROFILES` here.

### Step 3: Thread `Arc<ProxySharedState>` through the call chain

**`src/proxy/handshake.rs`**

Current signature of `handle_tls_handshake` (line 690):
```rust
pub async fn handle_tls_handshake<R, W>(
    handshake: &[u8],
    reader: R,
    mut writer: W,
    peer: SocketAddr,
    config: &ProxyConfig,
    replay_checker: &ReplayChecker,
    rng: &SecureRandom,
    tls_cache: Option<Arc<TlsFrontCache>>,
) -> HandshakeResult<...>
```

New signature — add one parameter at the end:
```rust
    shared: &ProxySharedState,  // ← add as last parameter
```

Current signature of `handle_mtproto_handshake` (line 854): same pattern — add `shared: &ProxySharedState` as last parameter.

All internal calls to `auth_probe_state_map()`, `auth_probe_saturation_state()`, `warn_invalid_secret_once()`, `unknown_sni_warn_state_lock()` are replaced with direct field access on `&shared.handshake`. The five accessor functions (`auth_probe_state_map`, `auth_probe_saturation_state`, `unknown_sni_warn_state_lock`) are deleted.

**`src/proxy/middle_relay.rs`**

Current signature of `handle_via_middle_proxy` (line 695):
```rust
pub(crate) async fn handle_via_middle_proxy<R, W>(
    mut crypto_reader: CryptoReader<R>,
    crypto_writer: CryptoWriter<W>,
    success: HandshakeSuccess,
    me_pool: Arc<MePool>,
    stats: Arc<Stats>,
    config: Arc<ProxyConfig>,
    buffer_pool: Arc<BufferPool>,
    local_addr: SocketAddr,
    rng: Arc<SecureRandom>,
    mut route_rx: watch::Receiver<RouteCutoverState>,
    route_snapshot: RouteCutoverState,
    session_id: u64,
) -> Result<()>
```

New signature — add `shared: Arc<ProxySharedState>` after `session_id: u64`. All `RELAY_IDLE_CANDIDATE_REGISTRY`, `DESYNC_DEDUP`, etc. accesses replaced with `shared.middle_relay.*`. `relay_idle_candidate_registry()` accessor deleted.

**`src/proxy/client.rs`**

The call site of `handle_tls_handshake` (line ~553) and `handle_via_middle_proxy` (line ~1289) must pass the `Arc<ProxySharedState>` that is constructed once in the main startup path and passed down. Locate the top-level `handle_client_stream` function (line 317) and add `shared: Arc<ProxySharedState>` to its parameters, then thread through.

`handle_authenticated_static(...)` also needs `shared: Arc<ProxySharedState>` because it dispatches to the middle-relay path after the handshake.

**Construction site correction**: the current connection task spawn lives in `src/maestro/listeners.rs`, not `src/maestro/mod.rs` or `src/startup.rs`. Construct one `Arc<ProxySharedState>` alongside the other long-lived listener resources and clone it into each `handle_client_stream(...)` task. Do **not** create a fresh shared-state instance per accepted connection.

**Scope correction**: `handle_via_direct(...)` stays unchanged in core PR-B unless the ancillary `direct_relay.rs` unknown-DC dedup migration is explicitly pulled into scope.

### Step 4: Remove test helpers and migrate test files

After production code passes all new tests, remove the **global reset/lock helpers** for the migrated handshake and middle-relay state. Do **not** blindly delete every test accessor. Prefer converting narrow query helpers into instance-scoped helpers when they preserve test decoupling from internal map layout.

Delete or replace these handshake/middle-relay globals:
- `auth_probe_test_lock()`
- `unknown_sni_warn_test_lock()`
- `warned_secrets_test_lock()`
- `relay_idle_pressure_test_scope()`
- `desync_dedup_test_lock()`
- global reset helpers that only exist to wipe process-wide state between tests

Prefer converting, not deleting outright:
- `auth_probe_fail_streak_for_testing(...)`
- `auth_probe_is_throttled_for_testing(...)`
- similar narrow read-only helpers that can become `..._for_testing(shared, ...)`

**Blast-radius correction**: this migration affects more than the helper users listed in the original draft. The current branch has many handshake and middle-relay tests that read `AUTH_PROBE_STATE` or `DESYNC_DEDUP` directly. Those tests must be migrated off raw statics before the statics are removed.

Ancillary `direct_relay.rs` helpers such as `unknown_dc_test_lock()` remain out of scope unless that follow-up consistency migration is explicitly included.

No global `Mutex<()>` test locks remain **for the migrated handshake/middle-relay state** after this PR. Do not overstate this as a repository-wide guarantee while ancillary globals still exist elsewhere.

### Merge gate

```
cargo check --tests
cargo test -- proxy_shared_state_
cargo test -- handshake_
cargo test -- middle_relay_
cargo test -- client_
cargo test -- --test-threads=1
cargo test -- --test-threads=32
```
All must pass. No existing test may fail. The thread-count runs are mandatory here because PR-B's entire purpose is eliminating hidden cross-test and cross-instance state bleed.

---

## PR-C — Item 5: Dynamic Record Sizing (DRS) for the TLS Relay Path

**Priority**: High (anti-censorship, TLS-mode only).

**TDD note for PR-C**: Red tests in this phase must fail because DRS behavior is absent, not because APIs are temporarily broken. Keep baseline relay API compatibility where practical so failures remain behavioral, not compile-surface churn.

**SCOPE LIMITATION**: This PR covers the **direct relay path only** (`direct_relay.rs` → `relay_bidirectional`). The **middle relay path** (`middle_relay.rs` → explicit ME→client flush loop) is not addressed. Since middle relay is the default when ME URLs are configured, this represents a **significant coverage gap** for those deployments. Future follow-up (PR-C.1): add DRS shaping to the middle relay's explicit flush loop. This is architecturally simpler (natural flush tick points exist) and should be prioritized immediately after PR-C.

### Problem (concrete)

`src/proxy/relay.rs` line 563:
```rust
result = copy_bidirectional_with_sizes(
    &mut client,    // client = StatsIo<CombinedStream<CryptoReader, CryptoWriter>>
    &mut server,
    c2s_buf_size.max(1),
    s2c_buf_size.max(1),
) => Some(result),
```

`client` is a `StatsIo` wrapping a `CombinedStream`. The write half of `client` (the path sending data *to* the real client) has no TLS record framing control. TLS record sizes observed by DPI are determined by tokio's internal copy buffer size — a single constant that produces a recognizable signature absent from real browser TLS sessions.

The previous draft had three bugs (now fixed here):
1. Used 1450 byte payload → creates 1471-byte framed records → TCP splits into `[1460, 11]` signature. **Correct value: 1369 bytes.**
2. Incremented `records_completed` on every `poll_write` call, not only when a record boundary is crossed. **Fix: track `bytes_in_current_record`; only increment when a flush completes.**
3. Returned `Poll::Pending` with `wake_by_ref()` after a flush completed, causing an immediate spurious reschedule. **Fix: use `ready!` macro and `continue` in a loop — no yield between a completed flush and the next write.**

### Step 1: Write red tests (must fail on current code)

**New file**: `src/proxy/tests/drs_writer_unit_tests.rs`
Declared in `src/proxy/relay.rs`.

```
// Positive: bytes emitted to inner writer arrive in records of exactly
// target_record_size(0..=39) = 1369 before flush, then 4096, then 16384.
drs_first_40_records_are_1369_bytes_payload_each
drs_records_41_to_60_are_4096_bytes_payload_each
drs_records_above_60_are_16384_bytes_payload_each

// Boundary/edge: a write of 1 byte completes correctly and counts toward
// bytes_in_current_record without incrementing records_completed prematurely.
drs_single_byte_write_does_not_prematurely_complete_record
// Edge: write of exactly 1369 bytes fills one record; next poll_write triggers flush.
drs_write_equal_to_record_size_requires_second_poll_for_flush
// Edge: TWO sequential poll_write calls, each crossing one record boundary,
// produce exactly two separate flushes (can't flush twice in single poll).
drs_two_sequential_writes_cross_boundary_each_produces_one_flush
// Edge: empty slice write returns Ok(0) immediately without touching inner.
drs_empty_write_returns_zero_does_not_touch_inner
// Edge: poll_shutdown delegates to inner and does not flush records.
drs_shutdown_delegates_to_inner

// Adversarial: inner writer returns Pending on first 5 poll_write calls.
// DrsWriter must not loop-busy-poll and must not increment records_completed.
drs_pending_on_write_does_not_increment_completed_counter
// Adversarial: inner flush returns Pending. DrsWriter must propagate Pending
// without calling wake_by_ref (verified by checking waker was not called).
drs_pending_on_flush_propagates_pending_without_spurious_wake
// Adversarial: 10001 consecutive 1-byte writes; verify records_completed
// count matches expected record boundaries, no off-by-one.
drs_10001_single_byte_writes_records_count_exact

// Stress: bounded concurrent DrsWriter instances each writing deterministic
// payloads; assert total flushed bytes equals total written bytes.
// Large-scale variants belong in ignored perf/security jobs, not default CI.
drs_concurrent_instances_no_data_loss

// Security/anti-DPI: collect sizes of all records produced by writing 100 KB
// through DrsWriter; assert no record with size > 1369 appears in first 40.
// This is the packet-shape non-regression test.
drs_first_records_do_not_exceed_mss_safe_payload_size
// Security: non-TLS passthrough path produces no DrsWriter wrapping;
// assert that when is_tls=false the relay produces no record-size shaping.
drs_passthrough_when_not_tls_no_record_shaping

// Overflow hardening: records_completed saturates at final phase and never
// re-enters phase 1 after saturation.
drs_records_completed_counter_does_not_wrap

// Integration: StatsIo byte counters match actual bytes received by inner writer
// when DrsWriter limits write sizes (no data loss or double-counting).
drs_statsio_byte_count_matches_actual_written

// Integration: copy loop handles partial writes at record boundaries without
// data loss or duplication.
drs_copy_loop_partial_write_retry
```

**CI policy for this file**:
- Keep default-suite tests deterministic and bounded in runtime and memory.
- Any high-cardinality stress profile (for example 1000 writers x 1 MB) must be marked ignored and run only in dedicated perf/security pipelines.

**New file**: `src/proxy/tests/drs_integration_tests.rs`
Declared in `src/proxy/relay.rs`.

```
// Integration: relay_bidirectional with DRS enabled (is_tls=true) produces
// records ≤ 1369 bytes in payload size for the first 40 records to the client.
drs_relay_bidirectional_tls_first_records_bounded
// Integration: relay_bidirectional with is_tls=false produces no DrsWriter
// overhead (records sized by c2s_buf_size only).
drs_relay_bidirectional_non_tls_no_drs_overhead
// Integration: relay completes normally with DRS enabled; final byte count
// matches input byte count (no loss or duplication).
drs_relay_bidirectional_tls_no_data_loss_end_to_end

// Integration: verify FakeTlsWriter.poll_flush produces a TLS record boundary,
// not a no-op. Otherwise DRS shaping provides no anti-DPI value.
drs_flush_is_meaningful_for_faketls
```

### Step 2: Implement `DrsWriter`

**New file**: `src/proxy/drs_writer.rs`

Declare `pub(crate) mod drs_writer;` in `src/proxy/mod.rs`.

```rust
pub(crate) struct DrsWriter<W> {
    inner: W,
    bytes_in_current_record: usize,
    // Capped at DRS_PHASE_FINAL (60) to prevent overflow on long-lived connections.
    // On 32-bit platforms, an uncapped usize would wrap after ~4 billion records,
    // restarting the DRS ramp — a detectable signature.
    records_completed: usize,
}

const DRS_PHASE_1_END: usize = 40;
const DRS_PHASE_2_END: usize = 60;
const DRS_PHASE_FINAL: usize = DRS_PHASE_2_END;
// Safe payload for one MSS with TCP-options headroom.
// FakeTLS overhead in THIS proxy: 5 bytes (TLS record header only).
// NOTE: Unlike real TLS 1.3, FakeTlsWriter does NOT add a content-type byte
// or AEAD tag. Real TLS 1.3 overhead would be 22 bytes (5 + 1 + 16).
// We size for the FakeTLS overhead: record on wire = 1369 + 5 = 1374 bytes.
// MSS = 1460 (MTU 1500 - 40 IP+TCP); with TCP timestamps (~12 bytes)
// effective MSS ≈ 1448, leaving 74 bytes margin for path MTU variance (PPPoE, VPN).
// The value 1369 is intentionally conservative to accommodate future FakeTLS
// upgrades that may add AEAD or padding overhead.
const DRS_MSS_SAFE_PAYLOAD: usize = 1_369;
const DRS_PHASE_2_PAYLOAD: usize = 4_096;
// NOTE: FakeTlsWriter uses MAX_TLS_CIPHERTEXT_SIZE = 16_640 as its max payload.
// DRS caps at 16_384 (RFC 8446 TLS 1.3 plaintext limit). This means DRS still
// shapes records in steady-state by limiting to 16_384 instead of 16_640.
// This is intentional: real TLS 1.3 servers cap at 16_384 plaintext bytes per
// record, so DRS mimics that limit even though FakeTLS allows larger records.
const DRS_FULL_RECORD_PAYLOAD: usize = 16_384;

impl<W> DrsWriter<W> {
    pub(crate) fn new(inner: W) -> Self {
        Self { inner, bytes_in_current_record: 0, records_completed: 0 }
    }

    fn target_record_size(&self) -> usize {
        match self.records_completed {
            0..DRS_PHASE_1_END  => DRS_MSS_SAFE_PAYLOAD,
            DRS_PHASE_1_END..DRS_PHASE_2_END => DRS_PHASE_2_PAYLOAD,
            _ => DRS_FULL_RECORD_PAYLOAD,
        }
    }
}

impl<W: AsyncWrite + Unpin> AsyncWrite for DrsWriter<W> {
    fn poll_write(mut self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &[u8]) -> Poll<io::Result<usize>> {
        if buf.is_empty() { return Poll::Ready(Ok(0)); }
        loop {
            let target = self.target_record_size();
            let remaining = target.saturating_sub(self.bytes_in_current_record);
            if remaining == 0 {
                // Record boundary reached — flush before starting the next record.
                ready!(Pin::new(&mut self.inner).poll_flush(cx))?;
                // Cap at DRS_PHASE_FINAL to prevent usize overflow on long-lived connections.
                self.records_completed = self.records_completed.saturating_add(1).min(DRS_PHASE_FINAL + 1);
                self.bytes_in_current_record = 0;
                continue;
            }
            let limit = buf.len().min(remaining);
            let n = ready!(Pin::new(&mut self.inner).poll_write(cx, &buf[..limit]))?;
            self.bytes_in_current_record += n;
            return Poll::Ready(Ok(n));
        }
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}
```

**State integrity requirement**: `bytes_in_current_record` must be incremented by the number of bytes actually accepted by inner writer (`n`), not requested length. This preserves correctness under partial writes.

**Pending behavior requirement**: if inner `poll_write` or `poll_flush` returns `Pending`, propagate `Pending` without manual `wake_by_ref` calls in DRS, relying on inner writer wake semantics.

### Step 3: Wire into relay path with compatibility

**`src/proxy/relay.rs`** — `relay_bidirectional` currently (line 456):

```rust
pub async fn relay_bidirectional<CR, CW, SR, SW>(
    client_reader: CR,
    client_writer: CW,
    ...
    _buffer_pool: Arc<BufferPool>,  // unchanged at this stage
) -> Result<()>
```

**Compatibility correction**: Do not force a signature break on `relay_bidirectional(...)` for all existing tests/callers. Prefer one of:
- add `relay_bidirectional_with_opts(...)` and keep `relay_bidirectional(...)` as a passthrough wrapper with defaults; or
- introduce a small options struct with a defaulted constructor and keep a compatibility wrapper.

This prevents unrelated relay and masking suites from becoming compile-red due to API churn and keeps PR-C failures focused on DRS behavior.

Inside the function body, where `CombinedStream::new(client_reader, client_writer)` constructs the client combined stream (line ~481), wrap the write half conditionally with a `MaybeDrs` enum:

**ARCHITECTURE NOTE — write-side placement**: `DrsWriter` wraps the **raw** `client_writer` *before* it enters `CombinedStream`, which is then wrapped by `StatsIo`. The resulting call chain on S→C writes is:

```
copy_bidirectional_with_sizes
  → StatsIo.poll_write (counts bytes, quota accounting)
    → CombinedStream.poll_write
      → MaybeDrs.poll_write
        → DrsWriter.poll_write
          → CryptoWriter.poll_write (AES-CTR encryption, may buffer internally)
            → FakeTlsWriter.poll_write (wraps into TLS record with 5-byte header)
              → TCP socket
```

This is correct because:
1. `StatsIo` sees the actual bytes being written (DrsWriter doesn't change byte count, only limits write sizes and triggers flushes). `StatsIo.poll_write` counts the return value of CombinedStream.poll_write, which equals DrsWriter's return value — the actual bytes accepted.
2. **CryptoWriter buffering interaction**: CryptoWriter.poll_write encrypts and MAY buffer internally (PendingCiphertext) if FakeTlsWriter returns Pending. Crucially, CryptoWriter **always returns Ok(to_accept)** even when buffering — it never returns Pending unless its internal buffer is full. This means DrsWriter's `bytes_in_current_record` tracking is accurate; CryptoWriter accepts the full limited amount.
3. **DRS flush drains the CryptoWriter→FakeTLS→socket chain**: `DrsWriter.poll_flush` → `CryptoWriter.poll_flush` (drains pending ciphertext to FakeTlsWriter) → `FakeTlsWriter.poll_flush` (drains pending TLS record data to socket) → `socket.poll_flush`. This is what enforces TLS record boundaries on the wire. Without the flush, CryptoWriter could batch multiple DRS "records" into one FakeTLS record, defeating the purpose.
4. `copy_bidirectional_with_sizes` also calls `poll_flush` on its own schedule; double-flush is safe (idempotent on all three layers) but adds minor syscall overhead.
5. `copy_bidirectional_with_sizes`'s internal S→C buffer will be partially consumed per poll_write (DrsWriter may accept fewer bytes than offered). This is the intended mechanism — the copy loop retries with the remaining buffer.

**IMPORTANT**: Add a red test `drs_statsio_byte_count_matches_actual_written` to verify that `StatsIo` byte counters exactly match the total bytes the inner socket received. Without this, a bug where DrsWriter eats or duplicates bytes would go undetected.

```rust
enum MaybeDrs<W> {
    Passthrough(W),
    Shaping(DrsWriter<W>),
}

impl<W: AsyncWrite + Unpin> AsyncWrite for MaybeDrs<W> {
    fn poll_write(mut self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &[u8]) -> Poll<io::Result<usize>> {
        match self.get_mut() {
            MaybeDrs::Passthrough(w) => Pin::new(w).poll_write(cx, buf),
            MaybeDrs::Shaping(w) => Pin::new(w).poll_write(cx, buf),
        }
    }
    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        match self.get_mut() {
            MaybeDrs::Passthrough(w) => Pin::new(w).poll_flush(cx),
            MaybeDrs::Shaping(w) => Pin::new(w).poll_flush(cx),
        }
    }
    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        match self.get_mut() {
            MaybeDrs::Passthrough(w) => Pin::new(w).poll_shutdown(cx),
            MaybeDrs::Shaping(w) => Pin::new(w).poll_shutdown(cx),
        }
    }
}

let writer = if opts.is_tls && opts.drs_enabled {
    MaybeDrs::Shaping(DrsWriter::new(client_writer))
} else {
    MaybeDrs::Passthrough(client_writer)
};
let client = StatsIo::new(CombinedStream::new(client_reader, writer), ...);
```

**PERFORMANCE NOTE**: The `MaybeDrs::Passthrough` variant adds a single enum match dispatch per `poll_write`/`poll_flush`/`poll_shutdown` call (~3-5 cycles on modern CPUs with branch prediction, negligible for TLS overhead). This is acceptable for correctness. Do not attempt zero-overhead abstractions with generic specialization here; the dispatch overhead is unmeasurable relative to the underlying TLS crypto and I/O.

**`src/proxy/direct_relay.rs`** — direct path call site:
Pass DRS options only from direct relay dispatch (`is_tls = success.is_tls`, `drs_enabled = config.general.drs_enabled && success.is_tls`).

**Scope guard**: leave middle-relay call choreography untouched in this PR; this is a direct-path-only phase.

### Step 5: Add `drs_enabled` config flag

**`src/config/types.rs`** — inside `GeneralConfig` struct (existing struct, find existing `direct_relay_copy_buf_*` fields around line 507):

```rust
// Controls Dynamic Record Sizing on the direct TLS relay path.
// Safe to disable for debugging; default true when tls mode is active.
#[serde(default = "default_true")]
pub drs_enabled: bool,
```

**IMPORTANT — serde compatibility**: New config fields in this PR must have `#[serde(default = "...")]` annotations. Without these, existing config files that lack the fields will fail to deserialize, breaking upgrades. For PR-C this applies to `drs_enabled`.

Cross-phase note:
- `ipt_enabled` and `ipt_level` belong to later IPT phases; keep them out of PR-C to limit blast radius.

Add helpers as needed:
```rust
fn default_true() -> bool { true }
fn default_false() -> bool { false }
fn default_ipt_level() -> u8 { 1 }
```

If `default_true()` already exists in defaults, reuse it instead of adding duplicates.

Default: `true`. Validation: no range constraint needed (boolean). In `relay_bidirectional`, pass `drs_enabled: config.general.drs_enabled && is_tls` (gate on both flags at call site).

**DO NOT** pass `Arc<ProxyConfig>` into `relay_bidirectional` — this would introduce control-plane (config) reads into the data-plane hot loop. Instead, the call site in `direct_relay.rs` computes `let drs_enabled = config.general.drs_enabled && success.is_tls` and passes it as a `bool` concrete parameter.

### Merge gate

```
cargo check --tests
cargo test -- drs_
cargo test -- relay_
cargo test -- direct_relay_
cargo test -- masking_relay_guardrails_
cargo test -- --test-threads=1
cargo test -- --test-threads=32
```

All tests above must pass. Any expensive stress case added in PR-C must be ignored by default and executed in dedicated perf/security pipelines.

---

## PR-D — Items 3 + 4a: Adaptive Startup Buffer Sizing

**Priority**: Medium. Depends on PR-C.

**PREREQUISITE**: Remove `#![allow(dead_code)]` from `src/proxy/adaptive_buffers.rs` at the start of this PR. The attribute was intentional when the module had zero call sites, but PR-D adds real call sites. Keeping the attribute suppresses legitimate dead-code warnings for any functions that remain unused after wiring.

### Problem (concrete)

Most adaptive buffer hardening primitives are already present in `src/proxy/adaptive_buffers.rs` (key length guards, stale removal via `remove_if`, TTL eviction, saturating duration math, caps). The remaining production gap is wiring: `seed_tier_for_user`, `record_user_tier`, and `direct_copy_buffers_for_tier` are still not used by direct relay runtime paths.

`relay_bidirectional` still accepts `_buffer_pool` only for compatibility. The effective startup sizing is still static (`config.general.direct_relay_copy_buf_*`) until direct relay applies seeded tier sizing at call time.

`USER_PROFILES` (adaptive_buffers.rs line 233) — `OnceLock<DashMap<String, UserAdaptiveProfile>>` — is the only remaining global after PR-B. It is acceptable here because it functions as a process-wide LRU cache (cross-session user history), not as test-contaminating per-connection state.

### Step 1: Write red tests for remaining gaps (must fail on current code)

**Do not duplicate existing coverage**: The repository already contains extensive adaptive buffer tests (`adaptive_buffers_security_tests.rs`, `adaptive_buffers_record_race_security_tests.rs`) that validate cache bounds, key guards, TOCTOU stale removal, and concurrency behavior. PR-D red tests should focus only on missing runtime integration and throughput mapping behavior.

**New file**: `src/proxy/tests/adaptive_startup_integration_tests.rs`
Declared in `src/proxy/direct_relay.rs` or `src/proxy/adaptive_buffers.rs` (single declaration site only).

```
// RED: direct relay currently ignores seeded tier and always uses static config.
// Assert selected copy buffer sizes follow direct_copy_buffers_for_tier(seed_tier_for_user(user), ...).
adaptive_startup_direct_relay_uses_seeded_tier_buffers

// RED: no production post-session persistence currently upgrades next session.
// After first relay with high throughput, next seed should reflect recorded upgrade.
adaptive_startup_post_session_recording_upgrades_next_session

// RED: short sessions (<1s) must never promote tier even under bursty bytes.
adaptive_startup_short_sessions_do_not_promote

// RED: upgrade path must be monotonic per user within TTL (no downgrade on lower follow-up).
adaptive_startup_recording_remains_monotonic_within_ttl
```

Existing adaptive security tests already cover empty keys, oversized keys, fuzz keys, and cache cardinality attacks. Do not reintroduce duplicates in PR-D.

### Step 2: Keep current hardening, remove outdated dead-code suppression

Current branch already has the core hardening this step originally proposed:
- `MAX_USER_PROFILES_ENTRIES` and `MAX_USER_KEY_BYTES`
- stale purge with `remove_if` in `seed_tier_for_user`
- `saturating_duration_since`-safe TTL math
- TTL-based `retain` eviction in `record_user_tier`

Required action in PR-D:
- remove `#![allow(dead_code)]` from `src/proxy/adaptive_buffers.rs` once direct relay wiring lands, so dead paths are visible again.

No behavioral rewrite of existing `seed_tier_for_user` / `record_user_tier` is required unless new red tests expose regressions.

### Step 3: Add explicit throughput mapping API

**`src/proxy/adaptive_buffers.rs`** — new public function:

```rust
// Computes the peak tier achieved during a session from total byte counts and
// session duration. Uses only throughput because demand-pressure metrics are
// unavailable at session end (copy_bidirectional drains everything).
// Maps average throughput over a session to an adaptive tier. Only peak direction
// (max of c2s or s2c) is considered to avoid double-counting bidir traffic.
// Note: This uses total-session average, not instantaneous peak. Bursty traffic
// (30s burst @ 100 Mbps, 9.5min idle) will compute as the average over all 10 min,
// potentially underestimating required buffers. Consider measuring peak-window
// throughput from watchdog snapshots (10s intervals) in future refinements.
pub fn average_throughput_to_tier(c2s_bytes: u64, s2c_bytes: u64, duration_secs: f64) -> AdaptiveTier {
    if duration_secs < 1.0 { return AdaptiveTier::Base; }
    let avg_bps = (c2s_bytes.max(s2c_bytes) as f64 * 8.0) / duration_secs;
    if avg_bps >= THROUGHPUT_UP_BPS as f64 { AdaptiveTier::Tier1 }
    else { AdaptiveTier::Base }
}
```

Naming constraint:
- Use `average_throughput_to_tier` consistently. Avoid introducing both `throughput_to_tier` and `average_throughput_to_tier` aliases in production code.

### Step 4: Wire into `direct_relay.rs`

**`src/proxy/direct_relay.rs`** — inside `handle_via_direct`, before the call to `relay_bidirectional` (currently line ~280):

```rust
// Seed startup buffer sizes from cross-session user history.
let initial_tier = adaptive_buffers::seed_tier_for_user(user);
let (c2s_buf, s2c_buf) = adaptive_buffers::direct_copy_buffers_for_tier(
    initial_tier,
    config.general.direct_relay_copy_buf_c2s_bytes,
    config.general.direct_relay_copy_buf_s2c_bytes,
);
let relay_epoch = std::time::Instant::now();
```

Replace the existing `config.general.direct_relay_copy_buf_c2s_bytes` / `s2c_bytes` arguments in the `relay_bidirectional` call with `c2s_buf` / `s2c_buf`.

After `relay_bidirectional` returns (whatever the result), record the tier:

```rust
let duration_secs = relay_epoch.elapsed().as_secs_f64();
let final_c2s = /* session c2s total bytes */;
let final_s2c = /* session s2c total bytes */;
let peak_tier = adaptive_buffers::average_throughput_to_tier(final_c2s, final_s2c, duration_secs);
adaptive_buffers::record_user_tier(user, peak_tier);
```

Implementation seam note:
- `relay_bidirectional` currently encapsulates counters internally. To avoid broad API churn, prefer returning a small relay outcome struct that includes final `c2s_bytes` and `s2c_bytes` totals while preserving existing error semantics.
- Keep this seam local to direct relay integration; do not expose `SharedCounters` internals broadly.

`_buffer_pool` remains in the `relay_bidirectional` signature (Option B: repurposed pathway). Its role is now documented: "parameter reserved for future pool-backed buffer allocation; startup sizing is performed by the caller via `adaptive_buffers::direct_copy_buffers_for_tier`." The underscore prefix is removed (`buffer_pool`) and it is still passed as `Arc::clone(&buffer_pool)` — no functional change.

### Merge gate

```
cargo check --tests
cargo test -- adaptive_buffers_
cargo test -- adaptive_startup_
cargo test -- direct_relay_
cargo test -- --test-threads=1
cargo test -- --test-threads=32
```

---

## PR-E — Item 4b: In-Session Adaptive Architecture Decision Gate

**Priority**: Blocks PR-G. Depends on PR-D.

**Execution model correction**: PR-E is a decision-gate phase, so it must distinguish between:
- deterministic correctness/integration tests (required for CI and merge), and
- performance experiments (informational, ignored by default, run on dedicated hardware).

Do not use throughput/latency benchmark thresholds as hard CI merge gates in this phase.

### Problem (concrete)

`SessionAdaptiveController::observe` (adaptive_buffers.rs line 121) is never called. Three structural blockers prevent in-session adaptation on the direct relay path:

1. `copy_bidirectional_with_sizes` is opaque — no hook to observe buffering pressure mid-loop.
2. `StatsIo` wraps only the client side — no server-side write pressure signal.
3. The watchdog tick is 10 seconds — too coarse for the 250 ms EMA window `observe()` expects.

The decision gate must produce *measured* evidence, not architectural guesses.

**Current state note**: `SessionAdaptiveController` and `RelaySignalSample` already exist in `adaptive_buffers.rs`, but there is no production wiring that feeds relay runtime signals into `observe(...)`.

### Step 1: Required deterministic decision tests (CI required)

**New file**: `src/proxy/tests/adaptive_insession_decision_gate_tests.rs`
Declared once (single declaration site).

These tests must be deterministic and runnable on shared CI:

```
// Confirms direct relay path has no fine-grained signal hook while copy_bidirectional_with_sizes
// remains opaque; this preserves the architectural constraint as an explicit test.
adaptive_decision_gate_direct_path_lacks_tick_hook

// Confirms middle relay path exposes configurable flush timing boundary via
// me_d2c_flush_batch_max_delay_us and can produce periodic signal ticks.
adaptive_decision_gate_middle_relay_has_tick_boundary

// Drives SessionAdaptiveController with deterministic synthetic signal stream and
// verifies promotion/demotion transitions remain stable under fixed tick cadence.
adaptive_decision_gate_controller_transitions_deterministic

// Confirms proposed signal extraction API (or shim) carries enough fields to support
// observe() without leaking internal relay-only types.
adaptive_decision_gate_signal_contract_is_sufficient
```

### Step 2: Optional feasibility experiments (ignored by default)

**New file**: `src/proxy/tests/adaptive_insession_option_a_experiment_tests.rs`
Declared in `src/proxy/relay.rs`.

**CI STABILITY WARNING**: These tests measure performance overhead, not correctness. They WILL be flaky on shared CI runners with variable CPU scheduling and memory pressure. **Mark all tests in this file with `#[ignore]`** by default. Run only in isolated performance environments (dedicated runner, pinned cores, no concurrent load). CI gate should skip these; they are for manual decision-making only.

These tests benchmark overhead, not correctness. Keep `#[ignore]` and never use as merge blockers:

```
// Measures latency penalty of adding a per-session 1-second ticker task alongside
// copy_bidirectional_with_sizes using tokio::select!. Records p50/p95/p99 latency
// delta over 1000 relay sessions each transferring 10 MB.
// ACCEPTANCE CRITERION: p99 latency increase < 2 ms; p50 < 0.5 ms.
adaptive_option_a_ticker_overhead_under_acceptance_threshold

// Measures overhead of adding AtomicU64 s2c_pending_write_count to StatsIo
// and incrementing it in poll_write when Poll::Pending. Records throughput
// delta over 10_000 relay calls.
// ACCEPTANCE CRITERION: throughput regression < 1%.
adaptive_option_a_statsio_pending_counter_overhead_under_1pct

// Measures overhead of wrapping the server-side write half in a second StatsIo
// (for server-side pressure signal). Records throughput delta.
// ACCEPTANCE CRITERION: throughput regression < 2%.
adaptive_option_a_server_side_statsio_overhead_under_2pct
```

### Step 3: Option B boundary validation experiment (ignored by default)

**New file**: `src/proxy/tests/adaptive_insession_option_b_experiment_tests.rs`
Declared in `src/proxy/middle_relay.rs`.

```
// Verifies that middle_relay's explicit ME→client flush loop already provides
// a natural tick boundary at max_delay_us intervals (currently 1000 µs default).
// Records observed tick interval distribution over 500 relay sessions.
// ACCEPTANCE CRITERION: median observed tick ≤ 2× configured max_delay_us.
adaptive_option_b_middle_relay_flush_loop_provides_tick_boundary

// Verifies SessionAdaptiveController::observe can be driven by ME flush ticks.
// Pumps 2000 synthetic RelaySignalSample values through observe() at 1 ms intervals.
// ACCEPTANCE CRITERION: Tier1 promotion fires at expected tick count consistent
// with TIER1_HOLD_TICKS = 8.
adaptive_option_b_observe_driven_by_flush_ticks_promotes_correctly
```

### Step 4: Decision artifact

**Placement correction**: function renaming and direct relay throughput-to-tier wiring are PR-D tasks, not PR-E tasks. PR-E must not duplicate those implementation steps.

After running both experiment suites, record the measured values in `docs/ADAPTIVE_INSESSION_DECISION.md` with the format:

```markdown
## Measured Results

| Metric | Option A measured | Threshold | Pass/Fail |
|---|---|---|---|
| Ticker task p99 latency delta (ms) | X | < 2 ms | ? |
| StatsIo pending counter throughput delta | X | < 1% | ? |
| Server-side StatsIo throughput delta | X | < 2% | ? |

| Metric | Option B measured | Threshold | Pass/Fail |
|---|---|---|---|
| Flush tick median vs configured delay | X | ≤ 2× | ? |
| Tier1 promotion tick accuracy | X | exact | ? |

## Decision: [Option A / Option B]
Rationale: ...
```

If Option A passes all thresholds → schedule PR-G-A (relay loop instrumentation).  
If Option B passes all thresholds → schedule PR-G-B (middle relay SessionAdaptiveController wiring).  
If neither passes → escalate and re-design.

Decision rule refinement:
- Deterministic CI tests from Step 1 must pass before any option can be selected.
- Performance thresholds from experiments are advisory evidence and must include environment metadata (CPU model, core pinning, load conditions) in the decision doc.

### Merge gate

```
cargo check --tests
cargo test -- adaptive_insession_decision_gate_
cargo test -- middle_relay_
cargo test -- --test-threads=1
cargo test -- --test-threads=32
```

Optional experiment runs (not merge blockers):

```
cargo test -- adaptive_option_a_ -- --ignored
cargo test -- adaptive_option_b_ -- --ignored
```

---

## PR-F — Item 1 Level 1: Log-Normal Single-Delay Replacement

**Priority**: Medium. **No dependency on PR-B (DI) or PR-C (DRS)** — this PR modifies only the RNG call in `masking.rs` and `handshake.rs`, touching zero global statics or shared state. Can be developed and merged independently after PR-A (baseline tests). The original "Depends on PR-B + PR-C being stable" was an artificial ordering constraint with no code justification.

### Problem (concrete)

`mask_outcome_target_budget` (masking.rs line 252, rng calls at lines 261–265) draws from uniform distribution:
```rust
let delay_ms = rng.random_range(floor..=ceiling);
```

`maybe_apply_server_hello_delay` (handshake.rs line 586):
```rust
let delay_ms = rand::rng().random_range(min..=max);
```

Both produce uniform i.i.d. samples. For a *single* sample this does not matter for classification — you cannot build a histogram from one value. However, replacing uniform with log-normal:
- More accurately models observed real-world TCP RTT distributions (multiplicative central-limit theorem).
- Provides a documented, principled rationale against future attempts to "optimize" the distribution.

**Current branch status**:
- `mask_outcome_target_budget(...)` already uses `sample_lognormal_percentile_bounded(...)` for the `ceiling > floor > 0` path.
- `maybe_apply_server_hello_delay(...)` already routes through the same helper.
- Extensive masking log-normal tests already exist in `src/proxy/tests/masking_lognormal_timing_security_tests.rs`.

PR-F is therefore an **incremental hardening + coverage completion** phase, not a greenfield implementation.

### Cargo.toml change

**No new dependencies required.**

**Implementation note correction**: current code uses a Box-Muller transform built from `rng.random_range(...)` to derive a standard normal sample, which is valid and avoids extra dependency surface. Do not force migration to `StandardNormal` unless there is a demonstrated correctness or performance defect.

**CRITICAL**: avoid adding `rand_distr` because of `rand_core` compatibility risk with the existing `rand` version.

### Step 1: Write red tests only for missing coverage (must fail on current code)

**Do not duplicate existing masking log-normal suite.** Extend `src/proxy/tests/masking_lognormal_timing_security_tests.rs` only where gaps remain.

```
// Missing gap candidate: helper behavior under extremely narrow range around 1 ms
// remains stable without boundary clamp spikes.
masking_lognormal_ultra_narrow_range_stability

// Missing gap candidate: floor=0 path remains intentionally uniform and does not
// regress to log-normal semantics.
masking_lognormal_floor_zero_path_regression_guard
```

**Add handshake-side coverage explicitly** (new file if needed): `src/proxy/tests/handshake_lognormal_delay_security_tests.rs`.
Rationale: there is no dedicated `handshake_lognormal_` suite yet, and current coverage is mostly indirect through server-hello-delay behavior tests.

```
// Deterministic bound check via fixed min==max and bounded timer advancement.
handshake_lognormal_fixed_delay_respected

// Inverted config safety: max<min remains safe and bounded.
handshake_lognormal_inversion_resilience

// Randomized-range safety: repeated rejected handshakes remain within configured
// server-hello delay envelope and do not panic.
handshake_lognormal_delay_within_configured_bounds
```

### Step 2: Keep current masking implementation, harden where needed

Retain and verify the existing `mask_outcome_target_budget` branching (only path 3 uses the log-normal helper):

Reference shape:
```rust
let delay_ms = if ceiling == floor {
    ceiling
} else {
    rng.random_range(floor..=ceiling)
};
```

New (parameterizing log-normal so that the median equals `sqrt(floor * ceiling)` — the geometric mean):

**NOTE**: The existing `mask_outcome_target_budget` has THREE code paths, not just the `ceiling > floor` branch:
1. `floor == 0 && ceiling == 0` → returns 0 (unchanged)
2. `floor == 0 && ceiling != 0` → uses `rng.random_range(0..=ceiling)` (uniform)
3. `ceiling > floor` (with `floor > 0`) → uses `rng.random_range(floor..=ceiling)` (uniform → **replace with log-normal**)
4. Fall-through (`ceiling <= floor`) → returns `floor` (unchanged)

**Only path 3 is replaced.** Path 2 (floor=0) must remain uniform because log-normal cannot meaningfully model a distribution anchored at zero — the `floor.max(1)` guard in `sample_lognormal_percentile_bounded` changes the distribution center to `sqrt(ceiling)`, which is far from the original uniform median of `ceiling/2`. Changing this would alter observable timing behavior for deployments using `floor_ms=0`.

```rust
// Path 3 replacement only — inside the `if ceiling > floor` block:
let delay_ms = if ceiling == floor {
    ceiling
} else {
    sample_lognormal_percentile_bounded(floor, ceiling, &mut rng)
};
```

Current helper in `masking.rs` already exists and is `pub(crate)` for handshake reuse.

If red tests expose issues, patch the existing helper rather than replacing it wholesale:
```rust
use rand::Rng;
// Current implementation uses Box-Muller from uniform draws.

// Samples a log-normal distribution parameterized so that the median maps to
// the geometric mean of [floor, ceiling], then clamps the result to that range.
//
// Implementation uses Box-Muller-derived N(0,1) from uniform draws.
// Log-normal = exp(mu + sigma * N(0,1)).
//
// For LogNormal(mu, sigma): median = exp(mu).
// mu = (ln(floor) + ln(ceiling)) / 2 → median = sqrt(floor * ceiling).
// sigma = ln(ceiling/floor) / 4.65 → ensures ~99% of samples fall in [floor, ceiling].
// 4.65 ≈ 2 × 2.326 (z-score for 99th percentile of standard normal).
//
// IMPORTANT: When floor == 0, log-normal parameterization is undefined (ln(0) = -∞).
// We use floor_f = max(floor, 1) for parameter computation but clamp the final
// result to the original [floor, ceiling] range. For floor=0 this produces a
// distribution centered around sqrt(ceiling) — which may differ significantly from
// the original uniform [0, ceiling]. If the caller needs uniform behavior for
// floor=0, it should handle that case before calling this function.
pub(crate) fn sample_lognormal_percentile_bounded(floor: u64, ceiling: u64, rng: &mut impl Rng) -> u64 { ... }
```

Safety requirement for this helper:
- misconfigured `floor > ceiling` must remain fail-closed and bounded.
- `floor == 0` path behavior must remain explicit and documented.
- NaN/Inf fallback must remain deterministic and bounded.

### Step 3: Implement in `handshake.rs`

Replace in `maybe_apply_server_hello_delay` (line 586):

```rust
let delay_ms = if max == min {
    max
} else {
    // Replaced: sample_lognormal_percentile_bounded produces a right-skewed distribution
    // with median at geometric mean, matching empirical TLS ServerHello delay profiles.
    masking::sample_lognormal_percentile_bounded(min, max, &mut rand::rng())
};
```

`sample_lognormal_percentile_bounded` must be made `pub(crate)` in `masking.rs` to allow the handshake call.

Status note: this helper is already `pub(crate)` on the current branch; keep visibility stable.

Status note: this handshake call-site migration is already present on the current branch; PR-F should verify and lock it with dedicated tests.

### Merge gate

```
cargo check --tests
cargo test -- masking_lognormal_timing_security_
cargo test -- server_hello_delay_
cargo test -- masking_ab_envelope_blur_integration_security  # regression gate
cargo test -- masking_timing_normalization_security          # regression gate
cargo test -- --test-threads=1
cargo test -- --test-threads=32
```

---

## PR-G — Item 1 Level 2: State-Aware Inter-Packet Timing (Burst/Idle Markov)

**Priority**: Medium. Depends on PR-E decision gate. Separate PR, design depends on PR-E outcome.

### Problem (concrete)

No inter-packet timing (IPT) mechanism exists on the MTProto relay path (confirmed: no `IptController` anywhere in the codebase). Real HTTPS sessions exhibit two-state autocorrelation: Burst (1–5 ms IPG, 0.95 self-transition) and Idle (2–10 seconds IPG, heavy-tail, 0.99 self-transition). ML classifiers detect the absence of this structure directly from the time-series, regardless of marginal distribution shape.

**ARCHITECTURAL BLOCKER (PR-G for direct relay)**: IPT requires injecting delays between write/flush cycles, which `tokio::io::copy_bidirectional_with_sizes` does not support. Adding IPT on the direct relay path requires **replacing** `copy_bidirectional_with_sizes` with a custom poll loop that calls `ipt_controller.next_delay_us()` and `tokio::time::sleep()` between write events. This is substantial work (equivalent to ~300-line custom relay loop). **Decision**: IPT for direct relay is deferred to a decision gate (PR-E); if approved, PR-G will require a dedicated custom loop. Middle relay (ME→client) has an explicit flush loop (middle_relay.rs line 1200+) where IPT can be added more easily.

**CRITICAL DESIGN FIX — DATA-AVAILABILITY AWARENESS**: The original IptController is a purely stochastic model with no awareness of whether data is actually waiting to be sent. The Idle state injects 2–30 second delays **unconditionally**, even when Telegram has queued data for the client. This would cause Telegram client timeouts and connection drops during active sessions.

**Required fix**: IptController must be **signal-driven**, not purely probabilistic:
- **Burst delays** (0.5–10 ms) are applied only when data is actively flowing (relay has data in buffers). This adds realistic inter-packet jitter without stalling delivery.
- **Idle state** is entered when the relay observes **genuine idle** (no data received from Telegram for a configurable threshold, e.g. 500ms). During genuine idle, DPI already sees no packets — consistent with browser idle. No artificial delay injection is needed.
- **Synthetic keep-alive timing** (optional, Level 3 enhancement): during genuine idle periods, inject small padding records at browser-like intervals to maintain the illusion of an active HTTPS session. This requires FakeTLS padding support.
- The `next_delay_us()` API must accept a `has_pending_data: bool` signal from the caller. When `has_pending_data == true`, the controller stays in Burst regardless of the Markov transition. When `has_pending_data == false` for the idle threshold, the controller transitions to Idle but does NOT inject delays — it simply stops the flush loop until new data arrives.

This means:
```rust
pub(crate) fn next_delay_us(&mut self, rng: &mut impl Rng, has_pending_data: bool) -> u64 {
    if has_pending_data {
        // Data waiting: always use Burst timing, regardless of Markov state.
        // Markov still transitions (for statistics/logging) but delay is Burst.
        self.maybe_transition(rng);
        let d = self.burst_dist.sample(rng).max(0.0) as u64;
        return d.saturating_mul(1_000).clamp(500, 10_000);
    }
    // No data pending: return 0 (caller should wait for data, not sleep).
    // The caller's recv() timeout on the data channel provides natural idle timing.
    0
}
```

This PR is conditional on PR-E. The exact implementation path (A or B) is determined by the PR-E decision artifact. The test specifications below apply to whichever path is chosen.

### Step 1: Write red tests (must fail on current code)

**New file**: `src/proxy/tests/relay_ipt_markov_unit_tests.rs`

```
// IptController starts in Burst state.
ipt_controller_initial_state_is_burst

// Deterministic transition oracle: with an injected decision stream that forces
// "switch" on first call, state toggles Burst -> Idle exactly once.
ipt_controller_forced_transition_toggle_oracle

// In Burst state, next_delay_us(rng, has_pending_data=true) returns value
// consistent with LogNormal(mu=1.0, sigma=0.5) * 1000, clamped to [500, 10_000] µs.
ipt_controller_burst_delay_within_burst_bounds

// Internal Markov state: even though next_delay_us returns 0 when !has_pending_data,
// the Markov chain still transitions. Verify idle_dist sampling works correctly
// when called directly (for future Level 3 keep-alive timing).
// Pareto heavy-tail: minimum = 2_000_000 µs, P(>10s) ≈ 9%.
ipt_controller_idle_dist_sampling_correct

// Deterministic Markov behavior: with an injected decision stream of
// stay/stay/switch, verify exact state sequence without probabilistic thresholds.
ipt_controller_markov_sequence_deterministic_oracle

// Compile-time trait check can be kept if needed, but no CI memory-growth or
// wall-clock budget assertions in merge gates.
ipt_controller_trait_bounds_compile_check

// DATA-AWARENESS: next_delay_us(rng, has_pending_data=true) always returns
// Burst-range delay, even if Markov state is Idle. Verifies that active data
// transfer is never stalled by Idle-phase delays.
ipt_controller_pending_data_forces_burst_delay

// DATA-AWARENESS: next_delay_us(rng, has_pending_data=false) returns 0,
// signaling the caller to wait for data arrival (no artificial sleep).
ipt_controller_no_pending_data_returns_zero

// Adversarial: IptController with f64 overflow — burst_dist.sample() returning
// very large values must not overflow on saturating_mul(1_000). Verify clamp
// catches extreme samples.
ipt_controller_burst_sample_overflow_safe

// Adversarial: idle_dist.sample() returning f64::INFINITY or f64::NAN
// (edge case of Pareto distribution). Cast to u64 must not panic; clamp
// handles gracefully.
ipt_controller_idle_sample_extreme_f64_safe
```

**New file**: `src/proxy/tests/relay_ipt_integration_tests.rs`

```
// Relay path with IPT enabled: 200 calls alternating has_pending_data true/false.
// Verify that true calls always return Burst-range delays and false calls
// always return 0.
relay_ipt_data_availability_signal_respected

// Adversarial: active prober sends 100 handshakes with invalid keys.
// IPT must not affect the fallback-to-masking behavior or reveal proxy identity
// through timing structure (timing envelope in fallback path is unchanged).
relay_ipt_invalid_handshake_fallback_timing_unchanged

// Adversarial: censor injects 10_000 back-to-back packets at 0-delay
// (has_pending_data=true for all). Verify relay does not stall excessively
// (total added IPT delay < 10% of transfer time for a 1 MB payload at 10 Mbps).
relay_ipt_overhead_under_high_rate_attack_within_budget

// Config kill-switch: ipt_enabled = false → no delay injected.
relay_ipt_disabled_by_config_no_delay_added
```

Optional (non-merge-gate) performance experiments:
```
relay_ipt_burst_delays_exhibit_positive_autocorrelation
relay_ipt_500_concurrent_throughput_within_5pct_baseline
```

### Step 2: Implement `IptController`

**New file**: `src/proxy/ipt_controller.rs`
Declare `pub(crate) mod ipt_controller;` in `src/proxy/mod.rs`.

```rust
use rand::Rng;

pub(crate) enum IptState { Burst, Idle }

// Log-normal parameters for Burst-state inter-packet delay.
// mu=1.0, sigma=0.5 → median ≈ exp(1.0) ≈ 2.7 ms.
const BURST_MU: f64 = 1.0;
const BURST_SIGMA: f64 = 0.5;
const BURST_DELAY_MIN_US: u64 = 500;
const BURST_DELAY_MAX_US: u64 = 10_000;
// Pareto parameters for Idle-state delay (retained for future Level 3 keep-alive).
// scale=2_000_000 µs (2s minimum), shape=1.5 → heavy tail.
const IDLE_PARETO_SCALE: f64 = 2_000_000.0;
const IDLE_PARETO_SHAPE: f64 = 1.5;

pub(crate) struct IptController {
    state: IptState,
    // Pre-computed Burst/Idle transition probabilities.
    burst_stay_prob: f64,  // 0.95
    idle_stay_prob: f64,   // 0.99
}

impl IptController {
    pub(crate) fn new() -> Self {
        Self {
            state: IptState::Burst,
            burst_stay_prob: 0.95,
            idle_stay_prob: 0.99,
        }
    }

    fn maybe_transition(&mut self, rng: &mut impl Rng) {
        // random_bool(p) returns true with probability p, using u64 threshold
        // internally for full precision. Simpler than manual u32 threshold.
        let stay = match self.state {
            IptState::Burst => rng.random_bool(self.burst_stay_prob),
            IptState::Idle => rng.random_bool(self.idle_stay_prob),
        };
        if !stay {
            self.state = match self.state {
                IptState::Burst => IptState::Idle,
                IptState::Idle => IptState::Burst,
            };
        }
    }

    // Burst delay via log-normal: exp(mu + sigma * N(0,1)).
    // Use dependency-free Box-Muller (same project pattern as masking helper)
    // to avoid any additional RNG-distribution dependency churn.
    fn sample_burst_delay_us(&self, rng: &mut impl Rng) -> u64 {
        let u1 = rng.next_f64().max(f64::MIN_POSITIVE);
        let u2 = rng.next_f64();
        let normal = (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos();
        let raw = (BURST_MU + BURST_SIGMA * normal).exp();
        let us = if raw.is_finite() {
            (raw as u64).saturating_mul(1_000)
        } else {
            // exp(1.0) ≈ 2718 → 2_718_000 µs as fallback (won't happen in practice)
            2_718_000
        };
        us.clamp(BURST_DELAY_MIN_US, BURST_DELAY_MAX_US)
    }

    // Idle delay via Pareto CDF inversion: scale / U^(1/shape).
    // Retained for future Level 3 synthetic keep-alive timing.
    // NOTE: Currently dead code — next_delay_us returns 0 when !has_pending_data.
    #[allow(dead_code)]
    fn sample_idle_delay_us(&self, rng: &mut impl Rng) -> u64 {
        let u: f64 = rng.random_range(f64::EPSILON..1.0);
        let raw = IDLE_PARETO_SCALE / u.powf(1.0 / IDLE_PARETO_SHAPE);
        if raw.is_finite() {
            (raw as u64).clamp(2_000_000, 30_000_000)
        } else {
            2_000_000
        }
    }

    // Returns inter-packet delay in microseconds.
    // `has_pending_data`: true when the relay has queued data awaiting flush.
    // When true, always returns a Burst-range delay — active data must never be
    // stalled by Idle-phase pauses (which would cause Telegram client timeouts).
    // When false, returns 0 — the caller should block on its data channel recv(),
    // which provides natural idle timing matching genuine browser think-time.
    pub(crate) fn next_delay_us(&mut self, rng: &mut impl Rng, has_pending_data: bool) -> u64 {
        self.maybe_transition(rng);
        if has_pending_data {
            self.sample_burst_delay_us(rng)
        } else {
            0
        }
    }
}
```

**CHANGES vs previous draft:**
1. **No new distribution dependency** — uses Box-Muller for log-normal and manual CDF inversion for Pareto.
2. **`random_bool(p)` for Markov transitions** — replaces manual u32 threshold computation. Cleaner, equivalent precision.
3. **`idle_dist` explicitly marked `#[allow(dead_code)]`** — `next_delay_us` returns 0 when `!has_pending_data`, so idle sampling is never reached in production. Retained for future Level 3 keep-alive.
4. **No stored distribution objects** — parameters are constants, sampling is inline. Avoids the `expect()` calls that would be denied by `clippy::expect_used`.

### Step 3: Integrate into relay path

Conditional on PR-E outcome:

- **Option B path** (recommended if PR-E selects B): wire `IptController` into the ME→client flush loop in `middle_relay.rs`. Each flush cycle calls `ipt_controller.next_delay_us(&mut rng, has_pending_data)` where `has_pending_data = !frame_buf.is_empty()`, then `tokio::time::sleep(Duration::from_micros(delay))` before the next flush. When `delay == 0`, the loop blocks on `me_rx.recv()` naturally.
- **Option A path**: replace `copy_bidirectional_with_sizes` with a custom poll loop that calls `ipt_controller.next_delay_us(rng, has_pending_data)` between write completions, checking the read buffer for pending data.

Config flag in `src/config/types.rs`:
```rust
#[serde(default = "default_false")]
pub ipt_enabled: bool,        // default: false (opt-in)
#[serde(default = "default_ipt_level")]
pub ipt_level: u8,            // 1 = single-delay only, 2 = Markov; default 1
```

### Merge gate

```
cargo check --tests
cargo test -- relay_ipt_markov_unit_
cargo test -- relay_ipt_integration_
cargo test -- --test-threads=1
cargo test -- --test-threads=32
```

---

## PR-H — Consolidated Hardening, ASVS L2 Audit, and Documentation

**Depends on**: All prior PRs.

### ASVS L2 Verification Checklist for Changed Areas

| ASVS Control | Area | Verification |
|---|---|---|
| V5.1.1 Input validation | `record_user_tier` user key length | `MAX_USER_KEY_BYTES = 512` guard in place |
| V5.1.3 Output encoding | DRS framing | No user-controlled field affects record size calculation |
| V5.1.1 Input validation | `IptController.next_delay_us` | `has_pending_data` signal is a bool from trusted internal code; no external input reaches IptController directly |
| V8.1.1 Memory safety | `DrsWriter`, `IptController` | No `unsafe` blocks; all bounds enforced by Rust type system; `saturating_mul` prevents overflow in IptController burst sampling |
| V8.3.1 Sensitive data in memory | `ProxySharedState` | auth key material remains in `HandshakeSuccess` on stack; not copied into shared state |
| V11.1.3 TLS config | DRS | TLS path enabled only when `is_tls=true`; non-TLS path unmodified |
| V11.1.4 Cipher strength | n/a | No cryptographic changes in this plan |
| V2.1.5 Brute force | Auth probe | Probe state in `ProxySharedState.handshake.auth_probe`; per-IP saturation preserved |
| V6.2.2 Algorithm strength | Log-normal RNG | Box-Muller-based bounded sampler with finite checks and deterministic fallback/clamp; no panic path |
| V14.2.1 Configuration hardening | serde defaults | All new config fields have `#[serde(default)]` for backward-compatible deserialization |
| V1.4.1 Concurrency | `ProxySharedState` mutex type | Uses `std::sync::Mutex`; locks never held across await points; lock ordering documented |

### Full test run command sequence

```sh
# Run all proxy tests
cargo test -p telemt -- proxy::

# Run targeted gate for each PR area
cargo test -- relay_baseline_
cargo test -- handshake_baseline_
cargo test -- middle_relay_baseline_
cargo test -- masking_baseline_
cargo test -- proxy_shared_state_
cargo test -- drs_
cargo test -- adaptive_startup_
cargo test -- adaptive_option_
cargo test -- masking_lognormal_
cargo test -- handshake_lognormal_
cargo test -- ipt_

# Full regression (must show zero failures)
cargo test
```

### Documentation changes

**`docs/CONFIG_PARAMS.en.md`** — add entries for each new `GeneralConfig` field:

| Field | Default | Description |
|---|---|---|
| `drs_enabled` | `true` | Enable Dynamic Record Sizing on TLS direct relay path. Disable for debugging. |
| `ipt_enabled` | `false` | Enable state-aware inter-packet timing on relay path. Opt-in; requires testing in your network environment. |
| `ipt_level` | `1` | IPT level: 1 = log-normal single-delay only, 2 = Burst/Idle Markov chain. |

**`ROADMAP.md`** — mark completed items from this plan.

---

## Architectural Decisions & Key Findings from Audit

### D1: PR Ordering — Swap PR-C and PR-B

**Audit finding**: PR-C (DRS) is self-contained; PR-B (DI) has a 2000+ line blast radius.

**Decision**: **YES, swap PR-C → PR-B in execution order**. Rationale:
- **PR-C dependencies**: Only `is_tls` (field in `HandshakeSuccess`, already exists) + new `drs_enabled` config flag. Zero dependency on DI migration.
- **PR-C value**: Delivers immediate anti-censorship benefit for direct relay TLS path.
- **PR-B risk mitigation**: If DI refactor hits unforeseen complexity, DRS remains deliverable independently.
- **Execution parallelization**: PR-C and PR-B can have their test suites written in parallel (PR-A → PR-C tests + PR-B tests in parallel) → PR-C production code → PR-B production code (sequential due to shared entry points).

**Updated graph**:
```
PR-A (baseline gates)
├─→ PR-C (DRS, independent)
├─→ PR-F (log-normal, independent)
└─→ PR-B (DI migration)
      └─→ PR-D (adaptive startup)
            └─→ PR-E (decision gate)
```

---

### D2: PR-B Phasing (Single Atomic vs Shim+Removal)

**Audit suggestion**: Two-phase with compatibility shim to reduce blast radius.

**Decision**: **NOT phased — single atomic PR-B**. Rationale:
- A shim (global `ProxySharedState::default()` instance) would live only through one release cycle, complicating both phases.
- With high test coverage from PR-A, full replacement is safer than partial compatibility.
- Parallel test execution gates (`cargo test -- --test-threads=32`) will catch test interference before merge.
- **Mitigation**: Sequence the changes: `ProxySharedState` creation first → all accessors updated → test helpers removed. Review in logical chunks per file.

---

### D3: PR-C Scope — Direct Relay Only, Middle Relay Gap

**Audit finding**: Middle relay (the default mode) is not covered; this is a CVE-level coverage gap.

**Decision**: **KNOWN LIMITATION with ELEVATED follow-up priority**. Document explicitly:
- PR-C covers direct relay path only (direct_relay.rs → relay_bidirectional).
- Middle relay path (middle_relay.rs → explicit ME→client loop) requires separate PR-C.1 (follow-up).
- **Middle relay is the DEFAULT** for deployments with configured ME URLs, which is the typical production setup. Direct relay is used when `use_middle_proxy=false` or no ME pool is available.
- **PR-C.1 must be elevated to the same priority as PR-C** (High, anti-censorship). It should begin development immediately after PR-C merges, not be treated as a casual follow-up. Middle relay has natural flush-tick points that make DRS integration architecturally simpler than direct relay.
- **Action**: Add a `docs/DRS_DEPLOYMENT_NOTES.md` with guidance documenting which relay modes have DRS coverage and which are pending PR-C.1.

---

### D4: DRS MaybeDrs Enum Overhead

**Audit finding**: `MaybeDrs<W>` enum adds a branch dispatch per poll.

**Decision**: **ACCEPTABLE**. The dispatch overhead (~3-5 cycles with branch prediction) is negligible vs TLS crypto, I/O latency, and network RTT. Do NOT attempt zero-overhead abstractions (e.g., generic specialization); the complexity is not worth the unmeasurable gain. Document the assumption in code comments.

---

### D5: Log-Normal Distribution Parameterization — CRITICAL FIX

**Audit finding**: Fixed `sigma=0.5` creates an 18% clamp spike at `ceiling`, detectable by DPI.

**Decision**: **FIXED** (already applied above). New parameterization:
- mu = (ln(floor) + ln(ceiling)) / 2 → median = sqrt(floor * ceiling) (geometric mean, NOT arithmetic mean)
- sigma = ln(ceiling/floor) / 4.65 → ensures ~99% of samples fall within [floor, ceiling]
- Result: NO spike; distribution smoothly bounded.
- Function renamed to `sample_lognormal_percentile_bounded` to reflect guarantee.
- **Mathematical note**: The median of this distribution is the geometric mean sqrt(floor * ceiling), which differs from the arithmetic mean (floor+ceiling)/2 for asymmetric ranges. Tests must assert against the geometric mean, not the arithmetic mean.

---

### D6: IptController pre-construction to avoid unwrap()

**Audit finding**: `LogNormal::new().unwrap()` in `next_delay_us` won't compile under `deny(clippy::unwrap_used)`.

**Decision**: **FIXED** (redesigned above). IptController now uses inline Box-Muller sampling for the normal component and manual Pareto CDF inversion. No distribution objects are stored; no `unwrap()`/`expect()` calls needed. The `random_bool(p)` API replaces manual u32 threshold computation for Markov transitions.

---

### D7: Adaptive Buffers — Stale Entry Leak

**Audit finding**: `seed_tier_for_user` returns Base for expired profiles but doesn't remove them; cache fills with stale entries.

**Decision**: **FIXED** (already applied above). Two changes:
1. `seed_tier_for_user` now uses `DashMap::remove_if` with a TTL predicate (atomic, avoids TOCTOU race where concurrent `record_user_tier` inserts a fresh profile between `drop(entry)` and `remove(user)`).
2. `record_user_tier` uses TTL-based `DashMap::retain()` for overflow eviction (single O(n) pass, removes stale entries when cache exceeds `MAX_USER_PROFILES_ENTRIES`). This replaces the originally proposed "oldest N by LRU" strategy which would have required O(n log n) sorting + double-shard-locking.

---

### D8: throughput_to_tier Metric — Average Not Peak

**Audit finding**: Function computes average throughput over entire session; bursty traffic is underestimated.

**Decision**: **RENAMED + DOCUMENTED**. New name: `average_throughput_to_tier` makes the limitation explicit. Comment documents: "Uses total-session average, not instantaneous peak. Consider peak-window measurement from watchdog snapshots as a future refinement." Users deploying in bursty-traffic environments should consider manual tier pinning via config until this limitation is addressed.

---

## Answers to Audit Open Questions

> **Q1: PR-B phasing — single atomic PR-B or split Phase 1 (shim) + Phase 2 (production threading)?**

**A1**: Proceed with single atomic PR-B. The shim approach delays clean state and complicates review. High test coverage from PR-A mitigates risk. Use sequential sub-phases within the PR (ProxySharedState creation → accessors → test helpers) and require parallel test execution gates before merge.

---

> **Q2: Middle relay DRS — should PR-C also address ME→client path, or is that a follow-up?**

**A2**: Follow-up (PR-C.1) **at the same priority level as PR-C** (High). Direct relay DRS is the initial deliverable; it's self-contained. However, middle relay is the **default production mode** for deployments with configured ME URLs, making PR-C.1 critical. Middle relay has a different architecture (explicit flush loop, not copy_bidirectional) and warrants separate implementation, but must begin immediately after PR-C merges. Annotate PR-C: "Coverage: Direct relay only. Middle relay DRS planned for next release."

---

> **Q3: PR-C → PR-B dependency reversal — are you OK with reversing the order to deliver DRS first?**

**A3**: **YES, change the dependency order to PR-C → PR-B**. DRS is lower-risk, higher-value, and independent of DI. This improves parallelization and reduces the critical path. Update the plan's PR Dependency Graph accordingly.

---

> **Q4: `copy_bidirectional` replacement for IPT — is the team prepared to write a custom poll loop for PR-G Option A (direct relay)?**

**A4**: **Document as a risk item for PR-E decision gate**. If PR-E chooses Option A (direct relay IPT), a custom poll loop is **mandatory** — `copy_bidirectional` is not compatible. Estimate: ~300-line custom relay loop + full test matrix. This is non-trivial. PR-E experiments should include a prototype of the custom loop to validate feasibility before committing. If the team is not prepared for ~2-3 weeks of dedicated work on the relay loop, **choose Option B** (middle relay only for in-session IPT).

**IMPORTANT ADDENDUM**: The IptController has been redesigned to be **data-availability-aware** (see F14). The original purely-stochastic Idle model would have broken active Telegram connections by injecting 2–30 second delays unconditionally. The redesigned controller only applies Burst delays when data is pending; idle timing is handled naturally by the caller's `recv()` blocking on the data channel. This simplifies the Option A custom loop (no need for tokio::time::sleep with variable durations — just a short fixed sleep in the poll loop when data is available).

---

> **Q5: Log-normal sigma — dynamic computation or fixed 0.5?**

**A5**: **Use dynamic computation** (already fixed above). Parameterize so ~99% of samples fall in [floor, ceiling], with median at the geometric mean sqrt(floor*ceiling). Function: `sample_lognormal_percentile_bounded(floor, ceiling, rng)`.

---

## Out-of-Scope Boundaries

- No AES-NI changes: the `aes` crate performs runtime CPUID detection automatically.
- No sharding of `USER_PROFILES` DashMap: no measured bottleneck exists.
- No monolithic PRs: each item has its own branch and review cycle.
- No relaxation of red test assertions without a proven code fix — tests are the ground truth.

---

## Critical Review — Issues Found and Fixed

This section documents all issues found during critical review of the original plan, whether they were corrected inline (above) or require explicit acknowledgement.

### Fixed Inline (code/plan corrections applied above)

| # | Issue | Severity | Fix |
|---|---|---|---|
| F1 | PR-B "Blocks PR-C" contradicts D1 decision to swap ordering | Medium | PR-B header updated to "Blocks PR-D" only |
| F2 | Static line numbers wrong (handshake.rs: 71→52, 72→53, 74→55, 30→33, 32→39; middle_relay.rs: 63→62) | Low | Corrected to match actual source |
| F3 | `_for_testing` helper line numbers wrong across both files | Low | Corrected to match actual source |
| F4 | `handle_tls_handshake` line reference 638→690; `handle_mtproto_handshake` 840→854; `client.rs` call sites wrong | Low | Corrected |
| F5 | `DrsWriter.records_completed` overflow on 32-bit: wraps after ~4B records, restarts DRS ramp (detectable signature) | High | Capped via `.saturating_add(1).min(DRS_PHASE_FINAL + 1)` |
| F6 | DRS TLS overhead comment assumed real TLS 1.3 (22 bytes), but FakeTlsWriter only adds 5-byte header (no AEAD, no content-type byte). Wire record = 1369 + 5 = 1374, NOT 1391 | **High** | Comment corrected to reflect FakeTLS overhead; constant 1369 retained as conservative value with 74-byte MSS margin |
| F7 | Log-normal median math error: `mu = (ln(f) + ln(c))/2` → median = sqrt(f*c) (geometric mean), NOT (f+c)/2 (arithmetic mean) | **Critical** | Test assertions and comments rewritten to assert geometric mean; function renamed to `sample_lognormal_percentile_bounded` |
| F8 | `seed_tier_for_user` TOCTOU race: `drop(entry)` then `remove(user)` can delete a fresh profile inserted between the two calls | High | Replaced with `DashMap::remove_if` with TTL predicate (atomic) |
| F9 | `record_user_tier` eviction strategy: "evict oldest N" requires O(n log n) + double shard-locking; `retain()` cannot select by count | Medium | Replaced with TTL-based `retain()` — single O(n) pass, removes stale entries |
| F10 | `IptController` Pareto idle clamp `[500_000, 30_000_000]`: lower bound 0.5s is dead code (Pareto minimum = scale = 2s) | Low | Lower clamp corrected to `2_000_000` with explanatory comment |
| F11 | D3 claim "Most deployments should use direct relay where possible" is misleading — middle relay is the default when ME URLs are configured | Medium | Rewritten to accurately describe both deployment modes |
| F12 | DRS scope: Missing `LOGGED_UNKNOWN_DCS` and `BEOBACHTEN_*_WARNED` from PR-B static inventory (direct_relay.rs line 24, client.rs lines 81, 88) | Medium | Added to PR-B table as lower-priority follow-up |
| F13 | `IptController` threshold approximation: P(stay) ≈ 0.95000000047 due to u32 truncation, not exactly 0.95 | Low | Comment added documenting the approximation |
| F14 | `IptController` Idle state injects 2–30s delays unconditionally, breaking active Telegram connections (Telegram client timeouts) | **Critical** | IptController redesigned to be data-availability-aware: `next_delay_us(rng, has_pending_data)`. When data is pending, always returns Burst-range delay. When idle, returns 0 (caller blocks on data channel naturally). |
| F15 | Test file `proxy_shared_state_isolation_tests.rs` declared in TWO modules (handshake.rs AND middle_relay.rs) via `#[path]` — causes duplicate symbol compilation errors | **Critical** | Changed to single declaration in `src/proxy/mod.rs` only |
| F16 | PR-F (log-normal) had artificial dependency on PR-B (DI) — zero code dependency exists; modifies only two `rng.random_range()` call sites | High | Made PR-F independent; can land after PR-A only |
| F17 | New config fields `drs_enabled`, `ipt_enabled`, `ipt_level` lacked `#[serde(default)]` annotations — existing config.toml files would fail to deserialize on upgrade | High | Added `#[serde(default = "...")]` annotations with helper functions |
| F18 | ProxySharedState `Mutex` type unspecified (std::sync vs tokio::sync) — incorrect choice causes async runtime issues | High | Explicitly specified `std::sync::Mutex` with rationale (short critical sections, no await points inside locks) |
| F19 | DRS architecture note showed `client_writer` as "actual TLS/TCP socket" — it's actually `CryptoWriter<FakeTlsWriter<W>>` with internal buffering | High | Corrected call chain diagram to show CryptoWriter + FakeTlsWriter layers with buffering interaction documentation |
| F20 | DRS `DRS_FULL_RECORD_PAYLOAD = 16_384` was documented as "becomes a no-op" but `FakeTlsWriter` uses `MAX_TLS_CIPHERTEXT_SIZE = 16_640` — DRS still shapes in steady-state | Medium | Comment corrected; DRS at 16_384 intentionally mimics RFC 8446 plaintext limit |
| F21 | `IptController` burst sample: `(sample as u64) * 1_000` can overflow for extreme LogNormal tail values | Medium | Changed to `(sample as u64).saturating_mul(1_000)` with `.max(0.0)` guard for negative edge cases |
| F22 | PR-C.1 (middle relay DRS) was treated as casual follow-up but middle relay is the DEFAULT production mode | High | Elevated PR-C.1 to same priority as PR-C; must begin immediately after PR-C merges |
| F23 | `#![allow(dead_code)]` on adaptive_buffers.rs not planned for removal in PR-D | Medium | Added prerequisite to PR-D: remove the attribute when call sites are added |
| F24 | PR-E experiment tests (`adaptive_option_a_*`, `adaptive_option_b_*`) are performance benchmarks that will be flaky on shared CI runners | Medium | Added `#[ignore]` requirement; run only in isolated performance environments |
| F25 | `rand_distr = "0.5"` is incompatible with `rand = "0.10"` — `rand_distr 0.5` depends on `rand_core 0.9`; trait mismatch prevents compilation | **Critical** | Removed `rand_distr` dependency; replaced with manual log-normal via Box-Muller and manual Pareto CDF inversion. Zero new dependencies needed. |
| F26 | `sample_lognormal_percentile_bounded` with `floor=0`: `floor.max(1)` avoids ln(0) but silently shifts distribution center from `ceiling/2` (uniform) to `sqrt(ceiling)` (log-normal) — massive semantic change | **High** | Documented explicitly: only path 3 (`floor > 0 && ceiling > floor`) uses log-normal. Path 2 (`floor == 0`) retains uniform distribution. |
| F27 | `seed_tier_for_user` / `record_user_tier` use `duration_since` which panics if `seen_at > now` (concurrent Instant reordering in remove_if predicate) | **High** | Replaced all TTL predicates with `saturating_duration_since` — returns `Duration::ZERO` when `seen_at > now`, treating entry as fresh (safe). |
| F28 | IptController used `rand_distr::{LogNormal, Pareto}` (incompatible with rand 0.10) and pre-stored distribution objects requiring `expect()` (denied by clippy) | **Critical** | Redesigned: inline Box-Muller sampling for log-normal, manual CDF inversion for Pareto. `random_bool(p)` for Markov transitions. No stored objects, no `expect()`. |
| F29 | `ipt_level: u8` config field violates Architecture.md §4 (enums over magic numbers) | Low | Should be `enum IptLevel { SingleDelay, MarkovChain }` with `#[serde(rename_all = "snake_case")]`. |
| F30 | PR-A `test_harness_common.rs` declared via `#[path]` in three modules → triple duplicate symbol compilation failure | **Critical** | Declared once in `proxy/mod.rs`; imported via `use crate::proxy::test_harness_common::*` in consuming tests |
| F31 | PR-A `RecordingWriter` stored `Vec<Vec<u8>>` with ambiguous write-vs-flush boundaries; DRS tests (PR-C) need flush-boundary tracking | **High** | Dual-tracking design: `writes` (per poll_write) + `flushed` (per poll_flush boundary with accumulator) |
| F32 | PR-A `SliceReader` required `bytes` crate for no gain; `tokio::io::duplex()` already used everywhere | **High** | **Dropped** from test harness |
| F33 | PR-A `PendingWriter` only controlled `poll_write` pending; DRS flush-pending tests (`drs_pending_on_flush_propagates_pending_without_spurious_wake`) need separate flush control | Medium | Renamed to `PendingCountWriter` with separate `write_pending_remaining` and `flush_pending_remaining` counts |
| F34 | PR-A `relay_baseline_watchdog_delta_does_not_panic_on_u64_wrap` duplicates 7 existing tests in `relay_watchdog_delta_security_tests.rs` | **Critical** | **Dropped** — existing test file already provides exhaustive coverage including wrap, overflow, fuzz |
| F35 | PR-A `handshake_baseline_saturation_fires_at_configured_threshold` implies runtime config but `AUTH_PROBE_BACKOFF_START_FAILS` is a compile-time constant | Low | Renamed to `_compile_time_threshold` |
| F36 | PR-A middle_relay baseline tests directly poked global statics that PR-B removes | **High** | Rewritten to test through public functions (`mark_relay_idle_candidate`, `clear_relay_idle_candidate`) whose signatures survive PR-B |
| F37 | PR-A had zero masking baseline tests despite masking being the primary anti-DPI component and PR-F modifying it | **High** | Added `masking_baseline_invariant_tests.rs` with timing budget, fallback relay, consume-cap, and adversarial tests |
| F38 | PR-A had no error-path baseline tests — only happy paths locked | **High** | Added: simultaneous-close, broken-pipe, and many-small-writes relay baselines |
| F39 | PR-A `relay_baseline_empty_transfer_completes_without_error` was vague (no sharp assertions) | Medium | Replaced with `relay_baseline_zero_bytes_returns_ok_and_counters_zero` |
| F40 | PR-A `test_stats()` and `test_buffer_pool()` are trivial wrappers for one-liner constructors already inlined everywhere | Medium | **Dropped** from test harness to avoid unnecessary indirection |
| F41 | PR-A `seeded_rng` limitation not documented: cannot substitute for `SecureRandom` in production function calls | Medium | Documented as explicit limitation in code comment |
| F42 | PR-A no test isolation strategy documented for auth_probe global state contention | Medium | Each handshake baseline test acquires `auth_probe_test_lock()`, calls `clear_auth_probe_state_for_testing()`. Documented as temporary coupling eliminated in PR-B |
| F43 | PR-A was not split into sub-phases; utility iteration could block baseline tests | **High** | Split into PR-A.1 (utilities, compile-only gate) and PR-A.2 (baseline tests, all-green gate) |
| F44 | `sample_lognormal_percentile_bounded` and 14 masking lognormal tests already exist in codebase (masking.rs:258, masking_lognormal_timing_security_tests.rs). PR-F describes implementing what's already done. | **High** | PR-F's remaining scope: verify handshake.rs integration (already wired at line 596). PR-F may already be complete — audit needed before starting. |
| F45 | PR-A `handshake_test_config()` was missing; `tls_only_config()` alone is insufficient for handshake baseline tests requiring user/secret/masking config | **High** | Added `handshake_test_config(secret_hex)` to test harness |
| F46 | Previous external review C1 (DRS write-chain placement "fundamentally wrong") is **INCORRECT** — see R3/R6 in Acknowledged Risks. Each DrsWriter.poll_write passes ≤ target bytes to CryptoWriter in one call. CryptoWriter passes through to FakeTlsWriter in one call. FakeTlsWriter creates exactly one TLS record per poll_write. Flush at record boundary ensures CryptoWriter's pending buffer is drained before the next record starts. Chain is correct. | **Informational** | No plan change needed; external finding was wrong. |
| F47 | `BEOBACHTEN_*_WARNED` statics are process-scoped log-dedup guards. Moving to ProxySharedState changes semantics: warnings fire per-instance instead of per-process. | Medium | Keep as process-global statics (correct for log dedup). Do NOT migrate to ProxySharedState. |
| F48 | `ProxySharedState` nested into `HandshakeSharedState` + `MiddleRelaySharedState` — unnecessary indirection. Functions access `shared.handshake.auth_probe` instead of `shared.auth_probe` | Low | Consider flattening to a single struct for simplicity (KISS principle, Architecture.md §1). Both sub-structs are always accessed together through the parent. |

### Acknowledged Risks (not fixable in plan, require runtime attention)

| # | Risk | Mitigation |
|---|---|---|
| R1 | DRS per-record flush adds syscall overhead in steady-state (16KB records). `copy_bidirectional_with_sizes` also flushes independently → double-flush is idempotent but wastes cycles. | Benchmark in PR-C red tests. If overhead > 2% throughput regression, coarsen flush to every N records in steady-state phase. |
| R2 | `copy_bidirectional_with_sizes` internal buffering: when `DrsWriter.poll_write` returns fewer bytes than offered (record boundary), the copy loop retries with the remaining buffer. This is correct but untested with the specific tokio implementation. | Add a specific integration test `drs_copy_bidirectional_partial_write_retry` that verifies total data integrity when DrsWriter limits write sizes. |
| R3 | `DrsWriter` flush inside `poll_write` loop: DRS value depends on `FakeTlsWriter.poll_flush` actually draining its internal `WriteBuffer` to the socket and creating a TLS record boundary. **Verified**: `FakeTlsWriter.poll_flush` first calls `poll_flush_record_inner` (drains pending TLS record bytes) then `upstream.poll_flush` (drains socket). This IS a real record boundary. However, `CryptoWriter` sits between DRS and FakeTLS and has its own pending buffer. DRS flush → `CryptoWriter.poll_flush` (drains pending ciphertext) → `FakeTlsWriter.poll_flush`. If `CryptoWriter` has accumulated bytes from multiple DRS writes before flush (possible if earlier write returned buffered-but-Ok), those bytes may be flushed as one chunk to FakeTLS, creating one larger record instead of separate DRS-sized records. | Add integration test `drs_crypto_writer_buffering_chain_integrity` to verify full chain produces individual records at DRS boundaries. |
| R4 | `average_throughput_to_tier` uses session-average throughput, not peak-window. Bursty traffic patterns (video streaming: 30s burst at 100 Mbps, then 9.5min idle) will underestimate tier, resulting in sub-optimal buffer sizes for the burst phase of the next session. | Document limitation. Monitor via watchdog's 10s snapshots. Future PR: compute peak from watchdog snapshots rather than session average. |
| R5 | PR-C covers direct relay only; middle relay (often the default) has no DRS. This is a significant coverage gap for deployments using ME pools. | PR-C.1 follow-up for middle relay. Middle relay has natural flush-tick points that make DRS integration architecturally simpler. Prioritize PR-C.1 immediately after PR-C. |
| R6 | `CryptoWriter.poll_write` always returns `Ok(to_accept)` even when `FakeTlsWriter` returns Pending — it buffers internally. If DRS writes N bytes and CryptoWriter buffers them, then DRS flushes, CryptoWriter drains its buffer as ONE chunk to FakeTLS. FakeTLS receives the full N-byte chunk and creates one N+5 byte TLS record. This is correct behavior (one DRS record = one TLS record). BUT if CryptoWriter's `max_pending_write` (default 16KB) is smaller than a DRS write (impossible: max DRS write = 16384 ≤ 16KB), writes would be split. Verify `CryptoWriter.max_pending_write` is ≥ `DRS_FULL_RECORD_PAYLOAD`. | Integration test `drs_crypto_writer_buffering_chain_integrity`. |
| R7 | IptController redesign (data-availability-aware) removes the Idle-state delay generation entirely. The Pareto distribution and `idle_dist` field are now dead code. Consider removing them to avoid confusion, or repurposing them for synthetic keep-alive timing in a future Level 3 enhancement. | Document in PR-G that `idle_dist` is retained for future Level 3 (trace-driven synthetic idle traffic). |

### Missing Tests (should be added to existing PR test lists)

| Test | PR | Rationale |
|---|---|---|
| `drs_statsio_byte_count_matches_actual_written` | PR-C | Verify StatsIo counters remain accurate when DrsWriter limits write sizes. Without this, a bug where DrsWriter eats or duplicates bytes goes undetected. |
| `drs_copy_bidirectional_partial_write_retry` | PR-C | Verify `copy_bidirectional_with_sizes` correctly retries when DrsWriter returns fewer bytes than offered at record boundaries. |
| `drs_records_completed_counter_does_not_wrap` | PR-C | On 32-bit `usize`, verify counter caps at `DRS_PHASE_FINAL + 1` and does not restart the DRS ramp. |
| `drs_flush_is_meaningful_for_faketls` | PR-C | Verify that `FakeTlsWriter.poll_flush` produces a TLS record boundary, otherwise DRS provides no anti-DPI value. |
| `adaptive_startup_remove_if_does_not_delete_fresh_concurrent_insert` | PR-D | Concurrent test: thread A reads stale profile, thread B inserts fresh profile, thread A calls `remove_if` → assert fresh profile survives. |
| `ipt_controller_burst_stay_threshold_probability_accuracy` | PR-G | Verify empirical Burst self-transition probability is within ±0.001 of 0.95 over 10M samples. |
| `proxy_shared_state_logged_unknown_dcs_isolation` | PR-B | Verify `LOGGED_UNKNOWN_DCS` does not leak between instances (if migrated). |
| `ipt_controller_pending_data_forces_burst_delay` | PR-G | Verify that `next_delay_us(rng, has_pending_data=true)` always returns Burst-range delay even when Markov state is Idle. Critical for connection liveness. |
| `ipt_controller_no_pending_data_returns_zero` | PR-G | Verify that `next_delay_us(rng, has_pending_data=false)` returns 0, ensuring no artificial stalling when the relay is idle. |
| `ipt_controller_burst_sample_overflow_safe` | PR-G | Verify LogNormal extreme tail samples don't overflow `saturating_mul(1_000)` and are properly clamped. |
| `ipt_controller_idle_sample_extreme_f64_safe` | PR-G | Verify Pareto samples of f64::INFINITY or f64::NAN are safely handled by `as u64` cast + clamp. |
| `drs_crypto_writer_buffering_chain_integrity` | PR-C | Verify that DRS → CryptoWriter (with internal pending buffer) → FakeTlsWriter produces correct TLS record boundaries. CryptoWriter may buffer; flush must drain the entire chain. |
| `drs_config_serde_default_upgrade_compat` | PR-C | Verify that deserializing a config.toml WITHOUT `drs_enabled` field produces `drs_enabled=true` (serde default). Tests upgrade compatibility. |

