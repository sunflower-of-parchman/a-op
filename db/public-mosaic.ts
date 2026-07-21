import { readPublicMusicIndex } from "./catalog-read.ts";
import { readPublishedCourseIndex } from "./course-read.ts";
import { readPublicArtwork, type PublicArtwork } from "./public-media.ts";

function uniqueArtwork(
  images: readonly PublicArtwork[],
): readonly PublicArtwork[] {
  const byUrl = new Map<string, PublicArtwork>();
  for (const image of images) byUrl.set(image.url, image);
  return Object.freeze([...byUrl.values()]);
}

export async function readPublicMosaicImages(
  binding: D1Database,
): Promise<readonly PublicArtwork[]> {
  const [catalog, courses, portrait] = await Promise.all([
    readPublicMusicIndex(binding, { kind: "all", sort: "newest" }),
    readPublishedCourseIndex(binding, null, new Date().toISOString()),
    readPublicArtwork(
      binding,
      "media-about-profile-artwork",
      "Portrait of Michael Wall",
    ),
  ]);
  const releases = catalog.items
    .filter((item) => item.kind === "release" && item.artwork)
    .map((item) => item.artwork as PublicArtwork);
  const collections = catalog.items
    .filter((item) => item.kind === "collection" && item.artwork)
    .map((item) => item.artwork as PublicArtwork);
  const courseArtwork = await Promise.all(
    courses.map((course) =>
      readPublicArtwork(
        binding,
        `media-course-${course.slug}-artwork`,
        `${course.title} course artwork`,
      ),
    ),
  );
  const mixedCatalog = collections.flatMap((collection, index) =>
    releases[index] ? [releases[index], collection] : [collection],
  );

  return uniqueArtwork([
    ...mixedCatalog,
    ...releases.slice(collections.length),
    ...courseArtwork.filter((image): image is PublicArtwork => image !== null),
    ...(portrait ? [portrait] : []),
  ]).slice(0, 16);
}
