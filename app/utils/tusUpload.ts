export type TusUploadTarget = {
  intentId: string
  endpoint: string
  token: string
  bucket: string
  path: string
  chunkSize: number
}

function encodeMetadata(value: string) {
  return btoa(unescape(encodeURIComponent(value)))
}

function uploadMetadata(target: TusUploadTarget, file: Blob) {
  const values: Array<[string, string]> = [
    ['bucketName', target.bucket],
    ['objectName', target.path],
    ['contentType', file.type],
    ['cacheControl', '3600'],
  ]
  return values.map(([key, value]) => `${key} ${encodeMetadata(value)}`).join(',')
}

async function existingOffset(location: string, token: string) {
  const response = await fetch(location, {
    method: 'HEAD',
    headers: { 'Tus-Resumable': '1.0.0', 'x-signature': token },
  })
  if (!response.ok) return null
  return Number(response.headers.get('Upload-Offset') ?? 0)
}

export async function uploadWithTus(
  file: Blob,
  target: TusUploadTarget,
  onProgress: (fraction: number) => void = () => {},
) {
  const storageKey = `artist-tus:${target.intentId}`
  let location = localStorage.getItem(storageKey)
  let offset = location ? await existingOffset(location, target.token) : null
  if (offset === null) {
    localStorage.removeItem(storageKey)
    const response = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(file.size),
        'Upload-Metadata': uploadMetadata(target, file),
        'x-signature': target.token,
        'x-upsert': 'false',
      },
    })
    if (!response.ok) throw new Error('The resumable upload could not be started.')
    const nextLocation = response.headers.get('Location')
    if (!nextLocation) throw new Error('The upload service omitted its resume location.')
    location = new URL(nextLocation, target.endpoint).toString()
    localStorage.setItem(storageKey, location)
    offset = 0
  }

  let uploadOffset = offset ?? 0
  while (uploadOffset < file.size) {
    const upperBound = Math.min(uploadOffset + target.chunkSize, file.size)
    const response: Response = await fetch(location!, {
      method: 'PATCH',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': String(uploadOffset),
        'Content-Type': 'application/offset+octet-stream',
        'x-signature': target.token,
      },
      body: file.slice(uploadOffset, upperBound),
    })
    if (!response.ok) throw new Error('A resumable upload chunk was rejected.')
    const nextOffset: number = Number(response.headers.get('Upload-Offset'))
    if (!Number.isFinite(nextOffset) || nextOffset <= uploadOffset) {
      throw new Error('The upload service returned an invalid resume offset.')
    }
    uploadOffset = nextOffset
    onProgress(uploadOffset / file.size)
  }

  localStorage.removeItem(storageKey)
}
