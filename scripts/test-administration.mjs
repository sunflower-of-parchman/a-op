import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getAuthorityTestContext, requireNoError } from './lib/authority-test.mjs'
import { projectRoot } from './lib/command.mjs'
import { safeSupabaseError } from './lib/local-supabase.mjs'

try {
  const { anonymous, admin, authenticated } = await getAuthorityTestContext()
  const owner = authenticated.owner
  const editor = authenticated.editor
  const customer = authenticated.customerOne
  const bootstrap = JSON.parse(
    await readFile(resolve(projectRoot, 'content/demo/bootstrap-config.json'), 'utf8'),
  )

  const { data: publishedBefore, error: publishedBeforeError } = await anonymous
    .from('published_site_config')
    .select('id, config')
    .single()
  requireNoError(publishedBeforeError, 'Published configuration read failed')

  const changed = structuredClone(bootstrap)
  changed.identity.name = 'Database Authority Test'
  const draftId = '40000000-0000-4000-8000-000000000001'
  const { error: draftError } = await owner.client.from('site_config_versions').insert({
    id: draftId,
    installation_key: 'primary',
    status: 'draft',
    config_schema_version: 1,
    config: changed,
    updated_by: owner.user.id,
  })
  requireNoError(draftError, 'Owner configuration draft failed')

  const { data: customerVersions, error: customerVersionsError } = await customer.client
    .from('site_config_versions')
    .select('id')
  requireNoError(customerVersionsError, 'Customer configuration query failed')
  assert.deepEqual(
    customerVersions.map(({ id }) => id),
    [publishedBefore.id],
  )

  const { data: publishedStill, error: publishedStillError } = await anonymous
    .from('published_site_config')
    .select('config')
    .single()
  requireNoError(publishedStillError, 'Draft-isolation read failed')
  assert.notEqual(publishedStill.config.identity.name, changed.identity.name)

  const { error: publishConfigError } = await admin.rpc('publish_site_config', {
    p_version_id: draftId,
    p_actor_id: owner.user.id,
  })
  requireNoError(publishConfigError, 'Configuration publication failed')

  const { data: publishedAfter, error: publishedAfterError } = await anonymous
    .from('published_site_config')
    .select('config')
    .single()
  requireNoError(publishedAfterError, 'Published configuration refresh failed')
  assert.equal(publishedAfter.config.identity.name, changed.identity.name)

  const pageId = '40000000-0000-4000-8000-000000000002'
  const { error: pageDraftError } = await editor.client.from('pages').insert({
    id: pageId,
    slug: 'policy-page',
    title: 'Policy page',
    status: 'draft',
    seo: { title: 'Policy page', description: 'A publication policy test.' },
    sections: [
      {
        id: '40000000-0000-4000-8000-000000000003',
        type: 'prose',
        heading: 'Private until published',
        body: 'The draft should not cross the anonymous boundary.',
      },
    ],
    created_by: editor.user.id,
    updated_by: editor.user.id,
  })
  requireNoError(pageDraftError, 'Editor page draft failed')

  const { data: draftForAnonymous, error: draftForAnonymousError } = await anonymous
    .from('pages')
    .select('id')
    .eq('id', pageId)
  requireNoError(draftForAnonymousError, 'Anonymous draft-page query failed')
  assert.equal(draftForAnonymous.length, 0)

  const { error: publishPageError } = await admin.rpc('publish_page', {
    p_page_id: pageId,
    p_actor_id: editor.user.id,
  })
  requireNoError(publishPageError, 'Page publication failed')
  const { data: publicPage, error: publicPageError } = await anonymous
    .from('pages')
    .select('id')
    .eq('slug', 'policy-page')
  requireNoError(publicPageError, 'Published page read failed')
  assert.equal(publicPage.length, 1)

  const fingerprint = 'a'.repeat(64)
  for (let index = 0; index < 3; index += 1) {
    const { error } = await admin.rpc('submit_contact_message', {
      p_name: `Policy contact ${index + 1}`,
      p_email: 'listener@example.com',
      p_message: 'This message is long enough to validate storage.',
      p_consent: true,
      p_request_fingerprint: fingerprint,
    })
    requireNoError(error, `Contact message ${index + 1} failed`)
  }
  const { error: rateLimitError } = await admin.rpc('submit_contact_message', {
    p_name: 'Policy contact 4',
    p_email: 'listener@example.com',
    p_message: 'This fourth message should be rejected by the database.',
    p_consent: true,
    p_request_fingerprint: fingerprint,
  })
  assert.ok(rateLimitError, 'The fourth contact message unexpectedly succeeded')

  const { data: customerMessages, error: customerMessagesError } = await customer.client
    .from('contact_messages')
    .select('id')
  requireNoError(customerMessagesError, 'Customer contact-message denial query failed')
  assert.equal(customerMessages.length, 0)

  const { data: ownerMessages, error: ownerMessagesError } = await owner.client
    .from('contact_messages')
    .select('id')
  requireNoError(ownerMessagesError, 'Owner contact-message read failed')
  assert.equal(ownerMessages.length, 3)

  console.log(
    'Artist administration database: PASS (draft, publish, page, contact, audit authority)',
  )
} catch (error) {
  console.error(`Artist administration database: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
