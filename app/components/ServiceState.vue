<script setup lang="ts">
withDefaults(
  defineProps<{
    eyebrow?: string
    title: string
    message: string
    retryable?: boolean
  }>(),
  { eyebrow: 'Current state', retryable: false },
)

defineEmits<{ retry: [] }>()
</script>

<template>
  <section class="service-state" aria-live="polite">
    <p class="section-number">{{ eyebrow }}</p>
    <div>
      <h2>{{ title }}</h2>
      <p>{{ message }}</p>
      <button v-if="retryable" class="text-action" type="button" @click="$emit('retry')">
        Try again
      </button>
    </div>
  </section>
</template>
