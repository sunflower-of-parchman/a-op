interface SetupStatusRow {
  readonly status: string;
}

/**
 * Reports whether this installation is still showing its neutral, pre-setup
 * framework. This is a presentation state only; it grants no account, admin,
 * API, media, or commerce authority.
 */
export async function isFrameworkPreviewActive(
  binding: D1Database,
): Promise<boolean> {
  const row = await binding
    .prepare(
      `SELECT status
       FROM setup_state
       WHERE id = 'setup'
       LIMIT 1`,
    )
    .first<SetupStatusRow>();

  return row?.status === "unconfigured";
}
