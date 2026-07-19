export const EDITOR_PERMISSION_KEYS = Object.freeze([
  "pages.write",
  "catalog.write",
  "media.write",
] as const);

export type EditorPermissionKey = (typeof EDITOR_PERMISSION_KEYS)[number];

export function isEditorPermissionKey(
  value: unknown,
): value is EditorPermissionKey {
  return EDITOR_PERMISSION_KEYS.some(
    (permissionKey) => permissionKey === value,
  );
}
