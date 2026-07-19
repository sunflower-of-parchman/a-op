export interface ContactConsentDTO {
  readonly id: string;
  readonly version: number;
  readonly text: string;
  readonly effectiveAt: string;
}

export interface PublicContactFormDTO {
  readonly id: string;
  readonly formKey: string;
  readonly title: string;
  readonly description: string;
  readonly bookingInformation: string;
  readonly publicContactDetails: string;
  readonly categories: readonly string[];
  readonly consent: ContactConsentDTO;
  readonly revision: number;
  readonly deliveryAdapter: "stored_only";
}

export interface ContactFormConfigurationInput {
  readonly formKey: string;
  readonly title: string;
  readonly description: string;
  readonly bookingInformation: string;
  readonly publicContactDetails: string;
  readonly categories: readonly string[];
  readonly consentText: string;
  readonly state: "active" | "disabled";
  readonly expectedRevision: number | null;
}

export interface ContactSubmissionInput {
  readonly formKey: string;
  readonly consentVersionId: string;
  readonly consentAccepted: true;
  readonly name: string;
  readonly email: string;
  readonly category: string;
  readonly subject: string;
  readonly message: string;
}

export interface ContactSubmissionReceipt {
  readonly submissionId: string;
  readonly state: "new";
  readonly category: string;
  readonly consentVersion: number;
  readonly submittedAt: string;
  readonly deliveryAdapter: "stored_only";
}

export interface ContactSubmissionStateInput {
  readonly state: "new" | "in_progress" | "resolved" | "archived";
  readonly expectedRevision: number;
}

export interface ContactNoteInput {
  readonly body: string;
}

export interface ContactNoteDTO {
  readonly id: string;
  readonly authorUserId: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface ContactSubmissionAdminDTO {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly category: string;
  readonly subject: string;
  readonly message: string;
  readonly state: "new" | "in_progress" | "resolved" | "archived";
  readonly consent: ContactConsentDTO;
  readonly consentedAt: string;
  readonly submitterUserId: string | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly notes: readonly ContactNoteDTO[];
}

export interface ContactFormAdminDTO extends PublicContactFormDTO {
  readonly state: "active" | "disabled";
  readonly consentHistory: readonly ContactConsentDTO[];
}

export interface ContactAdminWorkspaceDTO {
  readonly form: ContactFormAdminDTO | null;
  readonly submissions: readonly ContactSubmissionAdminDTO[];
}

export interface ContactFormConfigurationReceipt {
  readonly formId: string;
  readonly formKey: string;
  readonly state: "active" | "disabled";
  readonly revision: number;
  readonly consentVersionId: string;
  readonly consentVersion: number;
  readonly deliveryAdapter: "stored_only";
}

export interface ContactSubmissionStateReceipt {
  readonly submissionId: string;
  readonly state: "new" | "in_progress" | "resolved" | "archived";
  readonly revision: number;
}

export interface ContactNoteReceipt {
  readonly submissionId: string;
  readonly noteId: string;
  readonly createdAt: string;
}
