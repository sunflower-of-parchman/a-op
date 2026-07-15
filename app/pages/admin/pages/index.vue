<script setup lang="ts">
useSeoMeta({ title: 'Structured pages' })

const { data, error } = await useFetch('/api/admin/pages')
if (error.value?.statusCode === 401) await navigateTo('/sign-in?redirect=/admin/pages')

const grouped = computed(() => {
  const pages = new Map<string, { title: string; published: boolean; draft: boolean }>()
  for (const page of data.value?.pages ?? []) {
    const current = pages.get(page.slug) ?? { title: page.title, published: false, draft: false }
    current.title = page.title
    current[page.status === 'published' ? 'published' : 'draft'] = true
    pages.set(page.slug, current)
  }
  return [...pages.entries()]
})
</script>

<template>
  <div class="page-frame admin-editor">
    <header class="page-heading">
      <p class="eyebrow">Artist administration / Pages</p>
      <h1>Compose with safe, ordered sections.</h1>
      <p>
        Each page is versioned, previewable, and published explicitly. Arbitrary scripts and raw
        HTML are outside the contract.
      </p>
    </header>

    <ol class="page-admin-list">
      <li v-for="[slug, page] in grouped" :key="slug">
        <span>{{ page.title }}</span>
        <small
          >{{ page.published ? 'Published' : 'Not published' }} ·
          {{ page.draft ? 'Draft available' : 'No draft' }}</small
        >
        <NuxtLink class="text-action" :to="`/admin/pages/${slug}`">Edit {{ slug }}</NuxtLink>
      </li>
    </ol>
  </div>
</template>
