import assert from 'node:assert/strict'
import { getAuthorityTestContext, requireNoError } from './lib/authority-test.mjs'
import { demoFixtureIds, safeSupabaseError } from './lib/local-supabase.mjs'

const ids = {
  temporaryPath: '80000000-0000-4000-8000-000000000001',
  temporaryCourse: '80000000-0000-4000-8000-000000000002',
  temporaryLesson: '80000000-0000-4000-8000-000000000003',
  temporarySection: '80000000-0000-4000-8000-000000000004',
  membershipGrant: '80000000-0000-4000-8000-000000000005',
  lessonGrant: '80000000-0000-4000-8000-000000000006',
}

async function cleanup(admin, customerId) {
  await admin
    .from('lesson_progress')
    .delete()
    .eq('subject_id', customerId)
    .in('lesson_id', [demoFixtureIds.lessonTwo, ids.temporaryLesson])
  await admin
    .from('entitlement_grants')
    .delete()
    .eq('subject_id', customerId)
    .in('source_id', [ids.membershipGrant, ids.lessonGrant])
  const { data: products } = await admin
    .from('products')
    .select('id')
    .eq('resource_type', 'lesson')
    .eq('resource_id', ids.temporaryLesson)
  const productIds = products?.map(({ id }) => id) ?? []
  await admin.from('learning_paths').delete().eq('id', ids.temporaryPath)
  await admin.from('learning_path_drafts').delete().eq('id', ids.temporaryPath)
  if (productIds.length) {
    await admin.from('prices').delete().in('product_id', productIds)
    await admin.from('products').delete().in('id', productIds)
  }
}

