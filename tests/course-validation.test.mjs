import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { validateCourseDraftInput, validateCourseProgressInput } =
  await import("../lib/courses/validation.ts");

function textItem(itemKey = "welcome") {
  return {
    itemKey,
    itemType: "text",
    content: {
      text: "A fictional lesson passage.",
      caption: "",
      filename: null,
    },
    mediaDerivativeId: null,
    altText: null,
    transcriptText: null,
  };
}

function courseInput(overrides = {}) {
  return {
    slug: "fictional-practice",
    title: "Fictional practice",
    description: "A structured Course made only from fictional text.",
    accessMode: "public",
    accessPlanId: null,
    accessPlanRevision: null,
    estimatedMinutes: 20,
    sections: [
      {
        sectionKey: "begin",
        title: "Begin",
        description: "The first section.",
        lessons: [
          {
            lessonKey: "first-lesson",
            slug: "first-lesson",
            title: "First lesson",
            summary: "A fictional lesson summary.",
            accessMode: "inherit",
            estimatedMinutes: 10,
            items: [textItem()],
          },
        ],
      },
    ],
    ...overrides,
  };
}

test("Course validation accepts exact nested records and normalizes stable keys", () => {
  const result = validateCourseDraftInput(
    courseInput({ slug: "  FICTIONAL-PRACTICE  " }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.value.slug, "fictional-practice");
  assert.equal(result.value.sections[0].lessons[0].items[0].itemKey, "welcome");
});

test("Course validation rejects unsupported fields, duplicate stable keys, and unplanned protection", () => {
  const duplicate = courseInput();
  duplicate.sections[0].lessons[0].items.push(textItem("welcome"));

  for (const input of [
    { ...courseInput(), executableHtml: "<script>bad()</script>" },
    duplicate,
    courseInput({ accessMode: "protected" }),
    courseInput({
      sections: [
        {
          ...courseInput().sections[0],
          lessons: [
            {
              ...courseInput().sections[0].lessons[0],
              accessMode: "protected",
            },
          ],
        },
      ],
    }),
  ]) {
    const result = validateCourseDraftInput(input);
    assert.equal(result.ok, false);
    assert.ok(result.issues.length > 0);
  }
});

test("Course media validation requires approved-reference fields and accessible alternatives", () => {
  const baseLesson = courseInput().sections[0].lessons[0];
  const invalidImage = {
    ...textItem("image"),
    itemType: "image",
    content: { text: "", caption: "Fictional image", filename: null },
    mediaDerivativeId: "derivative_fictional",
  };
  const invalidAudio = {
    ...textItem("audio"),
    itemType: "audio",
    content: { text: "", caption: "Fictional audio", filename: null },
    mediaDerivativeId: "derivative_fictional_audio",
  };
  const result = validateCourseDraftInput(
    courseInput({
      sections: [
        {
          ...courseInput().sections[0],
          lessons: [{ ...baseLesson, items: [invalidImage, invalidAudio] }],
        },
      ],
    }),
  );
  assert.equal(result.ok, false);
  assert.match(
    result.issues.map(({ message }) => message).join(" "),
    /alt text.*transcript/i,
  );
});

test("Course progress validation pins a Course revision and rejects duplicate item keys", () => {
  const valid = validateCourseProgressInput({
    courseId: "course_fictional",
    courseRevisionId: "course_revision_fictional",
    lessonKey: "first-lesson",
    completedItemKeys: ["welcome"],
    lastItemKey: "welcome",
    state: "completed",
  });
  assert.equal(valid.ok, true);

  const duplicate = validateCourseProgressInput({
    ...valid.value,
    completedItemKeys: ["welcome", "welcome"],
  });
  assert.equal(duplicate.ok, false);
});
