import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import { activeOwnerCondition } from "./authority-guards.ts";
import { runAtomicBatch } from "./d1.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  staleMutation,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import { readArtistModules } from "./site-read.ts";
import type { ModuleKey } from "@/lib/modules/index.ts";
import type { PageHeroKey } from "@/lib/setup/types.ts";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const PRIVATE_DERIVATIVE_KEY = /^derivatives\/[a-z0-9][a-z0-9._/-]{0,499}$/i;

const MODULE_BY_PAGE = Object.freeze({
  courses: "courses",
  videos: "video",
  membership: "memberships",
  licensing: "licensing",
} satisfies Readonly<Record<PageHeroKey, ModuleKey>>);
const PAGE_HERO_MODULES = new Set<ModuleKey>(Object.values(MODULE_BY_PAGE));

export interface PageHeroSetting {
  readonly pageKey: PageHeroKey;
  readonly mediaDerivativeId: string;
  readonly altText: string;
}

export interface PublicPageHero {
  readonly pageKey: PageHeroKey;
  readonly altText: string;
  readonly url: string;
}

export interface PageHeroDeliveryRecord {
  readonly derivativeId: string;
  readonly objectKey: string;
  readonly contentType: string;
  readonly byteLength: number;
}

export interface PageHeroReconcileResult {
  readonly pageKeys: readonly PageHeroKey[];
  readonly changedModules: readonly ModuleKey[];
}

interface HeroDeliveryRow {
  derivative_id: unknown;
  object_key: unknown;
  content_type: unknown;
  byte_length: unknown;
}

function parseSetting(value: unknown): PageHeroSetting | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const object = value as Record<string, unknown>;
  if (
    (object.pageKey !== "courses" &&
      object.pageKey !== "videos" &&
      object.pageKey !== "membership" &&
      object.pageKey !== "licensing") ||
    typeof object.mediaDerivativeId !== "string" ||
    !SAFE_ID.test(object.mediaDerivativeId) ||
    typeof object.altText !== "string" ||
    object.altText.trim().length === 0 ||
    object.altText.length > 500
  ) {
    return null;
  }
  return Object.freeze({
    pageKey: object.pageKey,
    mediaDerivativeId: object.mediaDerivativeId,
    altText: object.altText,
  });
}

function sameSetting(
  left: PageHeroSetting | null,
  right: PageHeroSetting | null,
): boolean {
  return (
    left?.pageKey === right?.pageKey &&
    left?.mediaDerivativeId === right?.mediaDerivativeId &&
    left?.altText === right?.altText
  );
}

