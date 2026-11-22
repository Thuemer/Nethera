# OpenWrt agent

The agent collects router telemetry and applies DNS controls (#23/#25). Time
control (#27) builds on Moritz's `b46710a`. Its current hardware verification and
remaining integration work are in
[device-time-limits/verification.md](../../openspec/changes/device-time-limits/verification.md).

## Time-control contract

Subscribe: `nethera/<routerId>/config/time`, QoS 1, retained. The complete desired
state is saved in `/etc/nethera/time-control.json` before applying it. Example
payload (documentation only, do not publish against a real router unchanged):

```json
{
  "v": 1,
  "version": 1,
  "timezone": "Europe/Vienna",
  "untilClockSync": "OPEN",
  "devices": {
    "02:00:00:00:00:01": {
      "windows": [{"days": ["MO", "TU", "WE", "TH", "FR"], "from": "21:00", "until": "07:00"}],
      "budgets": {"SA": 120, "SU": 120},
      "block": null,
      "allow": null
    }
  }
}
```

- Windows are blocked periods, not allowed periods. Their start weekday owns
  overnight windows. Time boundaries have one-minute resolution.
- `block` / `allow`: `null` means none; `{"until": null}` means indefinite;
  `{"until": 1795478400}` expires at that Unix timestamp in seconds. Block wins
  over allow, then windows, then budget. The backend resolves group membership.
- Versions must be positive and monotonic per router. Repeated identical state
  is accepted; older versions or changed state with the same version are rejected.
- An explicit `"devices": {}` removes all time rules. Missing/null is invalid.
  Limits: 256 KiB, 100 devices, 20 windows per device, budget 0-1440 minutes/day.
  A zero budget blocks that day immediately; omit the weekday for no budget.
- NTP must create `/var/run/nethera-ntp-synced`. Before that, `OPEN` applies only
  indefinite overrides; `BLOCK` blocks configured devices except indefinite allow.
  No usage is counted or saved until the clock is synchronized.

Publish: `nethera/<routerId>/telemetry/time`, QoS 1, retained, on a message and
every minute while time control is configured:

```json
{
  "v": 1, "ts": 1795380000, "version": 1,
  "applied": true, "clockSynced": true,
  "devices": {
    "02:00:00:00:00:01": {
      "usedMinutes": 10, "budgetMinutes": 120,
      "blocked": false
    }
  }
}
```

`reason` when blocked: `manual`, `window`, `budget`, `clock`. `budgetMinutes` is
null without a budget today. Errors have `applied: false` plus `error`; device
fields in a failed report are NOT confirmation of live enforcement. The backend
must compare the desired version and check freshness/online state before showing
anything as active. The backend publisher and report ingestion are still pending.

## Isolation and limitations

Own objects: `nethera_time`, `nethera_time_blocked`, `nethera_time_<MAC>` counters.
Own boot include: `/usr/share/nftables.d/table-post/91-nethera-time.nft`. Time
changes use a checked nft transaction, not a full firewall reload. DNS sets,
AdBlocker configuration, LAN bridge traffic and router management are not changed.
A DNS-triggered reload signals a time refresh; other reloads are caught next tick.

Active flowtables are rejected with an explicit error: offloading may bypass the
forward hook. The agent never silently changes that router-wide setting. Private
or changing client MACs require reassignment; this is not bypass-proof identity.

Usage is an estimate based on outgoing traffic above 20 KiB in a sampled minute,
not screen time. The threshold still needs idle/active hardware calibration.
Saved usage (`/etc/nethera/time-usage.json`) is restored after NTP in the selected
timezone. A power loss may lose up to five minutes. These paths are covered by
`router/files/lib/upgrade/keep.d/nethera-agent`.

## Tests

From this directory, with the Go version declared in `go.mod`:

```sh
go test -race ./...
docker build -f test.Dockerfile -t nethera-time-tests .
docker run --rm --network none --cap-add NET_ADMIN \
  -e NETHERA_NFT_INTEGRATION=1 \
  -v "$PWD:/workspace:ro" -w /workspace \
  -v nethera-time27-go-mod:/go/pkg/mod \
  -v nethera-time27-go-build:/root/.cache/go-build \
  nethera-time-tests go test -race -count=1 ./...
```

The real-nft test refuses a pre-existing `fw4` table and runs only in a disposable
container. It preserves actual generated device DNS sets for IPv4 and IPv6.
Populate the module cache with a normal test run in the same Go container first
when using `--network none` on a fresh machine.

`TestTimeHardwareWindow` is a separate opt-in physical test. It requires explicit
approval, a distinct test and management MAC, synchronized time, and no existing
time configuration/objects. It blocks only the test device until a near-future
minute boundary, with an independent 180-second cleanup watchdog. Never run it
as part of unattended deployment or against a household device without consent.
