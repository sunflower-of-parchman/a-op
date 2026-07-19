import { env } from "cloudflare:workers";
import { expireCreditReservation } from "@/db/credit-ledger-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import {
  requireExpectedVersion,
  requireMutationObject,
} from "@/app/api/admin/mutation-input.ts";

export const dynamic = "force-dynamic";

interface ReservationRouteContext {
  readonly params: Promise<{ reservationId: string }>;
}

export async function POST(
  request: Request,
  context: ReservationRouteContext,
): Promise<Response> {
  return runApiRoute(
    "admin.credit_reservation_expire_failed",
    async (requestId) => {
      const input = requireMutationObject(
        await readJsonMutation(request),
        ["expectedReservationRevision", "expectedAccountRevision"],
        "Credit reservation expiration",
      );
      const expectedReservationRevision = requireExpectedVersion(
        input.expectedReservationRevision,
        { allowZero: false },
      );
      const expectedAccountRevision = requireExpectedVersion(
        input.expectedAccountRevision,
        { allowZero: false },
      );
      const idempotencyKey = requireIdempotencyKey(request);
      const owner = await requireApplicationAuthority(env.DB, ["owner"]);
      const result = await expireCreditReservation(
        env.DB,
        (await context.params).reservationId,
        expectedReservationRevision,
        expectedAccountRevision,
        { actorUserId: owner.userId, idempotencyKey, requestId },
      );

      return apiJson(
        { result: result.value, replayed: result.replayed },
        requestId,
      );
    },
  );
}
