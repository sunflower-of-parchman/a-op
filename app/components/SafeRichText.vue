<script setup lang="ts">
type InlineNode = {
  type: 'text' | 'strong' | 'emphasis' | 'internal_link' | 'external_link'
  text: string
  href?: string
}

type RichTextBlock =
  { type: 'paragraph'; nodes: InlineNode[] } | { type: 'list'; items: InlineNode[][] }

const props = defineProps<{ body: string }>()

function parseInline(value: string): InlineNode[] {
  const nodes: InlineNode[] = []
  const pattern = /(\*\*([^*]+)\*\*|_([^_]+)_|\[([^\]]+)\]\(([^)\s]+)\))/g
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) nodes.push({ type: 'text', text: value.slice(cursor, index) })
    if (match[2]) nodes.push({ type: 'strong', text: match[2] })
    else if (match[3]) nodes.push({ type: 'emphasis', text: match[3] })
    else {
      const text = match[4] ?? ''
      const href = match[5] ?? ''
      if (href.startsWith('/') && !href.startsWith('//')) {
        nodes.push({ type: 'internal_link', text, href })
      } else if (href.startsWith('https://')) {
        nodes.push({ type: 'external_link', text, href })
      } else {
        nodes.push({ type: 'text', text: match[0] })
      }
    }
    cursor = index + match[0].length
  }
  if (cursor < value.length) nodes.push({ type: 'text', text: value.slice(cursor) })
  return nodes
}

const blocks = computed<RichTextBlock[]>(() => {
  const lines = props.body.split(/\r?\n/)
  const parsed: RichTextBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]?.trim() ?? ''
    if (!line) {
      index += 1
      continue
    }
    if (line.startsWith('- ')) {
      const items: InlineNode[][] = []
      while (index < lines.length) {
        const item = lines[index]?.trim() ?? ''
        if (!item.startsWith('- ')) break
        items.push(parseInline(item.slice(2).trim()))
        index += 1
      }
      parsed.push({ type: 'list', items })
      continue
    }
    const paragraph = [line]
    index += 1
    while (index < lines.length) {
      const continuation = lines[index]?.trim() ?? ''
      if (!continuation || continuation.startsWith('- ')) break
      paragraph.push(continuation)
      index += 1
    }
    parsed.push({ type: 'paragraph', nodes: parseInline(paragraph.join(' ')) })
  }
  return parsed
})
</script>

<template>
  <div class="safe-rich-text">
    <template v-for="(block, blockIndex) in blocks" :key="blockIndex">
      <p v-if="block.type === 'paragraph'">
        <template v-for="(node, nodeIndex) in block.nodes" :key="nodeIndex">
          <strong v-if="node.type === 'strong'">{{ node.text }}</strong>
          <em v-else-if="node.type === 'emphasis'">{{ node.text }}</em>
          <NuxtLink v-else-if="node.type === 'internal_link'" :to="node.href ?? '/'">
            {{ node.text }}
          </NuxtLink>
          <a
            v-else-if="node.type === 'external_link'"
            :href="node.href"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ node.text }}
          </a>
          <template v-else>{{ node.text }}</template>
        </template>
      </p>
      <ul v-else>
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
          <template v-for="(node, nodeIndex) in item" :key="nodeIndex">
            <strong v-if="node.type === 'strong'">{{ node.text }}</strong>
            <em v-else-if="node.type === 'emphasis'">{{ node.text }}</em>
            <NuxtLink v-else-if="node.type === 'internal_link'" :to="node.href ?? '/'">
              {{ node.text }}
            </NuxtLink>
            <a
              v-else-if="node.type === 'external_link'"
              :href="node.href"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ node.text }}
            </a>
            <template v-else>{{ node.text }}</template>
          </template>
        </li>
      </ul>
    </template>
  </div>
</template>
