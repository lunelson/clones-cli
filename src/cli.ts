import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: {
    name: "clones",
    version: "1.0.0",
    description:
      "A read-only Git repository manager for exploration and reference",
  },
  subCommands: {
    add: () => import("./commands/add.js").then((m) => m.default),
    collect: () => import("./commands/collect.js").then((m) => m.default),
    doctor: () => import("./commands/doctor.js").then((m) => m.default),
    list: () => import("./commands/list.js").then((m) => m.default),
    rm: () => import("./commands/rm.js").then((m) => m.default),
    sync: () => import("./commands/sync.js").then((m) => m.default),
  },
  // Default: run interactive browser when no subcommand given
  async run() {
    const { default: browse } = await import("./commands/browse.js");
    await browse.run?.({ args: {} } as any);
  },
});

runMain(main);
