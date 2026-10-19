# Schedule a directory

A watch is a directory plus a cron expression plus a couple of limits. The
server registers and describes watches; it never runs one. A pass happens when
`file-organizer-watch` (the daemon) or an OS timer calling `once` starts it.

That split is the thing to hold onto when verifying this feature: driving
`watch_directory` changes what the scheduler *would* do, and nothing more.

## Sub-features

- `watch_directory`: add a directory, or replace the schedule and rules of one already listed.
- `unwatch_directory`: remove a directory from the list.
- `list_watches`: the raw watch list, read-only.
- `watch_status`: that list plus next-run times and a per-watch liveness state.

## The loop

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs
D=/tmp/file-organizer-verify/default/data

node $C call watch_directory --directory $D --schedule "0 9 * * *" --json
node $C call list_watches --json
node $C call watch_status --json
node $C call unwatch_directory --directory $D --json
node $C call watch_status --json          # count is back to 0
```

`watch_status` writes nothing, so it is safe to call between the others.

## watch_status

The interesting part is `liveness`, which is one of four values rather than a
boolean, because the four cases need four answers:

- `never_run`: no pass has ever been recorded for the directory.
- `ok`: the last pass landed inside its own schedule interval.
- `stale`: it landed longer ago than the interval allows, so the timer is not firing.
- `unknown`: the schedule no longer parses, or the newest record is an error.

Each watch also carries `liveness_evidence` (a sentence naming the gap and the
interval), `last_pass.recorded_by` (`history` or `scheduler-state`), and
`scheduler` (`daemon`, `cron` or `none`), which is evidence of what has been
observed firing the watch. There is no pidfile and no heartbeat to poll.

To see `ok` rather than `never_run`, the directory needs a recorded pass first.
The cheapest way is `once` from the watch CLI, which writes history:

```bash
W=bin/file-organizer-watch
$W once $D --apply --source scheduled --json
node $C call watch_status --json
```

## Gotchas

- **A watch is configuration, not a running job.** Registering a directory starts
  nothing. `watch_status` can report `stale` on a perfectly valid watch because
  no timer is pointed at it, which is the tool telling the truth.
- **`--source` is what makes a pass scheduled**, and only a scheduled pass picks
  up the watch's `min_file_age_minutes` and `max_files_per_run`. A manual pass
  over the same directory is deliberately unfiltered.
- **`unwatch_directory` on a directory that is not listed is an error**, not a
  no-op, so a typo does not silently remove nothing.
- **`watch_directory` replaces rather than appends.** Registering a directory
  twice leaves one entry with the new schedule.
- **The schedule is evaluated in local time**, the timezone `node-cron` fires in.
  `0 9 * * *` is 9am wall clock, not 9am UTC. To prove it, compare `next_run`
  under two `TZ` values: `TZ=Asia/Tokyo` on `0 9 * * *` gives `00:00Z`.
- **`scheduler-state.json` is written by the daemon only.** A cron-only setup
  leaves `recorded_by: "scheduler-state"` unset and reports from history instead,
  which is expected rather than a gap.
