do $hosted_initialize$
declare
  current_schema_version text;
  current_project_hash text;
begin
  select value into current_schema_version
  from public.installation_metadata
  where key = 'schema_version';

  if current_schema_version is distinct from '__SCHEMA_VERSION__' then
    raise exception 'Hosted initialization refused: schema version mismatch.';
  end if;

  select value into current_project_hash
  from public.installation_metadata
  where key = 'judging_project_ref_sha256';

  if current_project_hash is not null then
    raise exception 'Hosted initialization refused: project marker already exists.';
  end if;

  insert into public.installation_metadata (key, value)
  values
    ('judging_project_ref_sha256', '__PROJECT_REF_SHA256__'),
    ('hosted_reset_version', '__RESET_VERSION__');
end
$hosted_initialize$;
