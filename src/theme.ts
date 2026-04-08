import chalk from "@tsjunk/chalk";

/** Terminal styling (respects `NO_COLOR` / chalk defaults). */
export const theme = {
  title: (s: string) => chalk.blue.bold(s),
  dim: (s: string) => chalk.gray(s),
  cmd: (s: string) => chalk.green.bold(s),
  warn: (s: string) => chalk.yellow.bold(s),
  err: (s: string) => chalk.red.bold(s),
  info: (s: string) => chalk.blue.bold(s),
};
