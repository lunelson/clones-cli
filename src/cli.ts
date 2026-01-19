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
    list: () => import("./commands/list.js").then((m) => m.default),
    rm: () => import("./commands/rm.js").then((m) => m.default),
    update: () => import("./commands/update.js").then((m) => m.default),
  },
});

runMain(main);
