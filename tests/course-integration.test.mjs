import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { createInMemoryD1, scalar } from "./helpers/in-memory-d1.mjs";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const [courseWrite, courseRead, courseValidation, accessWrite, accessRead] =
  await Promise.all([
    import("../db/course-write.ts"),
    import("../db/course-read.ts"),
    import("../lib/courses/validation.ts"),
    import("../db/access-admin-write.ts"),
    import("../db/access-admin-read.ts"),
  ]);

let requestSequence = 0;
function context(actorUserId, idempotencyKey) {
  requestSequence += 1;
  return {
    actorUserId,
    idempotencyKey,
    requestId: `request_course_${requestSequence}`,
  };
}

function identity(userId, role) {
  return {
    userId,
    email: `${role}@example.invalid`,
    displayName: `Fictional ${role}`,
    roles: [role],
  };
}

function seed(database) {
  database.exec(`
    INSERT INTO users (id, email, normalized_email, status)
    VALUES
      ('user_course_owner', 'owner@example.invalid',
       'owner@example.invalid', 'active'),
      ('user_course_editor', 'editor@example.invalid',
       'editor@example.invalid', 'active'),
      ('user_course_customer', 'customer@example.invalid',
       'customer@example.invalid', 'active');

    INSERT INTO profiles (user_id, display_name)
    VALUES
      ('user_course_owner', 'Fictional owner'),
      ('user_course_editor', 'Fictional editor'),
      ('user_course_customer', 'Fictional customer');

    INSERT INTO role_assignments
      (id, user_id, role_key, assigned_by_user_id)
    VALUES
      ('role_course_owner', 'user_course_owner', 'owner',
       'user_course_owner'),
      ('role_course_editor', 'user_course_editor', 'editor',
       'user_course_owner'),
      ('role_course_customer', 'user_course_customer', 'customer',
       'user_course_owner');

    INSERT INTO editor_permissions
      (id, user_id, permission_key, scope_id, assigned_by_user_id)
    VALUES
      ('permission_course_pages', 'user_course_editor', 'pages.write', '*',
       'user_course_owner');

    UPDATE artist_modules
    SET active = 1, activated_at = CURRENT_TIMESTAMP
    WHERE module_key = 'courses';
  `);
}

function textItem(itemKey, text = "A fictional lesson passage.") {
  return {
    itemKey,
    itemType: "text",
    content: { text, caption: "", filename: null },
    mediaDerivativeId: null,
    altText: null,
    transcriptText: null,
  };
}

