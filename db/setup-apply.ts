import {
  publishArtistDraft,
  publishNavigationSnapshot,
  saveArtistDraft,
  saveNavigationSnapshot,
  transitionModules,
  type NavigationItemInput,
} from "./artist-state-write.ts";
import {
  publishCollection,
  publishRelease,
  publishTrack,
  saveCollectionDraft,
  saveReleaseDraft,
  saveTrackDraft,
} from "./catalog-write.ts";
import {
  readAdminCollectionDraft,
  readAdminReleaseDraft,
  readAdminTrackDraft,
} from "./catalog-admin-read.ts";
import { configureContactForm } from "./contact-write.ts";
import { readContactAdminWorkspace } from "./contact-read.ts";
import { publishCourse, saveCourseDraft } from "./course-write.ts";
import { readAdminCourseDraft } from "./course-read.ts";
import { saveLegalDocumentDraft } from "./legal-write.ts";
import { readLegalAdminWorkspace } from "./legal-read.ts";
import {
  assertSetupMediaBindings,
  resolveSetupCourseMediaItems,
  resolveSetupTrackMedia,
  resolveSetupVideoMedia,
  type SetupCourseMediaItemBinding,
  type SetupVideoMediaBinding,
} from "./setup-media.ts";
import { createAccessPlan, updateAccessPlan } from "./access-admin-write.ts";
import { readAdminAccessOverview } from "./access-admin-read.ts";
import { updateTelemetrySettings } from "./telemetry-write.ts";
import { readTelemetrySettings } from "./telemetry-read.ts";
import {
  createMembershipPlan,
  createSubscriptionPlan,
  reviseMembershipPlan,
  reviseSubscriptionPlan,
} from "./membership-write.ts";
import { readMembershipPlan, readSubscriptionPlan } from "./membership-read.ts";
import { createLicenseTerms, reviseLicenseTerms } from "./licensing-write.ts";
import { readLicenseAdministration } from "./licensing-read.ts";
import { grantEditor } from "./role-write.ts";
import { publishVideo, saveVideoDraft } from "./video-write.ts";
import { readAdminVideoBySlug } from "./video-read.ts";
import {
  readActiveModuleKeys,
  readDraftArtistRevision,
  readNavigationSnapshot,
  readPublishedArtistRevision,
} from "./site-read.ts";
import { activeOwnerCondition } from "./authority-guards.ts";
import { changedRows, prepareConditionalAuditEvent } from "./audit-events.ts";
import {
  prepareMutation,
  replayAfterMutationFailure,
  type MutationContext,
  type MutationResult,
} from "./mutation.ts";
import type {
  AccessPlanItemInput,
  AdminAccessPlanDTO,
} from "@/lib/access-management/index.ts";
import type {
  AdminCollectionDraft,
  AdminReleaseDraft,
  AdminTrackDraft,
  CatalogAccessMode,
  CollectionDraftInput,
  ReleaseDraftInput,
  TrackDraftInput,
} from "@/lib/catalog/index.ts";
import type {
  MembershipPlanDefinitionInput,
  MembershipPlanDTO,
  SubscriptionPlanDTO,
} from "@/lib/memberships/types.ts";
import type {
  LicenseOptionDefinitionInput,
  LicenseTermsDefinitionInput,
  LicenseTermsDTO,
} from "@/lib/licensing/types.ts";
import type { CourseDraftInput } from "@/lib/courses/index.ts";
import {
  createDefaultLegalSetupAnswers,
  type LegalSetupAnswers,
} from "@/lib/legal/index.ts";
import { MODULE_KEYS, type ModuleKey } from "@/lib/modules/index.ts";
import { RuntimeError } from "@/lib/runtime/index.ts";
import { namespacedIdempotencyKey } from "@/lib/runtime/idempotency.ts";
import { canonicalJson, sha256 } from "@/lib/setup/canonical.ts";
import { createProposalArtifact } from "@/lib/setup/proposal.ts";
import {
  NO_REAL_PAYMENT_STATEMENT,
  SETUP_OPERATION_PLAN_SCHEMA_VERSION,
  SETUP_TOPIC_KEYS,
  type CatalogCollectionProposal,
  type CatalogReleaseProposal,
  type CourseProposal,
  type CreditRuleProposal,
  type EditorAccountProposal,
  type LicenseOptionProposal,
  type LicenseTermsProposal,
  type MembershipPlanProposal,
  type SetupOperation,
  type SetupOperationPlan,
  type SetupApprovalScope,
  type SetupProposal,
  type SetupProposalArtifact,
  type SetupTopicKey,
  type TrackAvailabilityProposal,
  type SubscriptionPlanProposal,
  type VideoProposal,
} from "@/lib/setup/types.ts";
import type { VideoDraftInput } from "@/lib/video/index.ts";

export const SETUP_OPERATION_RECEIPT_SCHEMA_VERSION =
  "aop.setup-operation-receipt.v1" as const;
export const SETUP_APPLY_RECEIPT_SCHEMA_VERSION =
  "aop.setup-apply-receipt.v1" as const;

export interface SetupOperationApplyReceipt {
  readonly schemaVersion: typeof SETUP_OPERATION_RECEIPT_SCHEMA_VERSION;
  readonly proposalId: string;
  readonly operationId: string;
  readonly topic: SetupTopicKey | "media" | "source" | "external";
  readonly action: string;
  readonly target: string;
  readonly outcome: "applied" | "no-op";
  readonly resourceCount: number;
  readonly domainMutationCount: number;
  readonly newDomainMutationCount: number;
  readonly resumedDomainMutationCount: number;
  readonly replayed: boolean;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
}

export interface SetupApplyReceipt {
  readonly schemaVersion: typeof SETUP_APPLY_RECEIPT_SCHEMA_VERSION;
  readonly proposalId: string;
  readonly proposalHash: string;
  readonly sourceStateFingerprint: string;
  readonly operationCount: number;
  readonly appliedCount: number;
  readonly noOpCount: number;
  readonly replayedCount: number;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly statement: typeof NO_REAL_PAYMENT_STATEMENT;
  readonly operations: readonly SetupOperationApplyReceipt[];
}

interface OperationContract {
  readonly topic: SetupTopicKey;
  readonly target: string;
  readonly requiredApproval: SetupApprovalScope;
}

const OPERATION_CONTRACTS = Object.freeze({
  "upsert-artist-draft": Object.freeze({
    topic: "artist",
    target: "artist",
    requiredApproval: "configuration",
  }),
  "reconcile-modules-navigation": Object.freeze({
    topic: "capabilities-navigation",
    target: "module-registry",
    requiredApproval: "configuration",
  }),
  "record-media-rights-intent": Object.freeze({
    topic: "rights-media",
    target: "media-rights",
    requiredApproval: "configuration",
  }),
  "reconcile-catalog-drafts": Object.freeze({
    topic: "catalog-releases",
    target: "catalog",
    requiredApproval: "configuration",
  }),
  "reconcile-track-availability": Object.freeze({
    topic: "streaming-downloads",
    target: "track-availability",
    requiredApproval: "configuration",
  }),
  "reconcile-access-definitions": Object.freeze({
    topic: "customer-access",
    target: "access-definitions",
    requiredApproval: "configuration",
  }),
  "reconcile-membership-definitions": Object.freeze({
    topic: "memberships-subscriptions",
    target: "membership-definitions",
    requiredApproval: "configuration",
  }),
  "reconcile-credit-rules": Object.freeze({
    topic: "credits",
    target: "credit-rules",
    requiredApproval: "configuration",
  }),
  "reconcile-licensing-definitions": Object.freeze({
    topic: "licensing",
    target: "licensing-definitions",
    requiredApproval: "configuration",
  }),
  "reconcile-courses-video-drafts": Object.freeze({
    topic: "courses-video",
    target: "courses-video",
    requiredApproval: "configuration",
  }),
  "reconcile-contact-consent": Object.freeze({
    topic: "contact-consent",
    target: "contact-consent",
    requiredApproval: "configuration",
  }),
  "reconcile-telemetry-settings": Object.freeze({
    topic: "telemetry-retention",
    target: "telemetry-settings",
    requiredApproval: "configuration",
  }),
  "save-legal-drafts": Object.freeze({
    topic: "privacy-terms",
    target: "legal-documents",
    requiredApproval: "legal-drafts",
  }),
  "reconcile-account-authority": Object.freeze({
    topic: "accounts-publication",
    target: "account-authority",
    requiredApproval: "account-authority",
  }),
  "publish-approved-internal-state": Object.freeze({
    topic: "accounts-publication",
    target: "internal-publication",
    requiredApproval: "internal-publication",
  }),
} satisfies Readonly<Record<string, OperationContract>>);

const BASE_D1_ACTIONS = Object.freeze([
  "upsert-artist-draft",
  "reconcile-modules-navigation",
  "record-media-rights-intent",
  "reconcile-catalog-drafts",
  "reconcile-track-availability",
  "reconcile-access-definitions",
  "reconcile-membership-definitions",
  "reconcile-credit-rules",
  "reconcile-licensing-definitions",
  "reconcile-courses-video-drafts",
  "reconcile-contact-consent",
  "reconcile-telemetry-settings",
  "save-legal-drafts",
  "reconcile-account-authority",
] as const);

interface HandlerResult {
  readonly outcome: "applied" | "no-op";
  readonly resourceCount: number;
}

interface DomainMutationCounts {
  total: number;
  fresh: number;
  resumed: number;
}

interface StoredReceiptRow {
  result_json: string;
}

interface CatalogTrackRow {
  id: string;
  publication_state: string;
}

interface AccessResource {
  readonly resourceType: "track" | "course";
  readonly resourceId: string;
}

function setupError(
  code: string,
  message: string,
  publicMessage: string,
  status = 409,
): RuntimeError {
  return new RuntimeError(code, message, { status, publicMessage });
}

function invalidPlan(message: string): never {
  throw setupError(
    "SETUP_PLAN_INVALID",
    message,
    "The setup operation plan is invalid. Create a new preview before applying it.",
    400,
  );
}

function unsupported(topic: SetupTopicKey, reason: string): never {
  throw setupError(
    "SETUP_OPERATION_UNSUPPORTED",
    `${topic}: ${reason}`,
    "This setup topic needs a supported product workflow before it can be applied.",
  );
}

function publicationRequested(proposal: SetupProposal): boolean {
  const publication = proposal.topics.accountsPublication.publication;
  return (
    publication.artist === "publish" ||
    publication.navigation === "publish" ||
    publication.catalog === "publish" ||
    publication.content === "publish"
  );
}

function expectedD1Actions(proposal: SetupProposal): readonly string[] {
  return publicationRequested(proposal)
    ? Object.freeze([...BASE_D1_ACTIONS, "publish-approved-internal-state"])
    : BASE_D1_ACTIONS;
}

function operationContract(action: string): OperationContract {
  const contract = (
    OPERATION_CONTRACTS as Readonly<Record<string, OperationContract>>
  )[action];
  if (!contract) invalidPlan(`Unsupported D1 setup action: ${action}.`);
  return contract;
}

async function assertOperationIdentity(
  artifact: SetupProposalArtifact,
  operation: SetupOperation,
): Promise<void> {
  const contract = operationContract(operation.action);
  if (
    operation.topic !== contract.topic ||
    operation.target !== contract.target ||
    operation.requiredApproval !== contract.requiredApproval ||
    operation.mutationBoundary !== "d1" ||
    operation.state !== "ready"
  ) {
    invalidPlan(
      `The ${operation.action} operation does not match its D1 contract.`,
    );
  }
  const digest = await sha256(
    [
      artifact.proposalHash,
      operation.topic,
      operation.action,
      operation.target,
      "",
    ].join("\n"),
  );
  const suffix = digest.slice("sha256:".length);
  if (
    operation.operationId !== `op-${suffix.slice(0, 24)}` ||
    operation.idempotencyKey !== `setup-${suffix.slice(0, 32)}`
  ) {
    invalidPlan(
      `The ${operation.action} operation identity is not deterministic.`,
    );
  }
}

function assertProposalSupport(proposal: SetupProposal): void {
  if (proposal.topics.artist.artistKey !== "artist") {
    unsupported(
      "artist",
      "The Sites installation has one fixed artist aggregate.",
    );
  }

  const access = proposal.topics.customerAccess;
  if (
    access.accessPlans.some(
      ({ resourceType, resourceKeys }) =>
        (resourceType !== "track" && resourceType !== "course") ||
        resourceKeys.length === 0,
    )
  ) {
    unsupported(
      "customer-access",
      "Current access-plan writers require at least one track or Course resource.",
    );
  }
}

async function validatedArtifactAndPlan(
  proposal: SetupProposal,
  plan: SetupOperationPlan,
): Promise<SetupProposalArtifact> {
  const artifact = await createProposalArtifact(proposal);
  if (
    plan.schemaVersion !== SETUP_OPERATION_PLAN_SCHEMA_VERSION ||
    plan.proposalId !== artifact.proposal.proposalId ||
    plan.proposalHash !== artifact.proposalHash ||
    plan.sourceStateFingerprint !== artifact.proposal.sourceStateFingerprint ||
    plan.writesPerformed !== 0 ||
    !plan.readyForApply ||
    plan.blockers.length !== 0
  ) {
    invalidPlan("The plan does not match the exact validated proposal.");
  }
  if (plan.operations.length === 0) invalidPlan("The D1 plan is empty.");

  const actionSet = new Set<string>();
  const idSet = new Set<string>();
  const keySet = new Set<string>();
  for (const operation of plan.operations) {
    if (
      actionSet.has(operation.action) ||
      idSet.has(operation.operationId) ||
      keySet.has(operation.idempotencyKey)
    ) {
      invalidPlan("The D1 plan contains a duplicate operation identity.");
    }
    actionSet.add(operation.action);
    idSet.add(operation.operationId);
    keySet.add(operation.idempotencyKey);
    await assertOperationIdentity(artifact, operation);
  }

  const expected = expectedD1Actions(artifact.proposal);
  if (
    actionSet.size !== expected.length ||
    expected.some((action) => !actionSet.has(action)) ||
    plan.operations.some(
      (operation, index) => operation.action !== expected[index],
    )
  ) {
    invalidPlan(
      "The D1 plan does not contain the complete dependency-ordered setup topic set.",
    );
  }
  assertProposalSupport(artifact.proposal);
  return artifact;
}

