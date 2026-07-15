import { z } from 'zod'

export const licenseCheckoutSchema = z.object({
  offerId: z.string().uuid(),
  licenseeName: z.string().trim().min(1).max(200),
  projectTitle: z.string().trim().min(1).max(240),
  projectDescription: z.string().trim().min(10).max(3000),
  returnPath: z
    .string()
    .regex(/^\/(?!\/)/)
    .max(500)
    .default('/account'),
})

const generalTermSchema = z.object({
  heading: z.string().trim().min(1).max(160),
  body: z.string().trim().min(10).max(3000),
})

const licenseOptionSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  label: z.string().trim().min(1).max(160),
  description: z.string().trim().min(10).max(2000),
  usageCategory: z.string().trim().min(1).max(120),
  allowedMedia: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
  audienceLabel: z.string().trim().min(1).max(160),
  maxAudience: z.number().int().positive().nullable(),
  distributionLabel: z.string().trim().min(1).max(200),
  maxCopies: z.number().int().positive().nullable(),
  termMonths: z.number().int().positive().max(1200),
  territory: z.string().trim().min(1).max(160),
  attributionRequired: z.boolean(),
  attributionText: z.string().trim().max(500),
  exclusive: z.literal(false),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase()),
  amountMinor: z.number().int().positive(),
  sortOrder: z.number().int().min(0),
})

export const publishLicenseTemplateSchema = z.object({
  templateId: z.string().uuid().nullable(),
  trackId: z.string().uuid(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(2000),
  title: z.string().trim().min(1).max(200),
  introduction: z.string().trim().min(1).max(4000),
  generalTerms: z.array(generalTermSchema).min(1).max(20),
  disclaimer: z.string().trim().min(1).max(1000),
  options: z.array(licenseOptionSchema).min(1).max(20),
})

export type PublishLicenseTemplateInput = z.infer<typeof publishLicenseTemplateSchema>
