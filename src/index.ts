import { main } from "./cli.js";
import { theme } from "./theme.js";

main(process.argv).catch((err) => {
  console.error(theme.err(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