async function assertStoredProposalSupport(
  binding: D1Database,
  proposal: SetupProposal,
  actorUserId: string,
): Promise<void> {
  await assertSetupMediaBindings(binding, proposal, actorUserId);

  for (const template of proposal.topics.customerAccess.grantTemplates) {
    const current = await readGrantTemplate(binding, template.grantKey);
    if (current?.state === "archived") {
      unsupported(
        "customer-access",
        `Grant template ${template.grantKey} is archived and immutable.`,
      );
    }
  }

  for (const plan of proposal.topics.membershipsSubscriptions.membershipPlans) {
    const current = await membershipPlanBySlug(binding, plan.planKey);
    if (current?.state === "archived") {
      unsupported(
        "memberships-subscriptions",
        `Membership plan ${plan.planKey} is archived and immutable.`,
      );
    }
  }
  for (const plan of proposal.topics.membershipsSubscriptions
    .subscriptionPlans) {
    const current = await subscriptionPlanBySlug(binding, plan.planKey);
    if (current?.state === "archived") {
      unsupported(
        "memberships-subscriptions",
        `Subscription plan ${plan.planKey} is archived and immutable.`,
      );
    }
  }

  for (const [creditKind, rules] of [
    ["download", proposal.topics.credits.downloadCreditRules],
    ["license", proposal.topics.credits.licenseCreditRules],
  ] as const) {
    for (const rule of rules) {
      const current = await readMembershipCreditRule(binding, rule.ruleKey);
      if (current?.state === "archived") {
        unsupported(
          "credits",
          `${creditKind} credit rule ${rule.ruleKey} is archived and immutable.`,
        );
      }
    }
  }

  if (proposal.topics.licensing.terms.length > 0) {
    const administration = await readLicenseAdministration(
      binding,
      actorUserId,
    );
    const bySlug = new Map(
      administration.terms.map((terms) => [terms.slug, terms]),
    );
    for (const terms of proposal.topics.licensing.terms) {
      const current = bySlug.get(terms.termsKey) ?? null;
      if (!current) {
        if (terms.version !== 1) {
          unsupported(
            "licensing",
            `New license terms ${terms.termsKey} must begin at version 1.`,
          );
        }
        continue;
      }
      if (current.state === "archived") {
        unsupported(
          "licensing",
          `License terms ${terms.termsKey} are archived and immutable.`,
        );
      }
      const desired = setupLicenseTermsDefinition(proposal, terms);
      if (terms.version === current.version.version) {
        if (!sameLicenseTermsDefinition(current, desired)) {
          unsupported(
            "licensing",
            `Changed license terms ${terms.termsKey} require version ${current.version.version + 1}.`,
          );
        }
      } else if (terms.version !== current.version.version + 1) {
        unsupported(
          "licensing",
          `License terms ${terms.termsKey} must retain version ${current.version.version} when unchanged or propose version ${current.version.version + 1}.`,
        );
      }
    }
  }

  for (const editor of proposal.topics.accountsPublication
    .editorAccountAliases) {
    const identity = await binding
      .prepare(
        `SELECT status FROM users
         WHERE normalized_email = lower(trim(?1))
         LIMIT 1`,
      )
      .bind(editor.email)
      .first<{ status: string }>();
    if (identity?.status === "disabled") {
      unsupported(
        "accounts-publication",
        "A disabled account cannot receive editor authority through setup.",
      );
    }
  }
}

async function requireOwner(
  binding: D1Database,
  actorUserId: string,
): Promise<void> {
  const authority = activeOwnerCondition(actorUserId);
  const row = await binding
    .prepare(`SELECT 1 AS allowed WHERE ${authority.sql}`)
    .bind(...authority.bindings)
    .first<{ allowed: number }>();
  if (row?.allowed !== 1) {
    throw setupError(
      "SETUP_OWNER_REQUIRED",
      "Setup apply requires a current owner authority record.",
      "Only the active owner can apply setup.",
      403,
    );
  }
}

function operationContext(
  context: MutationContext,
  operation: SetupOperation,
): MutationContext {
  return {
    actorUserId: context.actorUserId,
    idempotencyKey: operation.idempotencyKey,
    requestId: context.requestId,
    ...(context.telemetry ? { telemetry: context.telemetry } : {}),
  };
}

function childContext(
  context: MutationContext,
  operation: SetupOperation,
  suffix?: string,
): MutationContext {
  return {
    actorUserId: context.actorUserId,
    idempotencyKey: suffix
      ? `${operation.idempotencyKey}-${suffix}`
      : operation.idempotencyKey,
    requestId: context.requestId,
    ...(context.telemetry ? { telemetry: context.telemetry } : {}),
  };
}

async function readStoredDomainReceipt<T>(
  binding: D1Database,
  domainOperation: string,
  context: MutationContext,
): Promise<T | null> {
  const key = namespacedIdempotencyKey(
    domainOperation,
    context.actorUserId,
    context.idempotencyKey,
  );
  const row = await binding
    .prepare(
      `SELECT result_json
       FROM audit_events
       WHERE idempotency_key = ?1
       LIMIT 1`,
    )
    .bind(key)
    .first<StoredReceiptRow>();
  if (!row) return null;
  try {
    return JSON.parse(row.result_json) as T;
  } catch {
    throw setupError(
      "SETUP_RECEIPT_INVALID",
      "A nested setup mutation receipt is not valid JSON.",
      "A saved setup receipt could not be read.",
      500,
    );
  }
}

