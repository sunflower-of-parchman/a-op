import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { CourseIndex } from "@/components/courses";
import { readPublishedCourseIndex } from "@/db/course-read.ts";
import { readPublicArtwork } from "@/db/public-media.ts";
import { readPublicMosaicImages } from "@/db/public-mosaic.ts";
import { resolveApplicationIdentity } from "@/lib/auth/application-identity.ts";
import { requirePublicModulePresentation } from "@/lib/modules/active-module.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage() {
  await requirePublicModulePresentation(env.DB, "courses");
  const [identity, mosaicImages] = await Promise.all([
    resolveApplicationIdentity(env.DB, await getChatGPTUser()),
    readPublicMosaicImages(env.DB),
  ]);
  const courses = await readPublishedCourseIndex(
    env.DB,
    identity,
    new Date().toISOString(),
  );
  const artworkEntries = await Promise.all(
    courses.map(
      async (course) =>
        [
          course.slug,
          await readPublicArtwork(
            env.DB,
            `media-course-${course.slug}-artwork`,
            `${course.title} course artwork`,
          ),
        ] as const,
    ),
  );
  const artworkBySlug = Object.fromEntries(artworkEntries);
  return (
    <CourseIndex
      artworkBySlug={artworkBySlug}
      courses={courses}
      mosaicImages={mosaicImages}
    />
  );
}
