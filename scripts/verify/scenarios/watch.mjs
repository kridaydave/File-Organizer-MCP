/**
 * The watch configuration loop: register, observe, remove. Only config.json is
 * touched; the watcher daemon itself is out of scope for scenarios.
 */

export const name = "watch";

export const scenarios = [
  {
    name: "watch-list-unwatch",
    steps: [
      {
        tool: "watch_directory",
        args: ({ sb }) => ({ directory: sb.dataDir, schedule: "0 3 * * *" }),
      },
      {
        tool: "list_watches",
        args: () => ({}),
        assert(body) {
          if (!JSON.stringify(body).includes("0 3 * * *")) {
            throw new Error(`list_watches does not show the registered schedule: ${JSON.stringify(body).slice(0, 300)}`);
          }
        },
      },
      {
        tool: "watch_status",
        args: () => ({}),
      },
      {
        tool: "unwatch_directory",
        args: ({ sb }) => ({ directory: sb.dataDir }),
      },
      {
        tool: "list_watches",
        args: () => ({}),
        assert(body) {
          if (JSON.stringify(body).includes("0 3 * * *")) {
            throw new Error("unwatch_directory left the schedule in the watch list");
          }
        },
      },
    ],
  },
];