function courseInput(slug, items, overrides = {}) {
  return {
    slug,
    title: slug === "protected-course" ? "Protected Course" : "Open Course",
    description: "A fictional, asset-free Course integration journey.",
    accessMode: "public",
    accessPlanId: null,
    accessPlanRevision: null,
    estimatedMinutes: 20,
    sections: [
      {
        sectionKey: "begin",
        title: "Begin",
        description: "The first Course section.",
        lessons: [
          {
            lessonKey: "first-lesson",
            slug: "first-lesson",
            title: "First lesson",
            summary: "A fictional lesson summary.",
            accessMode: "inherit",
            estimatedMinutes: 10,
            items,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function validatedCourse(input) {
  const result = courseValidation.validateCourseDraftInput(input);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.value;
}

function validatedProgress(input) {
  const result = courseValidation.validateCourseProgressInput(input);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.value;
}

async function runtimeCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.name, "RuntimeError");
    assert.equal(error?.code, code);
    return true;
  });
}

test("Course drafts publish, replay, retain stable progress, and reconcile later lesson items", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seed(memory.database);

  const firstDraft = await courseWrite.saveCourseDraft(
    memory.binding,
    validatedCourse(courseInput("open-course", [textItem("welcome")])),
    0,
    context("user_course_editor", "open-draft-one"),
  );
  assert.equal(firstDraft.value.version, 1);
  assert.equal(firstDraft.value.revision, 1);

  const publishContext = context("user_course_owner", "open-publish-one");
  const published = await courseWrite.publishCourse(
    memory.binding,
    "open-course",
    1,
    publishContext,
  );
  assert.equal(published.value.version, 2);
  assert.equal(
    (
      await courseWrite.publishCourse(
        memory.binding,
        "open-course",
        1,
        publishContext,
      )
    ).replayed,
    true,
  );

  const publicLesson = await courseRead.readPublishedCourseLesson(
    memory.binding,
    "open-course",
    "first-lesson",
    null,
    new Date().toISOString(),
  );
  assert.equal(publicLesson.access.allowed, true);
  assert.equal(publicLesson.lesson.items.length, 1);
  assert.equal(publicLesson.lesson.items[0].mediaDerivativeId, null);

  const customer = identity("user_course_customer", "customer");
  const progressInput = validatedProgress({
    courseId: published.value.courseId,
    courseRevisionId: published.value.publishedRevisionId,
    lessonKey: "first-lesson",
    completedItemKeys: ["welcome"],
    lastItemKey: "welcome",
    state: "completed",
  });
  const progressContext = context(
    "user_course_customer",
    "open-progress-complete",
  );
  const completed = await courseWrite.saveCourseProgress(
    memory.binding,
    progressInput,
    0,
    progressContext,
  );
  assert.equal(completed.value.state, "completed");
  assert.equal(
    (
      await courseWrite.saveCourseProgress(
        memory.binding,
        progressInput,
        0,
        progressContext,
      )
    ).replayed,
    true,
  );

  const revisedDraft = await courseWrite.saveCourseDraft(
    memory.binding,
    validatedCourse(
      courseInput("open-course", [
        textItem("welcome"),
        textItem("practice"),
        textItem("reflection"),
      ]),
    ),
    2,
    context("user_course_editor", "open-draft-two"),
  );
  const revisedPublication = await courseWrite.publishCourse(
    memory.binding,
    "open-course",
    revisedDraft.value.version,
    context("user_course_owner", "open-publish-two"),
  );

  const revisedLesson = await courseRead.readPublishedCourseLesson(
    memory.binding,
    "open-course",
    "first-lesson",
    customer,
    new Date().toISOString(),
  );
  assert.equal(revisedLesson.progress.state, "in_progress");
  assert.deepEqual(revisedLesson.progress.completedItemKeys, ["welcome"]);

  await runtimeCode(
    courseWrite.saveCourseProgress(
      memory.binding,
      {
        ...progressInput,
        courseRevisionId: published.value.publishedRevisionId,
      },
      1,
      context("user_course_customer", "stale-progress-revision"),
    ),
    "COURSE_REVISION_CHANGED",
  );

  const reopened = await courseWrite.saveCourseProgress(
    memory.binding,
    validatedProgress({
      courseId: published.value.courseId,
      courseRevisionId: revisedPublication.value.publishedRevisionId,
      lessonKey: "first-lesson",
      completedItemKeys: ["welcome", "practice"],
      lastItemKey: "practice",
      state: "in_progress",
    }),
    1,
    context("user_course_customer", "reopened-progress"),
  );
  assert.equal(reopened.value.revision, 2);

  await courseWrite.saveCourseProgress(
    memory.binding,
    validatedProgress({
      courseId: published.value.courseId,
      courseRevisionId: revisedPublication.value.publishedRevisionId,
      lessonKey: "first-lesson",
      completedItemKeys: ["welcome", "practice", "reflection"],
      lastItemKey: "reflection",
      state: "completed",
    }),
    2,
    context("user_course_customer", "recompleted-progress"),
  );

  const account = await courseRead.readCustomerCourseProgress(
    memory.binding,
    customer,
    new Date().toISOString(),
  );
  assert.equal(account.length, 1);
  assert.equal(account[0].completedLessons, 1);
  assert.equal(account[0].totalLessons, 1);
  assert.equal(
    scalar(memory.database, "SELECT COUNT(*) FROM course_progress"),
    1,
  );
});

test("protected Courses join owner access plans and recheck current access inside progress writes", async (t) => {
  const memory = await createInMemoryD1();
  t.after(() => memory.close());
  seed(memory.database);

  const initial = await courseWrite.saveCourseDraft(
    memory.binding,
    validatedCourse(
      courseInput("protected-course", [textItem("protected-item")]),
    ),
    0,
    context("user_course_editor", "protected-initial-draft"),
  );

  const accessOverview = await accessRead.readAdminAccessOverview(
    memory.binding,
    "user_course_owner",
  );
  const courseResource = accessOverview.resources.find(
    ({ resourceType, resourceId }) =>
      resourceType === "course" && resourceId === initial.value.courseId,
  );
  assert.deepEqual(courseResource.allowedActions, ["view"]);

  const plan = await accessWrite.createAccessPlan(
    memory.binding,
    {
      slug: "protected-course-access",
      name: "Protected Course access",
      description: "A fictional direct Course access plan.",
      items: [
        {
          resourceType: "course",
          resourceId: initial.value.courseId,
          actions: ["view"],
          remainingUses: null,
          downloadDisposition: null,
        },
      ],
    },
    context("user_course_owner", "protected-access-plan"),
  );

  const protectedDraft = await courseWrite.saveCourseDraft(
    memory.binding,
    validatedCourse(
      courseInput("protected-course", [textItem("protected-item")], {
        accessMode: "protected",
        accessPlanId: plan.value.accessPlanId,
        accessPlanRevision: plan.value.revision,
      }),
    ),
    initial.value.version,
    context("user_course_editor", "protected-final-draft"),
  );
  const publication = await courseWrite.publishCourse(
    memory.binding,
    "protected-course",
    protectedDraft.value.version,
    context("user_course_owner", "protected-publish"),
  );

  const anonymous = await courseRead.readPublishedCourseLesson(
    memory.binding,
    "protected-course",
    "first-lesson",
    null,
    new Date().toISOString(),
  );
  assert.equal(anonymous.access.allowed, false);
  assert.equal(anonymous.lesson.items.length, 0);

  const issued = await accessWrite.issueAccessPlan(
    memory.binding,
    {
      accessPlanId: plan.value.accessPlanId,
      customerUserId: "user_course_customer",
      startsAt: null,
      expiresAt: null,
      reason: "Fictional Course access.",
    },
    plan.value.revision,
    context("user_course_owner", "protected-issue"),
  );
  const customer = identity("user_course_customer", "customer");
  const allowed = await courseRead.readPublishedCourseLesson(
    memory.binding,
    "protected-course",
    "first-lesson",
    customer,
    new Date().toISOString(),
  );
  assert.equal(allowed.access.allowed, true);
  assert.equal(allowed.lesson.items.length, 1);

  const progress = validatedProgress({
    courseId: publication.value.courseId,
    courseRevisionId: publication.value.publishedRevisionId,
    lessonKey: "first-lesson",
    completedItemKeys: [],
    lastItemKey: "protected-item",
    state: "in_progress",
  });
  await courseWrite.saveCourseProgress(
    memory.binding,
    progress,
    0,
    context("user_course_customer", "protected-progress-active"),
  );

  await accessWrite.revokeAccessGrantSet(
    memory.binding,
    issued.value.grantSetId,
    issued.value.revision,
    context("user_course_owner", "protected-revoke"),
  );
  const denied = await courseRead.readPublishedCourseLesson(
    memory.binding,
    "protected-course",
    "first-lesson",
    customer,
    new Date().toISOString(),
  );
  assert.equal(denied.access.allowed, false);

  await runtimeCode(
    courseWrite.saveCourseProgress(
      memory.binding,
      validatedProgress({
        ...progress,
        completedItemKeys: ["protected-item"],
        state: "completed",
      }),
      1,
      context("user_course_customer", "protected-progress-revoked"),
    ),
    "STALE_STATE",
  );
  assert.equal(
    scalar(
      memory.database,
      "SELECT revision FROM course_progress WHERE user_id = 'user_course_customer' AND course_id = ?",
      publication.value.courseId,
    ),
    1,
  );
});