export async function reconcilePageHeroes(
  binding: D1Database,
  heroes: readonly PageHeroSetting[],
  context: MutationContext,
): Promise<MutationResult<PageHeroReconcileResult>> {
  const operation = "page-heroes.reconcile";
  const mutation = await prepareMutation<PageHeroReconcileResult>(
    binding,
    operation,
    context,
    { heroes },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const desiredByModule = new Map<ModuleKey, PageHeroSetting>(
    heroes.map((hero) => [MODULE_BY_PAGE[hero.pageKey], hero] as const),
  );
  const modules = await readArtistModules(binding);
  const changes = modules.flatMap((module) => {
    if (!PAGE_HERO_MODULES.has(module.moduleKey)) return [];
    const desired = desiredByModule.get(module.moduleKey) ?? null;
    const current = parseSetting(module.settings.pageHero);
    if (sameSetting(current, desired)) return [];
    const next = { ...module.settings } as Record<string, unknown>;
    if (desired) next.pageHero = desired;
    else delete next.pageHero;
    return [{ module, settingsJson: JSON.stringify(next) }];
  });
  const result: PageHeroReconcileResult = Object.freeze({
    pageKeys: Object.freeze(heroes.map(({ pageKey }) => pageKey).sort()),
    changedModules: Object.freeze(
      changes.map(({ module }) => module.moduleKey).sort(),
    ),
  });
  if (changes.length === 0) return { value: result, replayed: false };

  const authority = activeOwnerCondition(context.actorUserId);
  const statements = changes.map(({ module, settingsJson }) =>
    binding
      .prepare(
        `UPDATE artist_modules
         SET settings_json = ?1, revision = revision + 1,
             updated_by_user_id = ?2,
             updated_at = CURRENT_TIMESTAMP
         WHERE module_key = ?3 AND revision = ?4 AND active = 1
           AND ${authority.sql}`,
      )
      .bind(
        settingsJson,
        context.actorUserId,
        module.moduleKey,
        module.revision,
        ...authority.bindings,
      ),
  );
  statements.push(
    prepareConditionalAuditEvent(
      binding,
      {
        actorUserId: context.actorUserId,
        action: operation,
        subjectType: "page-presentation",
        subjectId: "public-page-heroes",
        idempotencyKey: mutation.namespacedKey,
        requestFingerprint: mutation.fingerprint,
        requestId: context.requestId,
        details: { pageKeys: result.pageKeys },
        result: { ...result },
      },
      `(
        SELECT COUNT(*) FROM artist_modules
        WHERE ${changes
          .map(() => "(module_key = ? AND revision = ? AND settings_json = ?)")
          .join(" OR ")}
      ) = ? AND ${authority.sql}`,
      [
        ...changes.flatMap(({ module, settingsJson }) => [
          module.moduleKey,
          module.revision + 1,
          settingsJson,
        ]),
        changes.length,
        ...authority.bindings,
      ],
    ),
  );

  try {
    const results = await runAtomicBatch(binding, statements);
    if (
      results
        .slice(0, changes.length)
        .some((statement) => changedRows(statement) !== 1)
    ) {
      throw staleMutation("page hero presentation");
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

export async function readPublicPageHero(
  binding: D1Database,
  pageKey: PageHeroKey,
): Promise<PublicPageHero | null> {
  const moduleKey = MODULE_BY_PAGE[pageKey];
  const row = await binding
    .prepare(
      `SELECT settings_json
       FROM artist_modules
       WHERE module_key = ?1 AND active = 1
       LIMIT 1`,
    )
    .bind(moduleKey)
    .first<{ settings_json: unknown }>();
  if (!row || typeof row.settings_json !== "string") return null;
  let settings: unknown;
  try {
    settings = JSON.parse(row.settings_json);
  } catch {
    return null;
  }
  if (
    settings === null ||
    typeof settings !== "object" ||
    Array.isArray(settings)
  ) {
    return null;
  }
  const hero = parseSetting((settings as Record<string, unknown>).pageHero);
  if (!hero || hero.pageKey !== pageKey) return null;
  return Object.freeze({
    pageKey,
    altText: hero.altText,
    url: `/api/media/heroes/${pageKey}`,
  });
}

export async function readPageHeroDelivery(
  binding: D1Database,
  pageKey: PageHeroKey,
): Promise<PageHeroDeliveryRecord | null> {
  const moduleKey = MODULE_BY_PAGE[pageKey];
  const row = await binding
    .prepare(
      `SELECT derivative.id AS derivative_id,
              derivative.object_key AS object_key,
              derivative.content_type AS content_type,
              derivative.byte_length AS byte_length
       FROM artist_modules AS module
       JOIN media_derivatives AS derivative
         ON derivative.id = json_extract(module.settings_json, '$.pageHero.mediaDerivativeId')
       JOIN media_objects AS source ON source.id = derivative.source_media_id
       WHERE module.module_key = ?1 AND module.active = 1
         AND json_extract(module.settings_json, '$.pageHero.pageKey') = ?2
         AND derivative.kind IN ('artwork', 'poster', 'thumbnail', 'other')
         AND derivative.status = 'ready'
         AND derivative.approval_state = 'approved'
         AND derivative.object_key GLOB 'derivatives/*'
         AND derivative.content_type LIKE 'image/%'
         AND derivative.byte_length IS NOT NULL
         AND derivative.content_sha256 IS NOT NULL
         AND source.kind = 'image'
         AND source.status = 'ready'
         AND source.approval_state = 'approved'
         AND source.content_type LIKE 'image/%'
         AND source.content_sha256 IS NOT NULL
       LIMIT 1`,
    )
    .bind(moduleKey, pageKey)
    .first<HeroDeliveryRow>();
  if (
    !row ||
    typeof row.derivative_id !== "string" ||
    !SAFE_ID.test(row.derivative_id) ||
    typeof row.object_key !== "string" ||
    !PRIVATE_DERIVATIVE_KEY.test(row.object_key) ||
    row.object_key.includes("..") ||
    typeof row.content_type !== "string" ||
    !row.content_type.startsWith("image/") ||
    !Number.isSafeInteger(row.byte_length) ||
    (row.byte_length as number) <= 0
  ) {
    return null;
  }
  return Object.freeze({
    derivativeId: row.derivative_id,
    objectKey: row.object_key,
    contentType: row.content_type,
    byteLength: row.byte_length as number,
  });
}
