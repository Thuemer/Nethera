# Vendored cake-autorate

Upstream: https://github.com/lynxthecat/cake-autorate
Stable release: v3.2.1, commit 7157e2fe3e90e5feee78d55fee8593d08a56f3a1.
License: GPL-2.0, preserved in LICENCE.md and source headers.

Local changes in cake-autorate.sh only:
- Constrain every tc change to the reserved 7d00: handle. A different root cannot be changed even if another administrator replaces the queue between checks.
- Ignore bufferbloat reductions in a direction below the configured connection-active threshold; idle reflector jitter must not lower its rate.
- Write an atomic, once-per-second response timestamp after processing a fresh reflector response. Nethera uses it to reject stale adaptive confirmations.

No upstream installer, launcher or default SQM service is executed. Nethera generates an isolated config.nethera-priority.sh and owns its lifecycle.
