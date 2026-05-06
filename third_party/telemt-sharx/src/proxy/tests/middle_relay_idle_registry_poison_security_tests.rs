use super::*;
use std::panic::{AssertUnwindSafe, catch_unwind};

#[test]
fn blackhat_registry_poison_recovers_with_fail_closed_reset_and_pressure_accounting() {
    let shared = ProxySharedState::new();
    clear_relay_idle_pressure_state_for_testing_in_shared(shared.as_ref());

    let _ = catch_unwind(AssertUnwindSafe(|| {
        let mut guard = shared
            .middle_relay
            .relay_idle_registry
            .lock()
            .expect("registry lock must be acquired before poison");
        guard.by_conn_id.insert(
            999,
            RelayIdleCandidateMeta {
                mark_order_seq: 1,
                mark_pressure_seq: 0,
            },
        );
        guard.ordered.insert((1, 999));
        panic!("intentional poison for idle-registry recovery");
    }));

    // Helper lock must recover from poison, reset stale state, and continue.
    assert!(mark_relay_idle_candidate_for_testing(shared.as_ref(), 42));
    assert_eq!(
        oldest_relay_idle_candidate_for_testing(shared.as_ref()),
        Some(42)
    );

    let before = relay_pressure_event_seq_for_testing(shared.as_ref());
    note_relay_pressure_event_for_testing(shared.as_ref());
    let after = relay_pressure_event_seq_for_testing(shared.as_ref());
    assert!(
        after > before,
        "pressure accounting must still advance after poison"
    );

    clear_relay_idle_pressure_state_for_testing_in_shared(shared.as_ref());
}

#[test]
fn clear_state_helper_must_reset_poisoned_registry_for_deterministic_fifo_tests() {
    let shared = ProxySharedState::new();
    clear_relay_idle_pressure_state_for_testing_in_shared(shared.as_ref());

    let _ = catch_unwind(AssertUnwindSafe(|| {
        let _guard = shared
            .middle_relay
            .relay_idle_registry
            .lock()
            .expect("registry lock must be acquired before poison");
        panic!("intentional poison while lock held");
    }));

    clear_relay_idle_pressure_state_for_testing_in_shared(shared.as_ref());

    assert_eq!(
        oldest_relay_idle_candidate_for_testing(shared.as_ref()),
        None
    );
    assert_eq!(relay_pressure_event_seq_for_testing(shared.as_ref()), 0);

    assert!(mark_relay_idle_candidate_for_testing(shared.as_ref(), 7));
    assert_eq!(
        oldest_relay_idle_candidate_for_testing(shared.as_ref()),
        Some(7)
    );

    clear_relay_idle_pressure_state_for_testing_in_shared(shared.as_ref());
}
