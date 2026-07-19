import { createStructuredLogger } from "./index.ts";

/** Server-only sink for already-redacted JSON log records. */
export const runtimeLogger = createStructuredLogger({
  sink(serialized, record) {
    if (record.level === "error") {
      console.error(serialized);
      return;
    }

    console.log(serialized);
  },
});