async function runDomainMutation<T>(
  binding: D1Database,
  domainOperation: string,
  context: MutationContext,
  counts: DomainMutationCounts,
  execute: () => Promise<MutationResult<T>>,
): Promise<T> {
  const stored = await readStoredDomainReceipt<T>(
    binding,
    domainOperation,
    context,
  );
  if (stored !== null) {
    counts.total += 1;
    counts.resumed += 1;
    return stored;
  }
  const result = await execute();
  counts.total += 1;
  if (result.replayed) counts.resumed += 1;
  else counts.fresh += 1;
  return result.value;
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

async function applyArtist(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const topic = proposal.topics.artist;
  const introduction = [topic.description, topic.biography]
    .filter((value) => value.length > 0)
    .join("\n\n");
  const footerText = [topic.publicContactEmail, topic.publicContactUrl]
    .filter((value): value is string => value !== null && value.length > 0)
    .join(" · ");
  const input = Object.freeze({
    displayName: topic.publicName,
    siteTitle: topic.shortName ?? topic.publicName,
    headline: topic.headline,
    introduction,
    footerText,
  });
  const current = await readDraftArtistRevision(binding);
  if (
    current &&
    current.displayName === input.displayName &&
    current.siteTitle === input.siteTitle &&
    current.headline === input.headline &&
    current.introduction === input.introduction &&
    current.footerText === input.footerText
  ) {
    return { outcome: "no-op", resourceCount: 1 };
  }
  if (!current) {
    throw setupError(
      "SETUP_ARTIST_STATE_MISSING",
      "The seeded artist aggregate is missing.",
      "The artist setup state is not available.",
      500,
    );
  }
  await runDomainMutation(
    binding,
    "artist.draft.save",
    childContext(context, operation),
    counts,
    () =>
      saveArtistDraft(
        binding,
        input,
        current.configVersion,
        childContext(context, operation),
      ),
  );
  return { outcome: "applied", resourceCount: 1 };
}

function navigationItems(
  items: SetupProposal["topics"]["capabilitiesNavigation"]["primaryNavigation"],
): readonly NavigationItemInput[] {
  return Object.freeze(
    items.map((item) =>
      Object.freeze({
        itemKey: item.navigationKey,
        label: item.label,
        href: item.href,
        position: item.order,
        moduleKey: item.module,
        external: !item.href.startsWith("/"),
      }),
    ),
  );
}

function sameNavigation(
  current: Awaited<ReturnType<typeof readNavigationSnapshot>>,
  desired: readonly NavigationItemInput[],
): boolean {
  return (
    current !== null &&
    current.items.length === desired.length &&
    current.items.every((item, index) => {
      const target = desired[index];
      return (
        target !== undefined &&
        item.itemKey === target.itemKey &&
        item.label === target.label &&
        item.href === target.href &&
        item.position === target.position &&
        item.moduleKey === target.moduleKey &&
        item.external === target.external
      );
    })
  );
}

async function applyCapabilitiesNavigation(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const topic = proposal.topics.capabilitiesNavigation;
  const currentModules = await readActiveModuleKeys(binding);
  const desiredModules = topic.activeModules;
  let changed = false;
  if (!sameStrings(currentModules, desiredModules)) {
    const desired = new Set<ModuleKey>(desiredModules);
    const current = new Set<ModuleKey>(currentModules);
    await runDomainMutation(
      binding,
      "modules.transition",
      childContext(context, operation, "modules"),
      counts,
      () =>
        transitionModules(
          binding,
          {
            activate: MODULE_KEYS.filter(
              (key) => desired.has(key) && !current.has(key),
            ),
            deactivate: MODULE_KEYS.filter(
              (key) => current.has(key) && !desired.has(key),
            ),
          },
          childContext(context, operation, "modules"),
        ),
    );
    changed = true;
  }

  const primary = navigationItems(topic.primaryNavigation);
  const footer = navigationItems(topic.footerNavigation);
  const [currentPrimary, currentFooter] = await Promise.all([
    readNavigationSnapshot(binding, "primary", "draft"),
    readNavigationSnapshot(binding, "footer", "draft"),
  ]);
  if (
    !sameNavigation(currentPrimary, primary) ||
    !sameNavigation(currentFooter, footer)
  ) {
    if (!currentPrimary || !currentFooter) {
      throw setupError(
        "SETUP_NAVIGATION_STATE_MISSING",
        "The seeded navigation aggregate is missing.",
        "The navigation setup state is not available.",
        500,
      );
    }
    await runDomainMutation(
      binding,
      "navigation.snapshot.draft.save",
      childContext(context, operation, "navigation"),
      counts,
      () =>
        saveNavigationSnapshot(
          binding,
          { primary, footer },
          {
            primary: currentPrimary.revision,
            footer: currentFooter.revision,
          },
          childContext(context, operation, "navigation"),
        ),
    );
    changed = true;
  }
  return {
    outcome: changed ? "applied" : "no-op",
    resourceCount: MODULE_KEYS.length + primary.length + footer.length,
  };
}

function newTrackInput(
  title: string,
  subtitle: string | null,
  slug: string,
): TrackDraftInput {
  return Object.freeze({
    slug,
    title,
    subtitle,
    description: "",
    durationMs: null,
    meter: null,
    tempoBpm: null,
    musicalKey: null,
    isrc: null,
    copyrightNotice: "",
    explicit: false,
    viewMode: "public",
    streamMode: "unavailable",
    downloadMode: "unavailable",
    originalMediaId: null,
    streamingDerivativeId: null,
    downloadDerivativeId: null,
    tags: Object.freeze([]),
    credits: Object.freeze([]),
  });
}

function updatedTrackInput(
  current: AdminTrackDraft,
  changes: Partial<
    Pick<
      TrackDraftInput,
      | "title"
      | "subtitle"
      | "durationMs"
      | "streamMode"
      | "downloadMode"
      | "originalMediaId"
      | "streamingDerivativeId"
      | "downloadDerivativeId"
    >
  >,
): TrackDraftInput {
  return Object.freeze({
    slug: current.slug,
    title: changes.title ?? current.title,
    subtitle: Object.hasOwn(changes, "subtitle")
      ? (changes.subtitle ?? null)
      : current.subtitle,
    description: current.description,
    durationMs: Object.hasOwn(changes, "durationMs")
      ? (changes.durationMs ?? null)
      : current.durationMs,
    meter: current.meter,
    tempoBpm: current.tempoBpm,
    musicalKey: current.musicalKey,
    isrc: current.isrc,
    copyrightNotice: current.copyrightNotice,
    explicit: current.explicit,
    viewMode: current.viewMode,
    streamMode: changes.streamMode ?? current.streamMode,
    downloadMode: changes.downloadMode ?? current.downloadMode,
    originalMediaId: Object.hasOwn(changes, "originalMediaId")
      ? (changes.originalMediaId ?? null)
      : current.originalMediaId,
    streamingDerivativeId: Object.hasOwn(changes, "streamingDerivativeId")
      ? (changes.streamingDerivativeId ?? null)
      : current.streamingDerivativeId,
    downloadDerivativeId: Object.hasOwn(changes, "downloadDerivativeId")
      ? (changes.downloadDerivativeId ?? null)
      : current.downloadDerivativeId,
    tags: current.tags,
    credits: current.credits,
  });
}

async function catalogTrackState(
  binding: D1Database,
  trackKey: string,
): Promise<CatalogTrackRow | null> {
  return binding
    .prepare(
      `SELECT id, publication_state
       FROM tracks
       WHERE slug = ?1
       LIMIT 1`,
    )
    .bind(trackKey)
    .first<CatalogTrackRow>();
}

async function releaseTrackIds(
  binding: D1Database,
  trackKeys: readonly string[],
): Promise<readonly string[] | null> {
  const rows = await Promise.all(
    trackKeys.map((trackKey) => catalogTrackState(binding, trackKey)),
  );
  if (
    rows.some((row) => row === null || row.publication_state !== "published")
  ) {
    return null;
  }
  return Object.freeze(rows.map((row) => row!.id));
}

function releaseInput(
  proposal: CatalogReleaseProposal,
  current: AdminReleaseDraft | null,
  trackIds: readonly string[],
): ReleaseDraftInput {
  return Object.freeze({
    slug: proposal.releaseKey,
    releaseType:
      current?.releaseType ?? (trackIds.length === 1 ? "single" : "other"),
    title: proposal.title,
    subtitle: current?.subtitle ?? null,
    description: current?.description ?? "",
    releaseDate: proposal.releaseDate,
    catalogNumber: current?.catalogNumber ?? null,
    copyrightNotice: current?.copyrightNotice ?? "",
    viewMode: current?.viewMode ?? "public",
    artworkDerivativeId: current?.artworkDerivativeId ?? null,
    tags: current?.tags ?? Object.freeze([]),
    tracks: Object.freeze(
      trackIds.map((trackId, index) =>
        Object.freeze({
          trackId,
          discNumber: 1,
          trackNumber: index + 1,
        }),
      ),
    ),
    credits: current?.credits ?? Object.freeze([]),
  });
}

function collectionInput(
  proposal: CatalogCollectionProposal,
  current: AdminCollectionDraft | null,
  trackIds: readonly string[],
): CollectionDraftInput {
  return Object.freeze({
    slug: proposal.collectionKey,
    title: proposal.title,
    description: current?.description ?? "",
    viewMode: current?.viewMode ?? "public",
    artworkDerivativeId: current?.artworkDerivativeId ?? null,
    tags: current?.tags ?? Object.freeze([]),
    trackIds,
    credits: current?.credits ?? Object.freeze([]),
  });
}

async function applyReleaseDraft(
  binding: D1Database,
  proposal: CatalogReleaseProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
  suffixPrefix = "release",
): Promise<boolean> {
  const trackIds = await releaseTrackIds(binding, proposal.trackKeys);
  if (trackIds === null) return false;
  const current = await readAdminReleaseDraft(binding, proposal.releaseKey);
  await runDomainMutation(
    binding,
    "release.draft.save",
    childContext(context, operation, `${suffixPrefix}-${proposal.releaseKey}`),
    counts,
    () =>
      saveReleaseDraft(
        binding,
        releaseInput(proposal, current, trackIds),
        current?.version ?? 0,
        childContext(
          context,
          operation,
          `${suffixPrefix}-${proposal.releaseKey}`,
        ),
      ),
  );
  return true;
}

async function applyCollectionDraft(
  binding: D1Database,
  proposal: CatalogCollectionProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
  suffixPrefix = "collection",
): Promise<boolean> {
  const trackIds = await releaseTrackIds(binding, proposal.trackKeys);
  if (trackIds === null) return false;
  const current = await readAdminCollectionDraft(
    binding,
    proposal.collectionKey,
  );
  await runDomainMutation(
    binding,
    "collection.draft.save",
    childContext(
      context,
      operation,
      `${suffixPrefix}-${proposal.collectionKey}`,
    ),
    counts,
    () =>
      saveCollectionDraft(
        binding,
        collectionInput(proposal, current, trackIds),
        current?.version ?? 0,
        childContext(
          context,
          operation,
          `${suffixPrefix}-${proposal.collectionKey}`,
        ),
      ),
  );
  return true;
}

async function applyCatalogDrafts(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const topic = proposal.topics.catalogReleases;
  const mayDeferParents =
    proposal.topics.accountsPublication.publication.catalog === "publish";

  for (const parent of [...topic.releases, ...topic.collections]) {
    const ids = await releaseTrackIds(binding, parent.trackKeys);
    if (
      ids === null &&
      (!mayDeferParents ||
        parent.trackKeys.some(
          (key) => !topic.tracks.some((track) => track.trackKey === key),
        ))
    ) {
      unsupported(
        "catalog-releases",
        "Release and collection writers require current published tracks.",
      );
    }
  }

  let changed = false;
  for (const track of topic.tracks) {
    const current = await readAdminTrackDraft(binding, track.trackKey);
    const input = current
      ? updatedTrackInput(current, {
          title: track.title,
          subtitle: track.versionLabel,
        })
      : newTrackInput(track.title, track.versionLabel, track.trackKey);
    if (
      current &&
      current.title === input.title &&
      current.subtitle === input.subtitle
    ) {
      continue;
    }
    await runDomainMutation(
      binding,
      "track.draft.save",
      childContext(context, operation, `track-${track.trackKey}`),
      counts,
      () =>
        saveTrackDraft(
          binding,
          input,
          current?.version ?? 0,
          childContext(context, operation, `track-${track.trackKey}`),
        ),
    );
    changed = true;
  }

  for (const release of topic.releases) {
    const applied = await applyReleaseDraft(
      binding,
      release,
      operation,
      context,
      counts,
    );
    changed ||= applied;
  }
  for (const collection of topic.collections) {
    const applied = await applyCollectionDraft(
      binding,
      collection,
      operation,
      context,
      counts,
    );
    changed ||= applied;
  }

  return {
    outcome: changed ? "applied" : "no-op",
    resourceCount:
      topic.tracks.length + topic.releases.length + topic.collections.length,
  };
}

function availabilityMode(
  value:
    | TrackAvailabilityProposal["streaming"]
    | TrackAvailabilityProposal["download"],
): CatalogAccessMode {
  if (value === "disabled") return "unavailable";
  if (value === "entitled") return "protected";
  return value;
}

async function applyTrackAvailability(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const tracks = proposal.topics.streamingDownloads.tracks;
  const catalogByKey = new Map(
    proposal.topics.catalogReleases.tracks.map((track) => [
      track.trackKey,
      track,
    ]),
  );
  const mediaByKey = new Map(
    proposal.topics.rightsMedia.media.map((media) => [media.mediaKey, media]),
  );
  const targets: {
    readonly availability: TrackAvailabilityProposal;
    readonly current: AdminTrackDraft;
    readonly input: TrackDraftInput;
  }[] = [];
  for (const availability of tracks) {
    const current = await readAdminTrackDraft(binding, availability.trackKey);
    if (!current) {
      unsupported(
        "streaming-downloads",
        `Track ${availability.trackKey} has no completed catalog draft.`,
      );
    }
    const streamMode = availabilityMode(availability.streaming);
    const downloadMode = availabilityMode(availability.download);
    const mediaKey = catalogByKey.get(availability.trackKey)?.mediaKey ?? null;
    if (mediaKey === null) {
      targets.push({
        availability,
        current,
        input: updatedTrackInput(current, { streamMode, downloadMode }),
      });
      continue;
    }
    const reference = mediaByKey.get(mediaKey);
    if (!reference) {
      unsupported(
        "streaming-downloads",
        `Track ${availability.trackKey} references missing media ${mediaKey}.`,
      );
    }
    const media = await resolveSetupTrackMedia(
      binding,
      reference,
      availability,
      context.actorUserId,
    );
    targets.push({
      availability,
      current,
      input: updatedTrackInput(current, {
        streamMode,
        downloadMode,
        durationMs: media.durationMs,
        originalMediaId: media.originalMediaId,
        streamingDerivativeId: media.streamingDerivativeId,
        downloadDerivativeId: media.downloadDerivativeId,
      }),
    });
  }

  let changed = false;
  for (const { availability, current, input } of targets) {
    if (
      current.streamMode === input.streamMode &&
      current.downloadMode === input.downloadMode &&
      current.durationMs === input.durationMs &&
      current.originalMediaId === input.originalMediaId &&
      current.streamingDerivativeId === input.streamingDerivativeId &&
      current.downloadDerivativeId === input.downloadDerivativeId
    ) {
      continue;
    }
    await runDomainMutation(
      binding,
      "track.draft.save",
      childContext(context, operation, `track-${availability.trackKey}`),
      counts,
      () =>
        saveTrackDraft(
          binding,
          input,
          current.version,
          childContext(context, operation, `track-${availability.trackKey}`),
        ),
    );
    changed = true;
  }
  return {
    outcome: changed ? "applied" : "no-op",
    resourceCount: tracks.length,
  };
}

async function resolveAccessResource(
  binding: D1Database,
  resourceType: "track" | "course",
  resourceKey: string,
): Promise<AccessResource> {
  if (resourceType === "track") {
    const row = await catalogTrackState(binding, resourceKey);
    if (!row || row.publication_state !== "published") {
      unsupported(
        "customer-access",
        `Track ${resourceKey} is not a current published resource.`,
      );
    }
    return { resourceType, resourceId: row.id };
  }
  const row = await binding
    .prepare(
      `SELECT id, publication_state
       FROM courses
       WHERE slug = ?1
       LIMIT 1`,
    )
    .bind(resourceKey)
    .first<{ id: string; publication_state: string }>();
  if (!row || row.publication_state === "archived") {
    unsupported(
      "customer-access",
      `Course ${resourceKey} is not a current resource.`,
    );
  }
  return { resourceType, resourceId: row.id };
}

function accessActions(): AccessPlanItemInput["actions"] {
  return Object.freeze(["view", "stream", "download"]);
}

function sameAccessPlan(
  current: AdminAccessPlanDTO,
  name: string,
  items: readonly AccessPlanItemInput[],
): boolean {
  return (
    current.name === name &&
    current.description === "" &&
    current.items.length === items.length &&
    current.items.every((item, index) => {
      const target = items[index];
      return (
        target !== undefined &&
        item.resourceType === target.resourceType &&
        item.resourceId === target.resourceId &&
        sameStrings(item.actions, target.actions) &&
        item.downloadDisposition === target.downloadDisposition
      );
    })
  );
}

interface GrantTemplateRow {
  readonly id: string;
  readonly template_key: string;
  readonly label: string;
  readonly access_plan_id: string;
  readonly access_plan_revision: number;
  readonly default_duration_days: number | null;
  readonly state: "active" | "archived";
  readonly revision: number;
}

interface GrantTemplateMutationReceipt {
  readonly templateId: string;
  readonly templateKey: string;
  readonly accessPlanId: string;
  readonly accessPlanRevision: number;
  readonly state: "active";
  readonly revision: number;
  readonly created: boolean;
}

interface MembershipCreditRuleTarget {
  readonly ruleKey: string;
  readonly creditKind: "download" | "license";
  readonly membershipPlanId: string | null;
  readonly membershipPlanRevisionId: string | null;
  readonly membershipPlanRevision: number | null;
  readonly subscriptionPlanId: string | null;
  readonly subscriptionPlanRevision: number | null;
  readonly amount: number;
  readonly cadence: "once" | "month" | "year";
}

interface MembershipCreditRuleRow {
  readonly id: string;
  readonly rule_key: string;
  readonly credit_kind: "download" | "license";
  readonly membership_plan_id: string | null;
  readonly membership_plan_revision_id: string | null;
  readonly membership_plan_revision: number | null;
  readonly subscription_plan_id: string | null;
  readonly subscription_plan_revision: number | null;
  readonly amount: number;
  readonly cadence: "once" | "month" | "year";
  readonly state: "active" | "archived";
  readonly revision: number;
}

interface MembershipCreditRuleMutationReceipt {
  readonly ruleId: string;
  readonly ruleKey: string;
  readonly creditKind: "download" | "license";
  readonly subjectKind: "membership" | "subscription";
  readonly amount: number;
  readonly cadence: "once" | "month" | "year";
  readonly state: "active";
  readonly revision: number;
  readonly created: boolean;
}

interface CommerceBindingIntentTarget {
  readonly intentKey: string;
  readonly intentKind: "membership" | "subscription" | "license";
  readonly name: string;
  readonly description: string;
  readonly membershipPlanId: string | null;
  readonly membershipPlanRevisionId: string | null;
  readonly membershipPlanRevision: number | null;
  readonly subscriptionPlanId: string | null;
  readonly subscriptionPlanRevision: number | null;
  readonly trackId: string | null;
  readonly trackRevisionId: string | null;
  readonly trackRevision: number | null;
  readonly licenseTermsId: string | null;
  readonly licenseTermsVersionId: string | null;
  readonly licenseTermsVersion: number | null;
  readonly licenseOptionId: string | null;
  readonly amountMinor: number;
  readonly currency: string;
  readonly billingInterval: "one_time" | "month" | "year";
  readonly intervalCount: number;
}

interface CommerceBindingIntentRow {
  readonly id: string;
  readonly intent_key: string;
  readonly intent_kind: "membership" | "subscription" | "license";
  readonly name: string;
  readonly description: string;
  readonly membership_plan_id: string | null;
  readonly membership_plan_revision_id: string | null;
  readonly membership_plan_revision: number | null;
  readonly subscription_plan_id: string | null;
  readonly subscription_plan_revision: number | null;
  readonly track_id: string | null;
  readonly track_revision_id: string | null;
  readonly track_revision: number | null;
  readonly license_terms_id: string | null;
  readonly license_terms_version_id: string | null;
  readonly license_terms_version: number | null;
  readonly license_option_id: string | null;
  readonly amount_minor: number;
  readonly currency: string;
  readonly billing_interval: "one_time" | "month" | "year";
  readonly interval_count: number;
  readonly binding_state: "pending" | "bound" | "archived";
  readonly revision: number;
}

interface CommerceBindingIntentMutationReceipt {
  readonly intentId: string;
  readonly intentKey: string;
  readonly intentKind: "membership" | "subscription" | "license";
  readonly bindingState: "pending";
  readonly revision: number;
  readonly created: boolean;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
}

async function readCommerceBindingIntent(
  binding: D1Database,
  intentKey: string,
): Promise<CommerceBindingIntentRow | null> {
  return binding
    .prepare(
      `SELECT id, intent_key, intent_kind, name, description,
              membership_plan_id, membership_plan_revision_id,
              membership_plan_revision, subscription_plan_id,
              subscription_plan_revision, track_id, track_revision_id,
              track_revision, license_terms_id, license_terms_version_id,
              license_terms_version, license_option_id, amount_minor,
              currency, billing_interval, interval_count, binding_state,
              revision
       FROM commerce_binding_intents
       WHERE intent_key = ?1
       LIMIT 1`,
    )
    .bind(intentKey)
    .first<CommerceBindingIntentRow>();
}

function sameCommerceBindingIntent(
  current: CommerceBindingIntentRow,
  target: CommerceBindingIntentTarget,
): boolean {
  return (
    current.intent_key === target.intentKey &&
    current.intent_kind === target.intentKind &&
    current.name === target.name &&
    current.description === target.description &&
    current.membership_plan_id === target.membershipPlanId &&
    current.membership_plan_revision_id === target.membershipPlanRevisionId &&
    current.membership_plan_revision === target.membershipPlanRevision &&
    current.subscription_plan_id === target.subscriptionPlanId &&
    current.subscription_plan_revision === target.subscriptionPlanRevision &&
    current.track_id === target.trackId &&
    current.track_revision_id === target.trackRevisionId &&
    current.track_revision === target.trackRevision &&
    current.license_terms_id === target.licenseTermsId &&
    current.license_terms_version_id === target.licenseTermsVersionId &&
    current.license_terms_version === target.licenseTermsVersion &&
    current.license_option_id === target.licenseOptionId &&
    current.amount_minor === target.amountMinor &&
    current.currency === target.currency &&
    current.billing_interval === target.billingInterval &&
    current.interval_count === target.intervalCount
  );
}

function commerceIntentBindings(
  target: CommerceBindingIntentTarget,
): readonly (null | number | string)[] {
  return [
    target.intentKind,
    target.name,
    target.description,
    target.membershipPlanId,
    target.membershipPlanRevisionId,
    target.membershipPlanRevision,
    target.subscriptionPlanId,
    target.subscriptionPlanRevision,
    target.trackId,
    target.trackRevisionId,
    target.trackRevision,
    target.licenseTermsId,
    target.licenseTermsVersionId,
    target.licenseTermsVersion,
    target.licenseOptionId,
    target.amountMinor,
    target.currency,
    target.billingInterval,
    target.intervalCount,
  ];
}

async function saveCommerceBindingIntent(
  binding: D1Database,
  target: CommerceBindingIntentTarget,
  current: CommerceBindingIntentRow | null,
  context: MutationContext,
): Promise<MutationResult<CommerceBindingIntentMutationReceipt>> {
  if (current && current.binding_state !== "pending") {
    throw setupError(
      "SETUP_COMMERCE_BINDING_LOCKED",
      `Commerce binding intent ${target.intentKey} is ${current.binding_state}.`,
      "A bound or archived test-commerce definition cannot be changed by setup.",
    );
  }
  const operation = "commerce.binding-intent.save";
  const mutation = await prepareMutation<CommerceBindingIntentMutationReceipt>(
    binding,
    operation,
    context,
    {
      ...target,
      bindingState: "pending",
      stripeEnvironment: "test",
      livemode: false,
      expectedRevision: current?.revision ?? 0,
    },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }
  const intentId =
    current?.id ?? `commerce_binding_intent_${crypto.randomUUID()}`;
  const revision = (current?.revision ?? 0) + 1;
  const result: CommerceBindingIntentMutationReceipt = Object.freeze({
    intentId,
    intentKey: target.intentKey,
    intentKind: target.intentKind,
    bindingState: "pending",
    revision,
    created: current === null,
    stripeEnvironment: "test",
    livemode: false,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const write = current
    ? binding
        .prepare(
          `UPDATE commerce_binding_intents
           SET intent_kind = ?1, name = ?2, description = ?3,
               membership_plan_id = ?4, membership_plan_revision_id = ?5,
               membership_plan_revision = ?6, subscription_plan_id = ?7,
               subscription_plan_revision = ?8, track_id = ?9,
               track_revision_id = ?10, track_revision = ?11,
               license_terms_id = ?12, license_terms_version_id = ?13,
               license_terms_version = ?14, license_option_id = ?15,
               amount_minor = ?16, currency = ?17,
               billing_interval = ?18, interval_count = ?19,
               revision = revision + 1, last_operation_key = ?20,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?21 AND intent_key = ?22 AND binding_state = 'pending'
             AND revision = ?23 AND ${authority.sql}`,
        )
        .bind(
          ...commerceIntentBindings(target),
          mutation.namespacedKey,
          intentId,
          target.intentKey,
          current.revision,
          ...authority.bindings,
        )
    : binding
        .prepare(
          `INSERT INTO commerce_binding_intents
            (id, intent_key, intent_kind, name, description,
             membership_plan_id, membership_plan_revision_id,
             membership_plan_revision, subscription_plan_id,
             subscription_plan_revision, track_id, track_revision_id,
             track_revision, license_terms_id, license_terms_version_id,
             license_terms_version, license_option_id, amount_minor, currency,
             billing_interval, interval_count, binding_state,
             stripe_environment, livemode, revision, created_by_user_id,
             last_operation_key)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                  ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21,
                  'pending', 'test', 0, 1, ?22, ?23
           WHERE NOT EXISTS (
             SELECT 1 FROM commerce_binding_intents WHERE intent_key = ?2
           ) AND ${authority.sql}`,
        )
        .bind(
          intentId,
          target.intentKey,
          ...commerceIntentBindings(target),
          context.actorUserId,
          mutation.namespacedKey,
          ...authority.bindings,
        );
  const exactValues = commerceIntentBindings(target);
  const audit = prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: operation,
      subjectType: "commerce-binding-intent",
      subjectId: intentId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: {
        intentKind: target.intentKind,
        bindingState: "pending",
        stripeEnvironment: "test",
        livemode: false,
      },
      result: { ...result },
    },
    `EXISTS (
      SELECT 1 FROM commerce_binding_intents
      WHERE id = ? AND intent_key = ?
        AND intent_kind = ? AND name = ? AND description = ?
        AND membership_plan_id IS ? AND membership_plan_revision_id IS ?
        AND membership_plan_revision IS ? AND subscription_plan_id IS ?
        AND subscription_plan_revision IS ? AND track_id IS ?
        AND track_revision_id IS ? AND track_revision IS ?
        AND license_terms_id IS ? AND license_terms_version_id IS ?
        AND license_terms_version IS ? AND license_option_id IS ?
        AND amount_minor = ? AND currency = ? AND billing_interval = ?
        AND interval_count = ? AND binding_state = 'pending'
        AND commerce_product_id IS NULL AND commerce_price_id IS NULL
        AND stripe_environment = 'test' AND livemode = 0
        AND revision = ? AND last_operation_key = ?
    ) AND ${authority.sql}`,
    [
      intentId,
      target.intentKey,
      ...exactValues,
      revision,
      mutation.namespacedKey,
      ...authority.bindings,
    ],
  );
  try {
    const results = await binding.batch([write, audit]);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw setupError(
        "SETUP_COMMERCE_BINDING_STALE",
        `Commerce binding intent ${target.intentKey} changed during setup apply.`,
        "The test-commerce definition changed. Create a new setup preview.",
      );
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function readGrantTemplate(
  binding: D1Database,
  templateKey: string,
): Promise<GrantTemplateRow | null> {
  return binding
    .prepare(
      `SELECT id, template_key, label, access_plan_id,
              access_plan_revision, default_duration_days, state, revision
       FROM access_grant_templates
       WHERE template_key = ?1
       LIMIT 1`,
    )
    .bind(templateKey)
    .first<GrantTemplateRow>();
}

function sameGrantTemplate(
  current: GrantTemplateRow,
  target: {
    readonly label: string;
    readonly accessPlanId: string;
    readonly accessPlanRevision: number;
    readonly defaultDurationDays: number | null;
  },
): boolean {
  return (
    current.state === "active" &&
    current.label === target.label &&
    current.access_plan_id === target.accessPlanId &&
    current.access_plan_revision === target.accessPlanRevision &&
    current.default_duration_days === target.defaultDurationDays
  );
}

async function saveGrantTemplate(
  binding: D1Database,
  templateKey: string,
  target: {
    readonly label: string;
    readonly accessPlanId: string;
    readonly accessPlanRevision: number;
    readonly defaultDurationDays: number | null;
  },
  current: GrantTemplateRow | null,
  context: MutationContext,
): Promise<MutationResult<GrantTemplateMutationReceipt>> {
  if (current?.state === "archived") {
    throw setupError(
      "SETUP_GRANT_TEMPLATE_ARCHIVED",
      `Grant template ${templateKey} is archived and immutable.`,
      "An archived access-grant template cannot be reactivated by setup.",
    );
  }
  const operation = "access.grant-template.save";
  const mutation = await prepareMutation<GrantTemplateMutationReceipt>(
    binding,
    operation,
    context,
    {
      templateKey,
      ...target,
      expectedRevision: current?.revision ?? 0,
    },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const templateId =
    current?.id ?? `access_grant_template_${crypto.randomUUID()}`;
  const revision = (current?.revision ?? 0) + 1;
  const result: GrantTemplateMutationReceipt = Object.freeze({
    templateId,
    templateKey,
    accessPlanId: target.accessPlanId,
    accessPlanRevision: target.accessPlanRevision,
    state: "active",
    revision,
    created: current === null,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const write = current
    ? binding
        .prepare(
          `UPDATE access_grant_templates
           SET label = ?1, access_plan_id = ?2, access_plan_revision = ?3,
               default_duration_days = ?4, revision = revision + 1,
               last_operation_key = ?5, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?6 AND template_key = ?7 AND state = 'active'
             AND revision = ?8 AND ${authority.sql}`,
        )
        .bind(
          target.label,
          target.accessPlanId,
          target.accessPlanRevision,
          target.defaultDurationDays,
          mutation.namespacedKey,
          templateId,
          templateKey,
          current.revision,
          ...authority.bindings,
        )
    : binding
        .prepare(
          `INSERT INTO access_grant_templates
            (id, template_key, label, access_plan_id, access_plan_revision,
             default_duration_days, state, revision, created_by_user_id,
             last_operation_key)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'active', 1, ?7, ?8
           WHERE NOT EXISTS (
             SELECT 1 FROM access_grant_templates WHERE template_key = ?2
           ) AND EXISTS (
             SELECT 1 FROM access_plans
             WHERE id = ?4 AND revision = ?5 AND state = 'active'
           ) AND ${authority.sql}`,
        )
        .bind(
          templateId,
          templateKey,
          target.label,
          target.accessPlanId,
          target.accessPlanRevision,
          target.defaultDurationDays,
          context.actorUserId,
          mutation.namespacedKey,
          ...authority.bindings,
        );
  const audit = prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: operation,
      subjectType: "access-grant-template",
      subjectId: templateId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: {
        accessPlanId: target.accessPlanId,
        accessPlanRevision: target.accessPlanRevision,
      },
      result: { ...result },
    },
    `EXISTS (
      SELECT 1 FROM access_grant_templates
      WHERE id = ? AND template_key = ? AND label = ?
        AND access_plan_id = ? AND access_plan_revision = ?
        AND default_duration_days IS ? AND state = 'active'
        AND revision = ? AND last_operation_key = ?
    ) AND ${authority.sql}`,
    [
      templateId,
      templateKey,
      target.label,
      target.accessPlanId,
      target.accessPlanRevision,
      target.defaultDurationDays,
      revision,
      mutation.namespacedKey,
      ...authority.bindings,
    ],
  );
  try {
    const results = await binding.batch([write, audit]);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw setupError(
        "SETUP_GRANT_TEMPLATE_STALE",
        `Grant template ${templateKey} changed during setup apply.`,
        "The access-grant template changed. Create a new setup preview.",
      );
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

async function applyAccessDefinitions(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const topic = proposal.topics.customerAccess;
  const prepared = await Promise.all(
    topic.accessPlans.map(async (plan) => {
      const resources = await Promise.all(
        plan.resourceKeys.map((key) =>
          resolveAccessResource(
            binding,
            plan.resourceType as "track" | "course",
            key,
          ),
        ),
      );
      const items: readonly AccessPlanItemInput[] = Object.freeze(
        resources.map((resource) =>
          Object.freeze({
            resourceType: resource.resourceType,
            resourceId: resource.resourceId,
            actions: accessActions(),
            remainingUses: null,
            downloadDisposition: "attachment",
          }),
        ),
      );
      return { proposal: plan, items };
    }),
  );

  const overview = await readAdminAccessOverview(binding, context.actorUserId);
  const bySlug = new Map(overview.plans.map((plan) => [plan.slug, plan]));
  let changed = false;
  for (const target of prepared) {
    const current = bySlug.get(target.proposal.accessPlanKey) ?? null;
    if (
      current &&
      sameAccessPlan(current, target.proposal.label, target.items)
    ) {
      continue;
    }
    const nested = childContext(
      context,
      operation,
      `plan-${target.proposal.accessPlanKey}`,
    );
    if (current) {
      await runDomainMutation(
        binding,
        "access.plan.update",
        nested,
        counts,
        () =>
          updateAccessPlan(
            binding,
            current.id,
            {
              name: target.proposal.label,
              description: "",
              items: target.items,
            },
            current.revision,
            nested,
          ),
      );
    } else {
      await runDomainMutation(
        binding,
        "access.plan.create",
        nested,
        counts,
        () =>
          createAccessPlan(
            binding,
            {
              slug: target.proposal.accessPlanKey,
              name: target.proposal.label,
              description: "",
              items: target.items,
            },
            nested,
          ),
      );
    }
    changed = true;
  }

  const refreshed = await readAdminAccessOverview(binding, context.actorUserId);
  const refreshedBySlug = new Map(
    refreshed.plans.map((plan) => [plan.slug, plan]),
  );
  for (const template of topic.grantTemplates) {
    const accessPlan = refreshedBySlug.get(template.accessPlanKey);
    if (!accessPlan || accessPlan.state !== "active") {
      unsupported(
        "customer-access",
        `Grant template ${template.grantKey} has no active access-plan revision.`,
      );
    }
    const current = await readGrantTemplate(binding, template.grantKey);
    const target = Object.freeze({
      label: template.label,
      accessPlanId: accessPlan.id,
      accessPlanRevision: accessPlan.revision,
      defaultDurationDays: template.defaultDurationDays,
    });
    if (current && sameGrantTemplate(current, target)) continue;
    await runDomainMutation(
      binding,
      "access.grant-template.save",
      childContext(context, operation, `grant-template-${template.grantKey}`),
      counts,
      () =>
        saveGrantTemplate(
          binding,
          template.grantKey,
          target,
          current,
          childContext(
            context,
            operation,
            `grant-template-${template.grantKey}`,
          ),
        ),
    );
    changed = true;
  }
  return {
    outcome: changed ? "applied" : "no-op",
    resourceCount: topic.accessPlans.length + topic.grantTemplates.length,
  };
}

async function membershipPlanBySlug(
  binding: D1Database,
  slug: string,
): Promise<MembershipPlanDTO | null> {
  const row = await binding
    .prepare("SELECT id FROM membership_plans WHERE slug = ?1 LIMIT 1")
    .bind(slug)
    .first<{ id: string }>();
  return row ? readMembershipPlan(binding, row.id) : null;
}

async function subscriptionPlanBySlug(
  binding: D1Database,
  slug: string,
): Promise<SubscriptionPlanDTO | null> {
  const row = await binding
    .prepare("SELECT id FROM subscription_plans WHERE slug = ?1 LIMIT 1")
    .bind(slug)
    .first<{ id: string }>();
  return row ? readSubscriptionPlan(binding, row.id) : null;
}

async function readMembershipCreditRule(
  binding: D1Database,
  ruleKey: string,
): Promise<MembershipCreditRuleRow | null> {
  return binding
    .prepare(
      `SELECT id, rule_key, credit_kind, membership_plan_id,
              membership_plan_revision_id, membership_plan_revision,
              subscription_plan_id, subscription_plan_revision, amount,
              cadence, state, revision
       FROM membership_credit_rules
       WHERE rule_key = ?1
       LIMIT 1`,
    )
    .bind(ruleKey)
    .first<MembershipCreditRuleRow>();
}

function membershipCreditRuleBindings(
  target: MembershipCreditRuleTarget,
): readonly (null | number | string)[] {
  return [
    target.creditKind,
    target.membershipPlanId,
    target.membershipPlanRevisionId,
    target.membershipPlanRevision,
    target.subscriptionPlanId,
    target.subscriptionPlanRevision,
    target.amount,
    target.cadence,
  ];
}

function sameMembershipCreditRule(
  current: MembershipCreditRuleRow,
  target: MembershipCreditRuleTarget,
): boolean {
  return (
    current.state === "active" &&
    current.rule_key === target.ruleKey &&
    current.credit_kind === target.creditKind &&
    current.membership_plan_id === target.membershipPlanId &&
    current.membership_plan_revision_id === target.membershipPlanRevisionId &&
    current.membership_plan_revision === target.membershipPlanRevision &&
    current.subscription_plan_id === target.subscriptionPlanId &&
    current.subscription_plan_revision === target.subscriptionPlanRevision &&
    current.amount === target.amount &&
    current.cadence === target.cadence
  );
}

async function saveMembershipCreditRule(
  binding: D1Database,
  target: MembershipCreditRuleTarget,
  current: MembershipCreditRuleRow | null,
  context: MutationContext,
): Promise<MutationResult<MembershipCreditRuleMutationReceipt>> {
  if (current?.state === "archived") {
    throw setupError(
      "SETUP_CREDIT_RULE_ARCHIVED",
      `Credit rule ${target.ruleKey} is archived and immutable.`,
      "An archived credit rule cannot be reactivated by setup.",
    );
  }
  const operation = "membership.credit-rule.save";
  const mutation = await prepareMutation<MembershipCreditRuleMutationReceipt>(
    binding,
    operation,
    context,
    {
      ...target,
      state: "active",
      expectedRevision: current?.revision ?? 0,
    },
  );
  if (mutation.replayValue) {
    return { value: mutation.replayValue, replayed: true };
  }

  const ruleId = current?.id ?? `membership_credit_rule_${crypto.randomUUID()}`;
  const revision = (current?.revision ?? 0) + 1;
  const result: MembershipCreditRuleMutationReceipt = Object.freeze({
    ruleId,
    ruleKey: target.ruleKey,
    creditKind: target.creditKind,
    subjectKind:
      target.membershipPlanId === null ? "subscription" : "membership",
    amount: target.amount,
    cadence: target.cadence,
    state: "active",
    revision,
    created: current === null,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const exactValues = membershipCreditRuleBindings(target);
  const write = current
    ? binding
        .prepare(
          `UPDATE membership_credit_rules
           SET credit_kind = ?1, membership_plan_id = ?2,
               membership_plan_revision_id = ?3,
               membership_plan_revision = ?4, subscription_plan_id = ?5,
               subscription_plan_revision = ?6, amount = ?7, cadence = ?8,
               revision = revision + 1, last_operation_key = ?9,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?10 AND rule_key = ?11 AND state = 'active'
             AND revision = ?12 AND ${authority.sql}`,
        )
        .bind(
          ...exactValues,
          mutation.namespacedKey,
          ruleId,
          target.ruleKey,
          current.revision,
          ...authority.bindings,
        )
    : binding
        .prepare(
          `INSERT INTO membership_credit_rules
            (id, rule_key, credit_kind, membership_plan_id,
             membership_plan_revision_id, membership_plan_revision,
             subscription_plan_id, subscription_plan_revision, amount,
             cadence, state, revision, created_by_user_id,
             last_operation_key)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                  'active', 1, ?11, ?12
           WHERE NOT EXISTS (
             SELECT 1 FROM membership_credit_rules WHERE rule_key = ?2
           ) AND ${authority.sql}`,
        )
        .bind(
          ruleId,
          target.ruleKey,
          ...exactValues,
          context.actorUserId,
          mutation.namespacedKey,
          ...authority.bindings,
        );
  const audit = prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: operation,
      subjectType: "membership-credit-rule",
      subjectId: ruleId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: {
        creditKind: target.creditKind,
        subjectKind: result.subjectKind,
        cadence: target.cadence,
      },
      result: { ...result },
    },
    `EXISTS (
      SELECT 1 FROM membership_credit_rules
      WHERE id = ? AND rule_key = ? AND credit_kind = ?
        AND membership_plan_id IS ? AND membership_plan_revision_id IS ?
        AND membership_plan_revision IS ? AND subscription_plan_id IS ?
        AND subscription_plan_revision IS ? AND amount = ? AND cadence = ?
        AND state = 'active' AND revision = ? AND last_operation_key = ?
    ) AND ${authority.sql}`,
    [
      ruleId,
      target.ruleKey,
      ...exactValues,
      revision,
      mutation.namespacedKey,
      ...authority.bindings,
    ],
  );
  try {
    const results = await binding.batch([write, audit]);
    if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
      throw setupError(
        "SETUP_CREDIT_RULE_STALE",
        `Credit rule ${target.ruleKey} changed during setup apply.`,
        "The credit definition changed. Create a new setup preview.",
      );
    }
    return { value: result, replayed: false };
  } catch (error) {
    return replayAfterMutationFailure(binding, mutation, error);
  }
}

function creditAmount(
  rules: SetupProposal["topics"]["credits"]["downloadCreditRules"],
  membershipPlanKey: string,
): number {
  return (
    rules.find(({ planKey }) => planKey === membershipPlanKey)?.amount ?? 0
  );
}

function sameMembershipDefinition(
  current: MembershipPlanDTO,
  desired: MembershipPlanDefinitionInput,
): boolean {
  return (
    current.name === desired.name &&
    current.description === desired.description &&
    sameStrings(current.benefits, desired.benefits) &&
    current.accessPlanId === desired.accessPlanId &&
    current.accessPlanRevision === desired.accessPlanRevision &&
    current.downloadCredits === desired.downloadCredits &&
    current.licenseCredits === desired.licenseCredits &&
    current.durationDays === desired.durationDays
  );
}

async function desiredMembershipDefinition(
  binding: D1Database,
  proposal: SetupProposal,
  plan: MembershipPlanProposal,
  actorUserId: string,
): Promise<MembershipPlanDefinitionInput> {
  const overview = await readAdminAccessOverview(binding, actorUserId);
  const accessPlanKey = plan.accessPlanKeys[0] ?? null;
  const accessPlan = accessPlanKey
    ? (overview.plans.find(({ slug }) => slug === accessPlanKey) ?? null)
    : null;
  if (accessPlanKey && (!accessPlan || accessPlan.state !== "active")) {
    unsupported(
      "memberships-subscriptions",
      `Membership plan ${plan.planKey} has no active access-plan revision.`,
    );
  }
  return Object.freeze({
    name: plan.name,
    description: plan.description,
    benefits: plan.benefitKeys,
    accessPlanId: accessPlan?.id ?? null,
    accessPlanRevision: accessPlan?.revision ?? null,
    downloadCredits: creditAmount(
      proposal.topics.credits.downloadCreditRules,
      plan.planKey,
    ),
    licenseCredits: creditAmount(
      proposal.topics.credits.licenseCreditRules,
      plan.planKey,
    ),
    durationDays: plan.durationDays,
  });
}

function sameSubscriptionDefinition(
  current: SubscriptionPlanDTO,
  desired: {
    readonly name: string;
    readonly description: string;
    readonly membershipPlanId: string;
    readonly membershipPlanRevision: number;
    readonly billingInterval: "month" | "year";
    readonly intervalCount: number;
  },
): boolean {
  return (
    current.name === desired.name &&
    current.description === desired.description &&
    current.membershipPlanId === desired.membershipPlanId &&
    current.membershipPlanRevision === desired.membershipPlanRevision &&
    current.billingInterval === desired.billingInterval &&
    current.intervalCount === desired.intervalCount
  );
}

async function applyMembershipDefinitions(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const topic = proposal.topics.membershipsSubscriptions;
  let changed = false;
  for (const plan of topic.membershipPlans) {
    const desired = await desiredMembershipDefinition(
      binding,
      proposal,
      plan,
      context.actorUserId,
    );
    const current = await membershipPlanBySlug(binding, plan.planKey);
    if (current && sameMembershipDefinition(current, desired)) continue;
    const nested = childContext(
      context,
      operation,
      `membership-${plan.planKey}`,
    );
    if (current) {
      await runDomainMutation(
        binding,
        "membership.plan.revise",
        nested,
        counts,
        () =>
          reviseMembershipPlan(
            binding,
            current.id,
            desired,
            current.revision,
            nested,
          ),
      );
    } else {
      await runDomainMutation(
        binding,
        "membership.plan.create",
        nested,
        counts,
        () =>
          createMembershipPlan(
            binding,
            { slug: plan.planKey, state: "draft", ...desired },
            nested,
          ),
      );
    }
    changed = true;
  }

  const memberships = new Map<string, MembershipPlanDTO>();
  for (const plan of topic.membershipPlans) {
    const current = await membershipPlanBySlug(binding, plan.planKey);
    if (!current) {
      throw setupError(
        "SETUP_MEMBERSHIP_STATE_MISSING",
        `Membership plan ${plan.planKey} was not saved.`,
        "A membership definition could not be read after setup.",
        500,
      );
    }
    memberships.set(plan.planKey, current);
    const intentTarget: CommerceBindingIntentTarget = Object.freeze({
      intentKey: `membership-${plan.planKey}`,
      intentKind: "membership",
      name: plan.name,
      description: plan.description,
      membershipPlanId: current.id,
      membershipPlanRevisionId: current.revisionId,
      membershipPlanRevision: current.revision,
      subscriptionPlanId: null,
      subscriptionPlanRevision: null,
      trackId: null,
      trackRevisionId: null,
      trackRevision: null,
      licenseTermsId: null,
      licenseTermsVersionId: null,
      licenseTermsVersion: null,
      licenseOptionId: null,
      amountMinor: plan.displayAmountMinor,
      currency: plan.currency,
      billingInterval: "one_time",
      intervalCount: 1,
    });
    const currentIntent = await readCommerceBindingIntent(
      binding,
      intentTarget.intentKey,
    );
    if (
      !currentIntent ||
      !sameCommerceBindingIntent(currentIntent, intentTarget)
    ) {
      const nested = childContext(
        context,
        operation,
        `membership-binding-${plan.planKey}`,
      );
      await runDomainMutation(
        binding,
        "commerce.binding-intent.save",
        nested,
        counts,
        () =>
          saveCommerceBindingIntent(
            binding,
            intentTarget,
            currentIntent,
            nested,
          ),
      );
      changed = true;
    }
  }

  for (const plan of topic.subscriptionPlans) {
    const membership = memberships.get(plan.membershipPlanKey);
    if (!membership) {
      unsupported(
        "memberships-subscriptions",
        `Subscription ${plan.planKey} has no exact membership revision.`,
      );
    }
    const desired = Object.freeze({
      name: plan.name,
      description: plan.description,
      membershipPlanId: membership.id,
      membershipPlanRevision: membership.revision,
      billingInterval: plan.billingInterval,
      intervalCount: 1,
    });
    const current = await subscriptionPlanBySlug(binding, plan.planKey);
    if (current && sameSubscriptionDefinition(current, desired)) continue;
    const nested = childContext(
      context,
      operation,
      `subscription-${plan.planKey}`,
    );
    if (current) {
      await runDomainMutation(
        binding,
        "subscription.plan.revise",
        nested,
        counts,
        () =>
          reviseSubscriptionPlan(
            binding,
            current.id,
            desired,
            current.revision,
            nested,
          ),
      );
    } else {
      await runDomainMutation(
        binding,
        "subscription.plan.create",
        nested,
        counts,
        () =>
          createSubscriptionPlan(
            binding,
            { slug: plan.planKey, state: "draft", ...desired },
            nested,
          ),
      );
    }
    changed = true;
  }
  for (const plan of topic.subscriptionPlans) {
    const current = await subscriptionPlanBySlug(binding, plan.planKey);
    if (!current) {
      throw setupError(
        "SETUP_SUBSCRIPTION_STATE_MISSING",
        `Subscription plan ${plan.planKey} was not saved.`,
        "A subscription definition could not be read after setup.",
        500,
      );
    }
    const intentTarget: CommerceBindingIntentTarget = Object.freeze({
      intentKey: `subscription-${plan.planKey}`,
      intentKind: "subscription",
      name: plan.name,
      description: plan.description,
      membershipPlanId: null,
      membershipPlanRevisionId: null,
      membershipPlanRevision: null,
      subscriptionPlanId: current.id,
      subscriptionPlanRevision: current.revision,
      trackId: null,
      trackRevisionId: null,
      trackRevision: null,
      licenseTermsId: null,
      licenseTermsVersionId: null,
      licenseTermsVersion: null,
      licenseOptionId: null,
      amountMinor: plan.displayAmountMinor,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      intervalCount: 1,
    });
    const currentIntent = await readCommerceBindingIntent(
      binding,
      intentTarget.intentKey,
    );
    if (
      !currentIntent ||
      !sameCommerceBindingIntent(currentIntent, intentTarget)
    ) {
      const nested = childContext(
        context,
        operation,
        `subscription-binding-${plan.planKey}`,
      );
      await runDomainMutation(
        binding,
        "commerce.binding-intent.save",
        nested,
        counts,
        () =>
          saveCommerceBindingIntent(
            binding,
            intentTarget,
            currentIntent,
            nested,
          ),
      );
      changed = true;
    }
  }
  return {
    outcome: changed ? "applied" : "no-op",
    resourceCount:
      (topic.membershipPlans.length + topic.subscriptionPlans.length) * 2,
  };
}

async function resolveCreditRuleTarget(
  binding: D1Database,
  proposal: SetupProposal,
  creditKind: "download" | "license",
  rule: CreditRuleProposal,
): Promise<MembershipCreditRuleTarget> {
  const isMembership =
    proposal.topics.membershipsSubscriptions.membershipPlans.some(
      ({ planKey }) => planKey === rule.planKey,
    );
  if (isMembership) {
    const membership = await membershipPlanBySlug(binding, rule.planKey);
    if (!membership) {
      throw setupError(
        "SETUP_CREDIT_SUBJECT_MISSING",
        `Credit rule ${rule.ruleKey} has no exact membership revision.`,
        "The approved credit definition could not be linked to its membership plan.",
        500,
      );
    }
    return Object.freeze({
      ruleKey: rule.ruleKey,
      creditKind,
      membershipPlanId: membership.id,
      membershipPlanRevisionId: membership.revisionId,
      membershipPlanRevision: membership.revision,
      subscriptionPlanId: null,
      subscriptionPlanRevision: null,
      amount: rule.amount,
      cadence: rule.cadence,
    });
  }

  const isSubscription =
    proposal.topics.membershipsSubscriptions.subscriptionPlans.some(
      ({ planKey }) => planKey === rule.planKey,
    );
  if (isSubscription) {
    const subscription = await subscriptionPlanBySlug(binding, rule.planKey);
    if (!subscription) {
      throw setupError(
        "SETUP_CREDIT_SUBJECT_MISSING",
        `Credit rule ${rule.ruleKey} has no exact subscription revision.`,
        "The approved credit definition could not be linked to its subscription plan.",
        500,
      );
    }
    return Object.freeze({
      ruleKey: rule.ruleKey,
      creditKind,
      membershipPlanId: null,
      membershipPlanRevisionId: null,
      membershipPlanRevision: null,
      subscriptionPlanId: subscription.id,
      subscriptionPlanRevision: subscription.revision,
      amount: rule.amount,
      cadence: rule.cadence,
    });
  }

  return unsupported(
    "credits",
    `Credit rule ${rule.ruleKey} does not reference a current membership or subscription plan.`,
  );
}

async function applyCreditRules(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const credits = proposal.topics.credits;
  const membershipPlans =
    proposal.topics.membershipsSubscriptions.membershipPlans;
  for (const plan of membershipPlans) {
    const current = await membershipPlanBySlug(binding, plan.planKey);
    const expectedDownload = creditAmount(
      credits.downloadCreditRules,
      plan.planKey,
    );
    const expectedLicense = creditAmount(
      credits.licenseCreditRules,
      plan.planKey,
    );
    if (
      !current ||
      current.downloadCredits !== expectedDownload ||
      current.licenseCredits !== expectedLicense
    ) {
      throw setupError(
        "SETUP_CREDIT_DEFINITION_MISSING",
        `Membership plan ${plan.planKey} does not carry its exact credit rules.`,
        "The approved credit definitions were not saved.",
        500,
      );
    }
  }

  let changed = false;
  for (const [creditKind, rules] of [
    ["download", credits.downloadCreditRules],
    ["license", credits.licenseCreditRules],
  ] as const) {
    for (const rule of rules) {
      const target = await resolveCreditRuleTarget(
        binding,
        proposal,
        creditKind,
        rule,
      );
      const current = await readMembershipCreditRule(binding, rule.ruleKey);
      if (current && sameMembershipCreditRule(current, target)) continue;
      const nested = childContext(
        context,
        operation,
        `${creditKind}-${rule.ruleKey}`,
      );
      await runDomainMutation(
        binding,
        "membership.credit-rule.save",
        nested,
        counts,
        () => saveMembershipCreditRule(binding, target, current, nested),
      );
      changed = true;
    }
  }
  return {
    outcome: changed ? "applied" : "no-op",
    resourceCount:
      credits.downloadCreditRules.length + credits.licenseCreditRules.length,
  };
}

function setupLicenseOption(
  option: LicenseOptionProposal,
): LicenseOptionDefinitionInput {
  return Object.freeze({
    optionKey: option.optionKey,
    label: option.label,
    description: option.uses,
    usageCategory: option.usageCategory,
    allowedMedia: option.allowedMedia,
    audienceLabel: option.audienceLabel,
    maxAudience: option.maxAudience,
    distributionLabel: option.distributionLabel,
    maxCopies: option.maxCopies,
    termMonths: option.termMonths,
    territory: option.territory,
    attributionRequired: option.attributionRequired,
    attributionText: option.attributionText,
    exclusive: option.exclusive,
    requiresApproval: option.requiresApproval,
    licenseCreditCost: option.licenseCreditCost,
    includesTrackDownload: option.includesTrackDownload,
  });
}

function setupLicenseTermsDefinition(
  proposal: SetupProposal,
  terms: LicenseTermsProposal,
): LicenseTermsDefinitionInput {
  return Object.freeze({
    name: terms.termsKey,
    title: terms.title,
    introduction: "",
    generalTerms: terms.body,
    disclaimer: "",
    options: Object.freeze(
      proposal.topics.licensing.options
        .filter(({ termsKey }) => termsKey === terms.termsKey)
        .map(setupLicenseOption),
    ),
  });
}

function sameLicenseTermsDefinition(
  current: LicenseTermsDTO,
  desired: LicenseTermsDefinitionInput,
): boolean {
  const currentDefinition: LicenseTermsDefinitionInput = Object.freeze({
    name: current.version.name,
    title: current.version.title,
    introduction: current.version.introduction,
    generalTerms: current.version.generalTerms,
    disclaimer: current.version.disclaimer,
    options: Object.freeze(
      current.version.options.map(
        ({ id: _id, position: _position, ...definition }) =>
          Object.freeze(definition),
      ),
    ),
  });
  return canonicalJson(currentDefinition) === canonicalJson(desired);
}

async function applyLicensingDefinitions(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const topic = proposal.topics.licensing;
  const administration = await readLicenseAdministration(
    binding,
    context.actorUserId,
  );
  const bySlug = new Map(
    administration.terms.map((terms) => [terms.slug, terms]),
  );
  let changed = false;
  for (const terms of topic.terms) {
    const desired = setupLicenseTermsDefinition(proposal, terms);
    const current = bySlug.get(terms.termsKey) ?? null;
    if (
      current &&
      current.version.version === terms.version &&
      sameLicenseTermsDefinition(current, desired)
    ) {
      continue;
    }
    const nested = childContext(
      context,
      operation,
      `terms-${terms.termsKey}-v${terms.version}`,
    );
    if (!current) {
      if (terms.version !== 1) {
        unsupported(
          "licensing",
          `New license terms ${terms.termsKey} must begin at version 1.`,
        );
      }
      await runDomainMutation(
        binding,
        "license.terms.create",
        nested,
        counts,
        () =>
          createLicenseTerms(
            binding,
            { slug: terms.termsKey, state: "draft", ...desired },
            nested,
          ),
      );
    } else {
      if (current.version.version + 1 !== terms.version) {
        unsupported(
          "licensing",
          `License terms ${terms.termsKey} must retain version ${current.version.version} when unchanged or propose version ${current.version.version + 1}.`,
        );
      }
      await runDomainMutation(
        binding,
        "license.terms.revise",
        nested,
        counts,
        () =>
          reviseLicenseTerms(
            binding,
            current.id,
            desired,
            current.version.version,
            nested,
          ),
      );
    }
    changed = true;
  }
  const refreshed = await readLicenseAdministration(
    binding,
    context.actorUserId,
  );
  const refreshedTermsBySlug = new Map(
    refreshed.terms.map((terms) => [terms.slug, terms]),
  );
  for (const option of topic.options) {
    const terms = refreshedTermsBySlug.get(option.termsKey);
    const storedOption = terms?.version.options.find(
      ({ optionKey }) => optionKey === option.optionKey,
    );
    const track = await readAdminTrackDraft(binding, option.trackKey);
    if (!terms || !storedOption || !track) {
      throw setupError(
        "SETUP_LICENSE_BINDING_SUBJECT_MISSING",
        `License option ${option.optionKey} has an incomplete pending binding subject.`,
        "A license option could not be linked to its exact track and terms revision.",
        500,
      );
    }
    const intentTarget: CommerceBindingIntentTarget = Object.freeze({
      intentKey: `license-${option.optionKey}`,
      intentKind: "license",
      name: option.label,
      description: option.uses,
      membershipPlanId: null,
      membershipPlanRevisionId: null,
      membershipPlanRevision: null,
      subscriptionPlanId: null,
      subscriptionPlanRevision: null,
      trackId: track.id,
      trackRevisionId: track.revisionId,
      trackRevision: track.revision,
      licenseTermsId: terms.id,
      licenseTermsVersionId: terms.version.id,
      licenseTermsVersion: terms.version.version,
      licenseOptionId: storedOption.id,
      amountMinor: option.displayAmountMinor,
      currency: option.currency,
      billingInterval: "one_time",
      intervalCount: 1,
    });
    const currentIntent = await readCommerceBindingIntent(
      binding,
      intentTarget.intentKey,
    );
    if (
      currentIntent &&
      sameCommerceBindingIntent(currentIntent, intentTarget)
    ) {
      continue;
    }
    const nested = childContext(
      context,
      operation,
      `license-binding-${option.optionKey}`,
    );
    await runDomainMutation(
      binding,
      "commerce.binding-intent.save",
      nested,
      counts,
      () =>
        saveCommerceBindingIntent(binding, intentTarget, currentIntent, nested),
    );
    changed = true;
  }
  return {
    outcome: changed ? "applied" : "no-op",
    resourceCount: topic.terms.length + topic.options.length * 2,
  };
}

interface EditorAccountStateRow {
  readonly user_id: string;
  readonly display_name: string;
  readonly role_active: number;
  readonly permission_active: number;
}

async function readEditorAccountState(
  binding: D1Database,
  editor: EditorAccountProposal,
): Promise<EditorAccountStateRow | null> {
  return binding
    .prepare(
      `SELECT users.id AS user_id, profiles.display_name,
              EXISTS (
                SELECT 1 FROM role_assignments
                WHERE role_assignments.user_id = users.id
                  AND role_assignments.role_key = 'editor'
                  AND role_assignments.revoked_at IS NULL
              ) AS role_active,
              EXISTS (
                SELECT 1 FROM editor_permissions
                WHERE editor_permissions.user_id = users.id
                  AND editor_permissions.permission_key = ?2
                  AND editor_permissions.scope_id = ?3
                  AND editor_permissions.revoked_at IS NULL
              ) AS permission_active
       FROM users
       JOIN profiles ON profiles.user_id = users.id
       WHERE users.normalized_email = lower(trim(?1))
         AND users.status = 'active'
       LIMIT 1`,
    )
    .bind(editor.email, editor.permissionKey, editor.scopeId)
    .first<EditorAccountStateRow>();
}

async function applyAccountAuthority(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const editors = proposal.topics.accountsPublication.editorAccountAliases;
  let changed = false;
  for (const [index, editor] of editors.entries()) {
    const current = await readEditorAccountState(binding, editor);
    if (
      current?.display_name === editor.displayName &&
      current.role_active === 1 &&
      current.permission_active === 1
    ) {
      continue;
    }
    const nested = childContext(context, operation, `editor-${index + 1}`);
    await runDomainMutation(binding, "editor.grant", nested, counts, () =>
      grantEditor(
        binding,
        {
          email: editor.email,
          displayName: editor.displayName,
          permissionKey: editor.permissionKey,
          scopeId: editor.scopeId,
        },
        nested,
      ),
    );
    changed = true;
  }
  return {
    outcome: changed ? "applied" : "no-op",
    resourceCount: editors.length,
  };
}

function courseInput(
  proposal: CourseProposal,
  current: Awaited<ReturnType<typeof readAdminCourseDraft>>,
  accessPlan: { readonly id: string; readonly revision: number } | null,
  mediaItemsByLessonKey: ReadonlyMap<
    string,
    readonly SetupCourseMediaItemBinding[]
  >,
): CourseDraftInput {
  const proposedLessons = new Map(
    proposal.lessons.map((lesson) => [lesson.lessonKey, lesson]),
  );
  const lessonItems = (
    lesson: CourseProposal["lessons"][number],
    currentItems: CourseDraftInput["sections"][number]["lessons"][number]["items"],
  ) => {
    const mediaItems = (mediaItemsByLessonKey.get(lesson.lessonKey) ?? []).map(
      (item) =>
        Object.freeze({
          itemKey: `setup-media-${item.mediaKey}-${item.itemType}`,
          itemType: item.itemType,
          content: Object.freeze({ text: "", caption: "", filename: null }),
          mediaDerivativeId: item.derivativeId,
          altText: null,
          transcriptText: null,
        }),
    );
    const generatedKeys = new Set<string>(
      mediaItems.map(({ itemKey }) => itemKey),
    );
    const authoredItems = currentItems.filter(
      (item) =>
        (item.itemType === "text" || item.itemType === "prompt") &&
        !generatedKeys.has(item.itemKey),
    );
    if (authoredItems.length > 0) {
      return Object.freeze([...authoredItems, ...mediaItems]);
    }
    return Object.freeze([
      Object.freeze({
        itemKey: "lesson-text",
        itemType: "text" as const,
        content: Object.freeze({
          text: lesson.summary || lesson.title,
          caption: "",
          filename: null,
        }),
        mediaDerivativeId: null,
        altText: null,
        transcriptText: null,
      }),
      ...mediaItems,
    ]);
  };
  let sections = current?.sections.map((section) => ({
    ...section,
    lessons: section.lessons.map((lesson) => {
      const replacement = proposedLessons.get(lesson.lessonKey);
      if (!replacement) return lesson;
      proposedLessons.delete(lesson.lessonKey);
      return {
        ...lesson,
        title: replacement.title,
        summary: replacement.summary,
        items: lessonItems(replacement, lesson.items),
      };
    }),
  }));
  if (!sections) sections = [];
  if (proposedLessons.size > 0) {
    const additions = [...proposedLessons.values()].map((lesson) => ({
      lessonKey: lesson.lessonKey,
      slug: lesson.lessonKey,
      title: lesson.title,
      summary: lesson.summary,
      accessMode: "inherit" as const,
      estimatedMinutes: null,
      items: lessonItems(lesson, Object.freeze([])),
    }));
    if (sections.length === 0) {
      sections.push({
        sectionKey: "course",
        title: proposal.title,
        description: proposal.summary,
        lessons: additions,
      });
    } else {
      sections[0] = {
        ...sections[0]!,
        lessons: [...sections[0]!.lessons, ...additions],
      };
    }
  }
  return Object.freeze({
    slug: proposal.courseKey,
    title: proposal.title,
    description: proposal.summary,
    accessMode: accessPlan ? "protected" : "public",
    accessPlanId: accessPlan?.id ?? null,
    accessPlanRevision: accessPlan?.revision ?? null,
    estimatedMinutes: current?.estimatedMinutes ?? null,
    sections: Object.freeze(
      sections.map((section) =>
        Object.freeze({
          ...section,
          lessons: Object.freeze(
            section.lessons.map((lesson) => Object.freeze(lesson)),
          ),
        }),
      ),
    ),
  });
}

function externalVideoProvider(
  urlValue: string,
): "youtube" | "vimeo" | "other" {
  const hostname = new URL(urlValue).hostname.toLowerCase();
  if (
    hostname === "www.youtube.com" ||
    hostname === "www.youtube-nocookie.com"
  ) {
    return "youtube";
  }
  if (hostname === "player.vimeo.com") return "vimeo";
  return "other";
}

function videoInput(
  proposal: VideoProposal,
  current: Awaited<ReturnType<typeof readAdminVideoBySlug>>,
  media: SetupVideoMediaBinding | null,
): VideoDraftInput {
  if (proposal.transcript === null) {
    unsupported(
      "courses-video",
      `Video ${proposal.videoKey} needs a transcript.`,
    );
  }
  if (media !== null) {
    return Object.freeze({
      slug: proposal.videoKey,
      title: proposal.title,
      summary: proposal.summary,
      artistContext: proposal.summary || proposal.title,
      credits: current?.draft.credits ?? Object.freeze([]),
      deliveryKind: "artist_hosted",
      posterDerivativeId: media.posterDerivativeId,
      hostedDerivativeId: media.hostedDerivativeId,
      externalProvider: null,
      externalEmbedUrl: null,
      transcripts: Object.freeze([
        Object.freeze({
          language: "en",
          transcriptText: proposal.transcript,
          captionsDerivativeId: media.captionsDerivativeId,
        }),
      ]),
    });
  }
  if (proposal.externalEmbedUrl === null || proposal.consentRequired !== true) {
    unsupported(
      "courses-video",
      `External video ${proposal.videoKey} needs a consent-gated embed URL.`,
    );
  }
  const externalEmbedUrl = proposal.externalEmbedUrl;
  return Object.freeze({
    slug: proposal.videoKey,
    title: proposal.title,
    summary: proposal.summary,
    artistContext: proposal.summary || proposal.title,
    credits: current?.draft.credits ?? Object.freeze([]),
    deliveryKind: "external",
    posterDerivativeId: current?.draft.posterDerivativeId ?? null,
    hostedDerivativeId: null,
    externalProvider: externalVideoProvider(externalEmbedUrl),
    externalEmbedUrl,
    transcripts: Object.freeze([
      Object.freeze({
        language: "en",
        transcriptText: proposal.transcript,
        captionsDerivativeId: null,
      }),
    ]),
  });
}

async function resolveCourseAccessPlan(
  binding: D1Database,
  actorUserId: string,
  key: string | null,
): Promise<{ readonly id: string; readonly revision: number } | null> {
  if (key === null) return null;
  const overview = await readAdminAccessOverview(binding, actorUserId);
  const plan = overview.plans.find(
    (candidate) => candidate.slug === key && candidate.state === "active",
  );
  if (!plan) {
    unsupported("courses-video", `Course access plan ${key} is not active.`);
  }
  return { id: plan.id, revision: plan.revision };
}

async function applyCoursesVideo(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const topic = proposal.topics.coursesVideo;
  const mediaByKey = new Map(
    proposal.topics.rightsMedia.media.map((media) => [media.mediaKey, media]),
  );
  const courseTargets: {
    readonly course: CourseProposal;
    readonly current: Awaited<ReturnType<typeof readAdminCourseDraft>>;
    readonly input: CourseDraftInput;
  }[] = [];
  for (const course of topic.courses) {
    const current = await readAdminCourseDraft(binding, course.courseKey);
    const accessPlan = await resolveCourseAccessPlan(
      binding,
      context.actorUserId,
      course.accessPlanKey,
    );
    const mediaItemsByLessonKey = new Map<
      string,
      readonly SetupCourseMediaItemBinding[]
    >();
    for (const lesson of course.lessons) {
      const references = lesson.mediaKeys.map((mediaKey) => {
        const reference = mediaByKey.get(mediaKey);
        if (!reference) {
          unsupported(
            "courses-video",
            `Course ${course.courseKey} references missing media ${mediaKey}.`,
          );
        }
        return reference;
      });
      mediaItemsByLessonKey.set(
        lesson.lessonKey,
        await resolveSetupCourseMediaItems(
          binding,
          references,
          context.actorUserId,
        ),
      );
    }
    courseTargets.push({
      course,
      current,
      input: courseInput(course, current, accessPlan, mediaItemsByLessonKey),
    });
  }
  const videoTargets: {
    readonly video: VideoProposal;
    readonly current: Awaited<ReturnType<typeof readAdminVideoBySlug>>;
    readonly input: VideoDraftInput;
  }[] = [];
  for (const video of topic.videos) {
    const current = await readAdminVideoBySlug(binding, video.videoKey);
    let media: SetupVideoMediaBinding | null = null;
    if (video.mediaKey !== null) {
      const reference = mediaByKey.get(video.mediaKey);
      if (!reference) {
        unsupported(
          "courses-video",
          `Video ${video.videoKey} references missing media ${video.mediaKey}.`,
        );
      }
      media = await resolveSetupVideoMedia(
        binding,
        reference,
        context.actorUserId,
      );
    }
    videoTargets.push({
      video,
      current,
      input: videoInput(video, current, media),
    });
  }

  let changed = false;
  for (const { course, current, input } of courseTargets) {
    await runDomainMutation(
      binding,
      "course.draft.save",
      childContext(context, operation, `course-${course.courseKey}`),
      counts,
      () =>
        saveCourseDraft(
          binding,
          input,
          current?.version ?? 0,
          childContext(context, operation, `course-${course.courseKey}`),
        ),
    );
    changed = true;
  }
  for (const { video, current, input } of videoTargets) {
    await runDomainMutation(
      binding,
      "video.draft.save",
      childContext(context, operation, `video-${video.videoKey}`),
      counts,
      () =>
        saveVideoDraft(
          binding,
          input,
          current?.revision ?? 0,
          childContext(context, operation, `video-${video.videoKey}`),
        ),
    );
    changed = true;
  }
  return {
    outcome: changed ? "applied" : "no-op",
    resourceCount: topic.courses.length + topic.videos.length,
  };
}

async function applyContactConsent(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const topic = proposal.topics.contactConsent;
  const activeModules = await readActiveModuleKeys(binding);
  if (!activeModules.includes("contact")) {
    return { outcome: "no-op", resourceCount: 0 };
  }
  const current = await readContactAdminWorkspace(binding, context.actorUserId);
  if (!topic.enabled && current.form === null) {
    return { outcome: "no-op", resourceCount: 0 };
  }
  const categories =
    topic.categories.length > 0
      ? topic.categories
      : (current.form?.categories ?? Object.freeze(["general"]));
  const consentText =
    topic.consentText ||
    current.form?.consent.text ||
    "I agree to send this message to the artist.";
  const nested = childContext(context, operation);
  await runDomainMutation(
    binding,
    "contact.form.configure",
    nested,
    counts,
    () =>
      configureContactForm(
        binding,
        {
          formKey: "contact",
          title: current.form?.title ?? "Contact",
          description: topic.invitation,
          bookingInformation: current.form?.bookingInformation ?? "",
          publicContactDetails: topic.publicEmail ?? "",
          categories,
          consentText,
          state: topic.enabled ? "active" : "disabled",
          expectedRevision: current.form?.revision ?? null,
        },
        nested,
      ),
  );
  return { outcome: "applied", resourceCount: 1 };
}

async function applyTelemetry(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const topic = proposal.topics.telemetryRetention;
  const activeModules = await readActiveModuleKeys(binding);
  if (!activeModules.includes("telemetry")) {
    return { outcome: "no-op", resourceCount: 0 };
  }
  const current = await readTelemetrySettings(binding);
  const collectionMode =
    topic.collectionMode === "consent-required"
      ? "consent_required"
      : "disabled";
  if (
    current.collectionMode === collectionMode &&
    current.retentionDays === topic.retentionDays &&
    current.meaningfulListenSeconds === topic.meaningfulListenSeconds
  ) {
    return { outcome: "no-op", resourceCount: 1 };
  }
  const nested = childContext(context, operation);
  await runDomainMutation(
    binding,
    "telemetry.settings.update",
    nested,
    counts,
    () =>
      updateTelemetrySettings(
        binding,
        {
          collectionMode,
          retentionDays: topic.retentionDays,
          meaningfulListenSeconds: topic.meaningfulListenSeconds,
          expectedRevision: current.revision,
        },
        nested,
      ),
  );
  return { outcome: "applied", resourceCount: 1 };
}

function legalSetupAnswers(proposal: SetupProposal): LegalSetupAnswers {
  const modules = new Set<ModuleKey>(
    proposal.topics.capabilitiesNavigation.activeModules,
  );
  const defaults = createDefaultLegalSetupAnswers();
  return Object.freeze({
    ...defaults,
    publicContactEmail:
      proposal.topics.contactConsent.publicEmail ??
      proposal.topics.artist.publicContactEmail ??
      "",
    contactSubmissions: proposal.topics.contactConsent.enabled,
    telemetryMode: proposal.topics.telemetryRetention.enabled
      ? "consent_required"
      : "disabled",
    telemetryRetentionDays: proposal.topics.telemetryRetention.retentionDays,
    downloads: modules.has("downloads"),
    protectedAccess: proposal.topics.customerAccess.protectedDelivery,
    memberships: modules.has("memberships"),
    subscriptions: modules.has("subscriptions"),
    licensing: modules.has("licensing"),
  });
}

async function applyLegalDrafts(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const workspace = await readLegalAdminWorkspace(binding, context.actorUserId);
  const answers = legalSetupAnswers(proposal);
  let changed = false;
  for (const documentId of ["privacy", "terms"] as const) {
    const proposed = proposal.topics.privacyTerms[documentId];
    const current = workspace.documents.find(
      (document) => document.id === documentId,
    );
    if (!current) {
      throw setupError(
        "SETUP_LEGAL_STATE_MISSING",
        `The ${documentId} legal aggregate is missing.`,
        "The legal setup state is not available.",
        500,
      );
    }
    if (
      current.draft.title === proposed.title &&
      current.draft.introduction === "" &&
      current.draft.bodyText === proposed.body &&
      canonicalJson(current.draft.setupAnswers) === canonicalJson(answers)
    ) {
      continue;
    }
    const nested = childContext(context, operation, documentId);
    await runDomainMutation(
      binding,
      "legal-document.draft.save",
      nested,
      counts,
      () =>
        saveLegalDocumentDraft(
          binding,
          {
            documentId,
            title: proposed.title,
            introduction: "",
            bodyText: proposed.body,
            setupAnswers: answers,
          },
          current.revision,
          nested,
        ),
    );
    changed = true;
  }
  return { outcome: changed ? "applied" : "no-op", resourceCount: 2 };
}

async function applyInternalPublication(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  const intent = proposal.topics.accountsPublication.publication;
  let changed = false;
  let resources = 0;

  if (intent.artist === "publish") {
    const artist = await readDraftArtistRevision(binding);
    const published = await readPublishedArtistRevision(binding);
    resources += 1;
    if (!artist) {
      throw setupError(
        "SETUP_ARTIST_STATE_MISSING",
        "The artist draft is missing before publication.",
        "The artist draft is not available.",
        500,
      );
    }
    if (published?.id !== artist.id) {
      const nested = childContext(context, operation, "artist");
      await runDomainMutation(binding, "artist.publish", nested, counts, () =>
        publishArtistDraft(binding, artist.configVersion, nested),
      );
      changed = true;
    }
  }

  if (intent.navigation === "publish") {
    const [primaryDraft, footerDraft, primaryPublished, footerPublished] =
      await Promise.all([
        readNavigationSnapshot(binding, "primary", "draft"),
        readNavigationSnapshot(binding, "footer", "draft"),
        readNavigationSnapshot(binding, "primary", "published"),
        readNavigationSnapshot(binding, "footer", "published"),
      ]);
    resources += 2;
    if (!primaryDraft || !footerDraft) {
      throw setupError(
        "SETUP_NAVIGATION_STATE_MISSING",
        "The navigation draft is missing before publication.",
        "The navigation draft is not available.",
        500,
      );
    }
    if (
      primaryPublished?.version !== primaryDraft.version ||
      footerPublished?.version !== footerDraft.version
    ) {
      const nested = childContext(context, operation, "navigation");
      await runDomainMutation(
        binding,
        "navigation.snapshot.publish",
        nested,
        counts,
        () =>
          publishNavigationSnapshot(
            binding,
            {
              primary: primaryDraft.revision,
              footer: footerDraft.revision,
            },
            nested,
          ),
      );
      changed = true;
    }
  }

  if (intent.catalog === "publish") {
    const catalog = proposal.topics.catalogReleases;
    for (const track of catalog.tracks) {
      const current = await readAdminTrackDraft(binding, track.trackKey);
      if (!current) {
        unsupported("catalog-releases", `Track ${track.trackKey} is missing.`);
      }
      resources += 1;
      if (current.publishedRevisionId !== current.revisionId) {
        const nested = childContext(
          context,
          operation,
          `track-${track.trackKey}`,
        );
        await runDomainMutation(binding, "track.publish", nested, counts, () =>
          publishTrack(binding, track.trackKey, current.version, nested),
        );
        changed = true;
      }
    }
    for (const release of catalog.releases) {
      let current = await readAdminReleaseDraft(binding, release.releaseKey);
      if (!current) {
        const applied = await applyReleaseDraft(
          binding,
          release,
          operation,
          context,
          counts,
          "publication-release-draft",
        );
        if (!applied) {
          unsupported(
            "catalog-releases",
            `Release ${release.releaseKey} still lacks published tracks.`,
          );
        }
        current = await readAdminReleaseDraft(binding, release.releaseKey);
      }
      if (!current) {
        unsupported(
          "catalog-releases",
          `Release ${release.releaseKey} is missing.`,
        );
      }
      resources += 1;
      if (current.publishedRevisionId !== current.revisionId) {
        const nested = childContext(
          context,
          operation,
          `release-${release.releaseKey}`,
        );
        await runDomainMutation(
          binding,
          "release.publish",
          nested,
          counts,
          () =>
            publishRelease(
              binding,
              release.releaseKey,
              current!.version,
              nested,
            ),
        );
        changed = true;
      }
    }
    for (const collection of catalog.collections) {
      let current = await readAdminCollectionDraft(
        binding,
        collection.collectionKey,
      );
      if (!current) {
        const applied = await applyCollectionDraft(
          binding,
          collection,
          operation,
          context,
          counts,
          "publication-collection-draft",
        );
        if (!applied) {
          unsupported(
            "catalog-releases",
            `Collection ${collection.collectionKey} still lacks published tracks.`,
          );
        }
        current = await readAdminCollectionDraft(
          binding,
          collection.collectionKey,
        );
      }
      if (!current) {
        unsupported(
          "catalog-releases",
          `Collection ${collection.collectionKey} is missing.`,
        );
      }
      resources += 1;
      if (current.publishedRevisionId !== current.revisionId) {
        const nested = childContext(
          context,
          operation,
          `collection-${collection.collectionKey}`,
        );
        await runDomainMutation(
          binding,
          "collection.publish",
          nested,
          counts,
          () =>
            publishCollection(
              binding,
              collection.collectionKey,
              current!.version,
              nested,
            ),
        );
        changed = true;
      }
    }
  }

  if (intent.content === "publish") {
    for (const course of proposal.topics.coursesVideo.courses) {
      const current = await readAdminCourseDraft(binding, course.courseKey);
      if (!current) {
        unsupported("courses-video", `Course ${course.courseKey} is missing.`);
      }
      resources += 1;
      if (current.publishedRevisionId !== current.revisionId) {
        const nested = childContext(
          context,
          operation,
          `course-${course.courseKey}`,
        );
        await runDomainMutation(binding, "course.publish", nested, counts, () =>
          publishCourse(binding, course.courseKey, current.version, nested),
        );
        changed = true;
      }
    }
    for (const video of proposal.topics.coursesVideo.videos) {
      const current = await readAdminVideoBySlug(binding, video.videoKey);
      if (!current) {
        unsupported("courses-video", `Video ${video.videoKey} is missing.`);
      }
      resources += 1;
      if (current.publishedRevisionId !== current.draft.id) {
        const nested = childContext(
          context,
          operation,
          `video-${video.videoKey}`,
        );
        await runDomainMutation(binding, "video.publish", nested, counts, () =>
          publishVideo(binding, video.videoKey, current.revision, nested),
        );
        changed = true;
      }
    }
  }

  return { outcome: changed ? "applied" : "no-op", resourceCount: resources };
}

async function dispatchOperation(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
  counts: DomainMutationCounts,
): Promise<HandlerResult> {
  switch (operation.action) {
    case "upsert-artist-draft":
      return applyArtist(binding, proposal, operation, context, counts);
    case "reconcile-modules-navigation":
      return applyCapabilitiesNavigation(
        binding,
        proposal,
        operation,
        context,
        counts,
      );
    case "record-media-rights-intent": {
      const rights = proposal.topics.rightsMedia;
      // The enclosing setup receipt commits this exact proposal hash. Source
      // aliases and rights details stay in the approved media workflow; the
      // D1 receipt carries only the safe count needed to prove intent existed.
      return {
        outcome:
          rights.rightsStatement.length > 0 || rights.media.length > 0
            ? "applied"
            : "no-op",
        resourceCount: rights.media.length,
      };
    }
    case "reconcile-membership-definitions":
      return applyMembershipDefinitions(
        binding,
        proposal,
        operation,
        context,
        counts,
      );
    case "reconcile-credit-rules":
      return applyCreditRules(binding, proposal, operation, context, counts);
    case "reconcile-licensing-definitions":
      return applyLicensingDefinitions(
        binding,
        proposal,
        operation,
        context,
        counts,
      );
    case "reconcile-account-authority":
      return applyAccountAuthority(
        binding,
        proposal,
        operation,
        context,
        counts,
      );
    case "reconcile-catalog-drafts":
      return applyCatalogDrafts(binding, proposal, operation, context, counts);
    case "reconcile-track-availability":
      return applyTrackAvailability(
        binding,
        proposal,
        operation,
        context,
        counts,
      );
    case "reconcile-access-definitions":
      return applyAccessDefinitions(
        binding,
        proposal,
        operation,
        context,
        counts,
      );
    case "reconcile-courses-video-drafts":
      return applyCoursesVideo(binding, proposal, operation, context, counts);
    case "reconcile-contact-consent":
      return applyContactConsent(binding, proposal, operation, context, counts);
    case "reconcile-telemetry-settings":
      return applyTelemetry(binding, proposal, operation, context, counts);
    case "save-legal-drafts":
      return applyLegalDrafts(binding, proposal, operation, context, counts);
    case "publish-approved-internal-state":
      return applyInternalPublication(
        binding,
        proposal,
        operation,
        context,
        counts,
      );
    default:
      return invalidPlan(`Unsupported setup action: ${operation.action}.`);
  }
}

async function applyValidatedOperation(
  binding: D1Database,
  artifact: SetupProposalArtifact,
  operation: SetupOperation,
  context: MutationContext,
): Promise<SetupOperationApplyReceipt> {
  await requireOwner(binding, context.actorUserId);
  const setupContext = operationContext(context, operation);
  const mutation = await prepareMutation<SetupOperationApplyReceipt>(
    binding,
    "setup.operation.apply",
    setupContext,
    {
      proposalId: artifact.proposal.proposalId,
      proposalHash: artifact.proposalHash,
      sourceStateFingerprint: artifact.proposal.sourceStateFingerprint,
      operation,
      stripeEnvironment: "test",
      livemode: false,
    },
  );
  if (mutation.replayValue) {
    return Object.freeze({ ...mutation.replayValue, replayed: true });
  }

  const counts: DomainMutationCounts = { total: 0, fresh: 0, resumed: 0 };
  const handled = await dispatchOperation(
    binding,
    artifact.proposal,
    operation,
    context,
    counts,
  );
  const result: SetupOperationApplyReceipt = Object.freeze({
    schemaVersion: SETUP_OPERATION_RECEIPT_SCHEMA_VERSION,
    proposalId: artifact.proposal.proposalId,
    operationId: operation.operationId,
    topic: operation.topic,
    action: operation.action,
    target: operation.target,
    outcome: handled.outcome,
    resourceCount: handled.resourceCount,
    domainMutationCount: counts.total,
    newDomainMutationCount: counts.fresh,
    resumedDomainMutationCount: counts.resumed,
    replayed: false,
    stripeEnvironment: "test",
    livemode: false,
  });
  const authority = activeOwnerCondition(context.actorUserId);
  const audit = prepareConditionalAuditEvent(
    binding,
    {
      actorUserId: context.actorUserId,
      action: "setup.operation.apply",
      subjectType: "setup-operation",
      subjectId: operation.operationId,
      idempotencyKey: mutation.namespacedKey,
      requestFingerprint: mutation.fingerprint,
      requestId: context.requestId,
      details: {
        proposalId: artifact.proposal.proposalId,
        topic: operation.topic,
        action: operation.action,
        target: operation.target,
        ...(operation.topic === "memberships-subscriptions" ||
        operation.topic === "credits" ||
        operation.topic === "licensing"
          ? { stripeTestPriceBinding: "pending" }
          : {}),
        stripeEnvironment: "test",
        livemode: false,
      },
      result: { ...result },
    },
    authority.sql,
    authority.bindings,
  );
  try {
    const auditResult = await audit.run();
    if (changedRows(auditResult) !== 1) {
      throw setupError(
        "SETUP_OPERATION_RECEIPT_FAILED",
        "The setup operation completed without a durable receipt.",
        "The setup operation receipt could not be saved.",
        500,
      );
    }
    return result;
  } catch (error) {
    const replay = await replayAfterMutationFailure(binding, mutation, error);
    return Object.freeze({ ...replay.value, replayed: true });
  }
}

export async function applySetupOperation(
  binding: D1Database,
  proposal: SetupProposal,
  operation: SetupOperation,
  context: MutationContext,
): Promise<SetupOperationApplyReceipt> {
  const artifact = await createProposalArtifact(proposal);
  assertProposalSupport(artifact.proposal);
  await assertOperationIdentity(artifact, operation);
  await requireOwner(binding, context.actorUserId);
  await assertStoredProposalSupport(
    binding,
    artifact.proposal,
    context.actorUserId,
  );
  return applyValidatedOperation(binding, artifact, operation, context);
}

export async function applySetupOperationPlan(
  binding: D1Database,
  proposal: SetupProposal,
  plan: SetupOperationPlan,
  context: MutationContext,
): Promise<SetupApplyReceipt> {
  const artifact = await validatedArtifactAndPlan(proposal, plan);
  await requireOwner(binding, context.actorUserId);
  await assertStoredProposalSupport(
    binding,
    artifact.proposal,
    context.actorUserId,
  );
  const receipts: SetupOperationApplyReceipt[] = [];
  for (const operation of plan.operations) {
    receipts.push(
      await applyValidatedOperation(binding, artifact, operation, context),
    );
  }
  return Object.freeze({
    schemaVersion: SETUP_APPLY_RECEIPT_SCHEMA_VERSION,
    proposalId: artifact.proposal.proposalId,
    proposalHash: artifact.proposalHash,
    sourceStateFingerprint: artifact.proposal.sourceStateFingerprint,
    operationCount: receipts.length,
    appliedCount: receipts.filter(({ outcome }) => outcome === "applied")
      .length,
    noOpCount: receipts.filter(({ outcome }) => outcome === "no-op").length,
    replayedCount: receipts.filter(({ replayed }) => replayed).length,
    stripeEnvironment: "test",
    livemode: false,
    statement: NO_REAL_PAYMENT_STATEMENT,
    operations: Object.freeze(receipts),
  });
}

export const setupApplyContract = Object.freeze({
  topicKeys: SETUP_TOPIC_KEYS,
  baseActions: BASE_D1_ACTIONS,
  stripeEnvironment: "test",
  livemode: false,
  statement: NO_REAL_PAYMENT_STATEMENT,
});
