import { readAccessFacts } from "@/db/access-read.ts";
import {
  decideAccess,
  type AccessAction,
  type AccessDecision,
} from "@/lib/access/decide-access.ts";
import {
  hasApplicationRole,
  type ApplicationIdentity,
} from "@/lib/auth/application-identity.ts";
import { hasEditorPermission } from "@/lib/auth/authorize-application.ts";
import type {
  CourseAccessMode,
  CourseAccessView,
  LessonAccessMode,
} from "./types.ts";

type CourseReadAction = Extract<AccessAction, "view" | "stream" | "download">;

function accessView(decision: AccessDecision): CourseAccessView {
  return Object.freeze({
    allowed: decision.allowed,
    reason: decision.reason,
    source: decision.source,
    signInRequired:
      !decision.allowed && decision.reason === "authentication-required",
  });
}

async function editorAllowed(
  binding: D1Database,
  identity: ApplicationIdentity | null,
  courseSlug: string,
): Promise<boolean> {
  if (!identity || !hasApplicationRole(identity, "editor")) return false;
  return hasEditorPermission(binding, identity.userId, {
    permissionKey: "pages.write",
    scopeId: courseSlug,
  });
}

function identityFacts(identity: ApplicationIdentity | null) {
  return identity ? { userId: identity.userId, roles: identity.roles } : null;
}

async function decideSingle(input: {
  readonly binding: D1Database;
  readonly identity: ApplicationIdentity | null;
  readonly resourceType: "course" | "lesson";
  readonly resourceId: string;
  readonly mode: CourseAccessMode;
  readonly action: CourseReadAction;
  readonly now: string;
  readonly editorAllowed: boolean;
}): Promise<AccessDecision> {
  const facts =
    input.mode === "protected"
      ? await readAccessFacts(input.binding, {
          identity: identityFacts(input.identity),
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          action: input.action,
          now: input.now,
        })
      : null;

  return decideAccess({
    identity: identityFacts(input.identity),
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    action: input.action,
    now: input.now,
    facts: {
      publicActions: input.mode === "public" ? [input.action] : [],
      accountActions: input.mode === "account" ? [input.action] : [],
      editorActions: input.editorAllowed ? [input.action] : [],
      grants: facts?.facts.grants ?? [],
    },
  });
}

export async function decideCourseAccess(input: {
  readonly binding: D1Database;
  readonly identity: ApplicationIdentity | null;
  readonly courseId: string;
  readonly courseSlug: string;
  readonly courseAccessMode: CourseAccessMode;
  readonly action?: CourseReadAction;
  readonly now: string;
}): Promise<AccessDecision> {
  return decideSingle({
    ...input,
    resourceType: "course",
    resourceId: input.courseId,
    mode: input.courseAccessMode,
    action: input.action ?? "view",
    editorAllowed: await editorAllowed(
      input.binding,
      input.identity,
      input.courseSlug,
    ),
  });
}

export async function decideCourseLessonAccess(input: {
  readonly binding: D1Database;
  readonly identity: ApplicationIdentity | null;
  readonly courseId: string;
  readonly courseSlug: string;
  readonly courseAccessMode: CourseAccessMode;
  readonly lessonId: string;
  readonly lessonAccessMode: LessonAccessMode;
  readonly action?: CourseReadAction;
  readonly now: string;
}): Promise<AccessDecision> {
  const action = input.action ?? "view";
  const scopedEditor = await editorAllowed(
    input.binding,
    input.identity,
    input.courseSlug,
  );
  const effectiveMode =
    input.lessonAccessMode === "inherit"
      ? input.courseAccessMode
      : input.lessonAccessMode;

  if (effectiveMode !== "protected") {
    return decideSingle({
      binding: input.binding,
      identity: input.identity,
      resourceType: "lesson",
      resourceId: input.lessonId,
      mode: effectiveMode,
      action,
      now: input.now,
      editorAllowed: scopedEditor,
    });
  }

  if (input.courseAccessMode === "protected") {
    const courseDecision = await decideSingle({
      binding: input.binding,
      identity: input.identity,
      resourceType: "course",
      resourceId: input.courseId,
      mode: "protected",
      action,
      now: input.now,
      editorAllowed: scopedEditor,
    });
    if (courseDecision.allowed) return courseDecision;
  }

  return decideSingle({
    binding: input.binding,
    identity: input.identity,
    resourceType: "lesson",
    resourceId: input.lessonId,
    mode: "protected",
    action,
    now: input.now,
    editorAllowed: scopedEditor,
  });
}

export function courseAccessView(decision: AccessDecision): CourseAccessView {
  return accessView(decision);
}
