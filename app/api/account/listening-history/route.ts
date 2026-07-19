import { env } from "cloudflare:workers";
import { readListeningHistory } from "@/db/customer-read.ts";
import { checkpointListeningHistory } from "@/db/customer-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { validateListeningCheckpointInput } from "@/lib/customer-library/validation.ts";
import { requireActiveModule } from "@/lib/modules/active-module.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { requireCustomerLibraryInput } from "../customer-library-input.ts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return runApiRoute(
    "account.listening_history_read_failed",
    async (requestId) => {
      const identity = await requireApplicationAuthority(env.DB, ["customer"]);
      await requireActiveModule(env.DB, "customer-library");
      const listeningHistory = await readListeningHistory(
        env.DB,
        identity.userId,
      );
      return apiJson({ listeningHistory }, requestId);
    },
  );
}

export async function PUT(request: Request): Promise<Response> {
  return runApiRoute(
    "account.listening_checkpoint_failed",
    async (requestId) => {
      const requestInput = await readJsonMutation(request);
      const idempotencyKey = requireIdempotencyKey(request);
      const input = requireCustomerLibraryInput(
        validateListeningCheckpointInput(requestInput),
        "Listening checkpoint",
      );
      const identity = await requireApplicationAuthority(env.DB, ["customer"]);
      await requireActiveModule(env.DB, "customer-library");
      const result = await checkpointListeningHistory(env.DB, input, {
        actorUserId: identity.userId,
        idempotencyKey,
        requestId,
      });

      return apiJson(
        { result: result.value, replayed: result.replayed },
        requestId,
      );
    },
  );
}
