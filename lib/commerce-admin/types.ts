import type {
  CommerceBillingInterval,
  CommerceProductType,
} from "@/lib/commerce/domain.ts";

export type CommerceProductState = "draft" | "active" | "archived";

export interface CommerceCatalogProductSubjectInput {
  readonly resourceId: string;
  readonly resourceRevisionId: string;
  readonly resourceVersion: number;
  readonly accessPlanId: string;
  readonly accessPlanRevision: number;
}

export interface CommerceMembershipProductSubjectInput {
  readonly membershipPlanId: string;
  readonly membershipPlanRevision: number;
}

export interface CommerceSubscriptionProductSubjectInput {
  readonly subscriptionPlanId: string;
  readonly subscriptionPlanRevision: number;
}

export interface CommerceLicenseProductSubjectInput {
  readonly trackId: string;
  readonly trackRevisionId: string;
  readonly trackVersion: number;
}

export interface CommerceCreditProductSubjectInput {
  readonly quantity: number;
}

export interface CommerceTestPriceInput {
  readonly stripePriceId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly billingInterval: CommerceBillingInterval;
  readonly intervalCount: number;
}

export interface CommerceLicenseOfferReferenceInput {
  readonly licenseOfferId: string;
  readonly licenseOfferRevision: number;
}

interface CommerceProductCreateBase {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly price: CommerceTestPriceInput;
}

export type CommerceProductCreateInput =
  | (CommerceProductCreateBase & {
      readonly productType: "track" | "release" | "collection";
      readonly subject: CommerceCatalogProductSubjectInput;
    })
  | (CommerceProductCreateBase & {
      readonly productType: "membership";
      readonly subject: CommerceMembershipProductSubjectInput;
    })
  | (CommerceProductCreateBase & {
      readonly productType: "subscription";
      readonly subject: CommerceSubscriptionProductSubjectInput;
    })
  | (CommerceProductCreateBase & {
      readonly productType: "license";
      readonly subject: CommerceLicenseProductSubjectInput;
    })
  | (CommerceProductCreateBase & {
      readonly productType: "download-credits" | "license-credits";
      readonly subject: CommerceCreditProductSubjectInput;
    });

export interface CommerceProductMutationReceipt {
  readonly commerceProductId: string;
  readonly commercePriceId: string;
  readonly slug: string;
  readonly productType: CommerceProductType;
  readonly state: CommerceProductState;
  readonly revision: number;
  readonly stripePriceId: string;
  readonly stripeEnvironment: "test";
  readonly livemode: false;
  readonly created: boolean;
}
