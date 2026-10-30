// Order state machine. Terminal states have no exits. "draft" is reserved for future use.
const TRANSITIONS = {
  draft: ['pending_demo', 'cancelled'],
  pending_demo: ['completed_demo', 'cancelled', 'failed'],
  completed_demo: [],
  cancelled: [],
  failed: [],
};

export const canTransition = (from, to) => (TRANSITIONS[from] ?? []).includes(to);
