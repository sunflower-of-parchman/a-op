export type LicenseGeneralTerm = {
  heading: string
  body: string
}

export type PublishedLicenseOption = {
  offerId: string
  optionId: string
  key: string
  label: string
  description: string
  usageCategory: string
  allowedMedia: string[]
  audienceLabel: string
  maxAudience: number | null
  distributionLabel: string
  maxCopies: number | null
  termMonths: number
  territory: string
  attributionRequired: boolean
  attributionText: string
  exclusive: false
  currency: string
  amountMinor: number
}

export type PublishedLicenseTemplate = {
  id: string
  slug: string
  name: string
  summary: string
  track: { id: string; slug: string; title: string }
  version: {
    id: string
    number: number
    title: string
    introduction: string
    generalTerms: LicenseGeneralTerm[]
    disclaimer: string
  }
  options: PublishedLicenseOption[]
}

export type LicensingResponse = {
  templates: PublishedLicenseTemplate[]
  inquiryPath: string
}

export type IssuedLicenseSummary = {
  id: string
  trackTitle: string
  optionLabel: string
  licenseeName: string
  projectTitle: string
  status: 'active' | 'revoked'
  documentStatus: 'queued' | 'processing' | 'ready' | 'failed'
  amountMinor: number
  currency: string
  issuedAt: string
}
