## Why
The frontend stores Normal/Bevorzugt per device, but the router does not enforce or confirm it. The test router changes networks, so no fixed ISP bandwidth may be assumed.

## What Changes
- Add independent priority service with MAC-based desired state, weighted egress queues and readback.
- Keep existing DNS agent, configuration and rules intact; refuse foreign queues and offloaded forwarding.
- Add versioned MQTT priority command/ack and account-scoped API status.
- Provide deploy, verification and rollback instructions; remove temporary SSH access after work.

## Capabilities
### New Capabilities
- `device-priority-control`: Device-weighted priority with isolated rules and truthful router confirmation.
### Modified Capabilities
None.

## Impact
Router Go binary (separate process and install path), tc/kernel packages, new backend state table and MQTT topics, existing frontend priority controls. No fixed rates or guaranteed ISP bandwidth; no cloud rollout without following LeoCloud instructions.