try {
  const { admin, anonymous, authenticated } = await getAuthorityTestContext()
  const customerOne = authenticated.customerOne
  const customerTwo = authenticated.customerTwo
  await cleanup(admin, customerOne.user.id)

  const { data: path, error: pathError } = await admin
    .from('learning_paths')
    .select('id, title')
    .eq('id', demoFixtureIds.learningPath)
    .single()
  requireNoError(pathError, 'Demonstration learning path lookup failed')
  const { data: course, error: courseError } = await admin
    .from('courses')
    .select('id')
    .eq('path_id', path.id)
    .single()
  requireNoError(courseError, 'Demonstration course lookup failed')
  const { data: lessons, error: lessonError } = await admin
    .from('lessons')
    .select('id, slug, access_mode, position')
    .eq('course_id', course.id)
    .order('position')
  requireNoError(lessonError, 'Demonstration lesson lookup failed')
  assert.deepEqual(
    lessons.map(({ slug, access_mode }) => [slug, access_mode]),
    [
      ['hear-the-first-arc', 'public'],
      ['hold-the-suspended-moment', 'membership'],
      ['return-with-context', 'account'],
    ],
  )

  const { data: anonymousSections, error: anonymousSectionError } = await anonymous
    .from('lesson_sections')
    .select('lesson_id')
  requireNoError(anonymousSectionError, 'Anonymous public-section read failed')
  assert.ok(anonymousSections.every(({ lesson_id }) => lesson_id === demoFixtureIds.lessonOne))
  assert.equal(anonymousSections.length, 3)

  const { data: publicAccess, error: publicAccessError } = await admin.rpc('decide_lesson_access', {
    p_subject_id: null,
    p_lesson_id: demoFixtureIds.lessonOne,
  })
  requireNoError(publicAccessError, 'Public lesson access decision failed')
  assert.equal(publicAccess.allowed, true)
  assert.equal(publicAccess.reason, 'public')
  const { data: signedInAccess } = await admin.rpc('decide_lesson_access', {
    p_subject_id: customerOne.user.id,
    p_lesson_id: demoFixtureIds.lessonThree,
  })
  assert.equal(signedInAccess.allowed, true)
  assert.equal(signedInAccess.reason, 'account')
  const { data: membershipMissing } = await admin.rpc('decide_lesson_access', {
    p_subject_id: customerOne.user.id,
    p_lesson_id: demoFixtureIds.lessonTwo,
  })
  assert.equal(membershipMissing.allowed, false)

  const { error: membershipGrantError } = await admin.from('entitlement_grants').insert({
    subject_id: customerOne.user.id,
    resource_type: 'membership',
    resource_id: demoFixtureIds.membershipTier,
    source_type: 'membership',
    source_id: ids.membershipGrant,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  })
  requireNoError(membershipGrantError, 'Membership entitlement fixture failed')
  const { data: memberAccess } = await admin.rpc('decide_lesson_access', {
    p_subject_id: customerOne.user.id,
    p_lesson_id: demoFixtureIds.lessonTwo,
  })
  assert.equal(memberAccess.allowed, true)
  assert.equal(memberAccess.reason, 'membership')
  const { data: otherAccess } = await admin.rpc('decide_lesson_access', {
    p_subject_id: customerTwo.user.id,
    p_lesson_id: demoFixtureIds.lessonTwo,
  })
  assert.equal(otherAccess.allowed, false)

  for (const progress of [
    { position: 2, completed: false },
    { position: 4, completed: true },
    { position: 1, completed: false },
  ]) {
    const { error } = await admin.rpc('record_lesson_progress', {
      p_subject_id: customerOne.user.id,
      p_lesson_id: demoFixtureIds.lessonTwo,
      p_section_position: progress.position,
      p_completed: progress.completed,
    })
    requireNoError(error, 'Lesson progress update failed')
  }
  const { data: savedProgress } = await customerOne.client
    .from('lesson_progress')
    .select('section_position, completed')
    .eq('lesson_id', demoFixtureIds.lessonTwo)
    .single()
  assert.equal(savedProgress.section_position, 4)
  assert.equal(savedProgress.completed, true)
  const { data: isolatedProgress } = await customerTwo.client
    .from('lesson_progress')
    .select('lesson_id')
    .eq('subject_id', customerOne.user.id)
  assert.equal(isolatedProgress.length, 0)
  const otherProgress = await admin.rpc('record_lesson_progress', {
    p_subject_id: customerTwo.user.id,
    p_lesson_id: demoFixtureIds.lessonTwo,
    p_section_position: 1,
    p_completed: false,
  })
  assert.ok(otherProgress.error, 'A non-member recorded protected progress')

  const { data: originalDraft } = await admin
    .from('learning_path_drafts')
    .select('payload')
    .eq('id', demoFixtureIds.learningPath)
    .single()
  const changedDraft = structuredClone(originalDraft.payload)
  changedDraft.title = 'Private unpublished learning title'
  const { error: privateDraftError } = await admin
    .from('learning_path_drafts')
    .update({ payload: changedDraft })
    .eq('id', demoFixtureIds.learningPath)
  requireNoError(privateDraftError, 'Private learning draft update failed')
  const { data: unchangedPublic } = await anonymous
    .from('learning_paths')
    .select('title')
    .eq('id', demoFixtureIds.learningPath)
    .single()
  assert.equal(unchangedPublic.title, path.title)
  await admin
    .from('learning_path_drafts')
    .update({ payload: originalDraft.payload })
    .eq('id', demoFixtureIds.learningPath)

  const reorderedDraft = structuredClone(originalDraft.payload)
  reorderedDraft.courses[0].lessons = [
    reorderedDraft.courses[0].lessons[2],
    reorderedDraft.courses[0].lessons[0],
    reorderedDraft.courses[0].lessons[1],
  ]
  const { error: reorderedDraftError } = await admin
    .from('learning_path_drafts')
    .update({ payload: reorderedDraft })
    .eq('id', demoFixtureIds.learningPath)
  requireNoError(reorderedDraftError, 'Reordered learning draft update failed')
  const { error: reorderedPublishError } = await admin.rpc('publish_learning_path_draft', {
    p_actor_id: authenticated.owner.user.id,
    p_draft_id: demoFixtureIds.learningPath,
  })
  requireNoError(reorderedPublishError, 'Reordered learning publication failed')
  const { data: reorderedLessons, error: reorderedLessonsError } = await admin
    .from('lessons')
    .select('slug, position')
    .eq('course_id', course.id)
    .eq('state', 'published')
    .order('position')
  requireNoError(reorderedLessonsError, 'Reordered lesson lookup failed')
  assert.deepEqual(
    reorderedLessons.map(({ slug }) => slug),
    ['return-with-context', 'hear-the-first-arc', 'hold-the-suspended-moment'],
  )
  const { error: restoredDraftError } = await admin
    .from('learning_path_drafts')
    .update({ payload: originalDraft.payload })
    .eq('id', demoFixtureIds.learningPath)
  requireNoError(restoredDraftError, 'Learning draft restore failed')
  const { error: restoredPublishError } = await admin.rpc('publish_learning_path_draft', {
    p_actor_id: authenticated.owner.user.id,
    p_draft_id: demoFixtureIds.learningPath,
  })
  requireNoError(restoredPublishError, 'Learning publication restore failed')
  const { data: restoredLessons, error: restoredLessonsError } = await admin
    .from('lessons')
    .select('slug, position')
    .eq('course_id', course.id)
    .eq('state', 'published')
    .order('position')
  requireNoError(restoredLessonsError, 'Restored lesson lookup failed')
  assert.deepEqual(
    restoredLessons.map(({ slug }) => slug),
    ['hear-the-first-arc', 'hold-the-suspended-moment', 'return-with-context'],
  )

  const temporaryPayload = {
    area: {
      id: demoFixtureIds.learningArea,
      slug: 'listening-practice',
      name: 'Listening practice',
      description: 'Short paths for hearing form, weight, and return in music for movement.',
    },
    id: ids.temporaryPath,
    slug: 'individual-entitlement-proof',
    title: 'Individual entitlement proof',
    summary: 'An isolated learning publication fixture.',
    introduction: 'This path verifies individually entitled learning without changing the demo.',
    courses: [
      {
        id: ids.temporaryCourse,
        slug: 'proof-course',
        title: 'Proof course',
        summary: 'One lesson is enough for this authority test.',
        lessons: [
          {
            id: ids.temporaryLesson,
            slug: 'proof-lesson',
            title: 'Proof lesson',
            summary: 'An individually entitled lesson.',
            estimatedMinutes: 5,
            accessMode: 'entitlement',
            accessExplanation: 'Purchase this lesson once for permanent access.',
            membershipTierId: null,
            price: { currency: 'USD', amountMinor: 900 },
            sections: [
              {
                id: ids.temporarySection,
                type: 'prose',
                heading: 'Protected proof',
                body: 'This text is visible only after the lesson access decision.',
              },
            ],
          },
        ],
      },
    ],
  }
  const { error: temporaryDraftError } = await admin.from('learning_path_drafts').insert({
    id: ids.temporaryPath,
    slug: temporaryPayload.slug,
    payload: temporaryPayload,
    updated_by: authenticated.owner.user.id,
  })
  requireNoError(temporaryDraftError, 'Entitled learning draft creation failed')
  const { error: temporaryPublishError } = await admin.rpc('publish_learning_path_draft', {
    p_actor_id: authenticated.owner.user.id,
    p_draft_id: ids.temporaryPath,
  })
  requireNoError(temporaryPublishError, 'Entitled learning publication failed')
  const { data: learningProduct, error: learningProductError } = await admin
    .from('products')
    .select('id, state, resource_type, resource_id')
    .eq('resource_type', 'lesson')
    .eq('resource_id', ids.temporaryLesson)
    .single()
  requireNoError(learningProductError, 'Learning product was not created')
  assert.equal(learningProduct.state, 'published')
  const { data: learningPrice } = await admin
    .from('prices')
    .select('amount_minor, currency, billing_interval')
    .eq('product_id', learningProduct.id)
    .eq('active', true)
    .single()
  assert.deepEqual(learningPrice, {
    amount_minor: 900,
    currency: 'USD',
    billing_interval: 'one_time',
  })
  const { error: lessonGrantError } = await admin.from('entitlement_grants').insert({
    subject_id: customerOne.user.id,
    resource_type: 'lesson',
    resource_id: ids.temporaryLesson,
    source_type: 'learning',
    source_id: ids.lessonGrant,
  })
  requireNoError(lessonGrantError, 'Individual lesson entitlement failed')
  const { data: entitledAccess } = await admin.rpc('decide_lesson_access', {
    p_subject_id: customerOne.user.id,
    p_lesson_id: ids.temporaryLesson,
  })
  assert.equal(entitledAccess.allowed, true)
  assert.equal(entitledAccess.reason, 'learning')

  await cleanup(admin, customerOne.user.id)
  console.log(
    'Learning, video, and editorial authority: PASS (order, reorder, access, progress, isolation, product)',
  )
} catch (error) {
  console.error(`Learning, video, and editorial authority: FAIL\n${safeSupabaseError(error)}`)
  process.exit(1)
}
