import { env } from "cloudflare:workers";
import { transitionModules } from "@/db/artist-state-write.ts";
import {
  readJsonMutation,
  requireApplicationAuthority,
  requireIdempotencyKey,
} from "@/lib/auth/authorize-application.ts";
import { isModuleKey, type ModuleKey } from "@/lib/modules/index.ts";
import { apiJson, runApiRoute } from "@/lib/runtime/api.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";

export const dynamic = "force-dynamic";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidInput(message: string, details?: unknown): RuntimeError {
  return new RuntimeError("INVALID_INPUT", message, {
    status: 400,
    publicMessage: "Provide valid optional modules for this change.",
    ...(details === undefined ? {} : { details }),
  });
}

function readModuleKeys(
  value: unknown,
  field: "activate" | "deactivate",
): readonly ModuleKey[] {
  if (!Array.isArray(value)) {
    throw invalidInput(`${field} must be an array of optional module keys.`, {
      field,
    });
  }

  const keys: ModuleKey[] = [];
  const seen = new Set<ModuleKey>();
  value.forEach((candidate, index) => {
    if (!isModuleKey(candidate)) {
      throw invalidInput(
        `${field}[${index}] must be a supported optional module key.`,
        { field, index },
      );
    }
    if (seen.has(candidate)) {
      throw invalidInput(`${field} must not contain duplicate module keys.`, {
        field,
        index,
      });
    }
    seen.add(candidate);
    keys.push(candidate);
  });

  return Object.freeze(keys);
}

function readTransitionInput(input: unknown): {
  readonly activate: readonly ModuleKey[];
  readonly deactivate: readonly ModuleKey[];
} {
  if (!isPlainRecord(input)) {
    throw invalidInput("Module transition input must be an object.");
  }

  const keys = Object.keys(input).sort();
  if (keys.length !== 2 || keys[0] !== "activate" || keys[1] !== "deactivate") {
    throw invalidInput(
      "Module transition input must contain activate and deactivate arrays.",
    );
  }

  const activate = readModuleKeys(input.activate, "activate");
  const deactivate = readModuleKeys(input.deactivate, "deactivate");
  const deactivateSet = new Set(deactivate);
  const conflict = activate.find((moduleKey) => deactivateSet.has(moduleKey));
  if (conflict) {
    throw invalidInput(
      `Module "${conflict}" cannot be activated and deactivated together.`,
      { moduleKey: conflict },
    );
  }

  return Object.freeze({ activate, deactivate });
}

export async function PUT(request: Request): Promise<Response> {
  return runApiRoute("admin.modules_transition_failed", async (requestId) => {
    const input = readTransitionInput(await readJsonMutation(request));
    const idempotencyKey = requireIdempotencyKey(request);
    const owner = await requireApplicationAuthority(env.DB, ["owner"]);
    const mutation = await transitionModules(env.DB, input, {
      actorUserId: owner.userId,
      idempotencyKey,
      requestId,
    });

    return apiJson(
      { result: mutation.value, replayed: mutation.replayed },
      requestId,
    );
  });
}
