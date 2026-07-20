"use client";

import { useRef, useState, type FormEvent } from "react";
import type { PublicContactFormDTO } from "@/lib/contact/index.ts";
import { TelemetryPageView } from "@/components/telemetry";
import styles from "./Contact.module.css";

export interface ContactFormProps {
  readonly form: PublicContactFormDTO;
  readonly title?: string;
  readonly description?: string | null;
  readonly defaultCategory?: string;
  readonly embedded?: boolean;
}

export function ContactForm({
  form,
  title,
  description,
  defaultCategory,
  embedded = false,
}: ContactFormProps) {
  const operationKey = useRef(crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"neutral" | "positive" | "critical">(
    "neutral",
  );
  const selectedCategory = defaultCategory
    ? form.categories.find((category) =>
        category.toLowerCase().includes(defaultCategory.toLowerCase()),
      )
    : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const target = event.currentTarget;
    const data = new FormData(target);
    setPending(true);
    setMessage("Storing your inquiry…");
    setTone("neutral");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": operationKey.current,
        },
        body: JSON.stringify({
          formKey: form.formKey,
          consentVersionId: form.consent.id,
          consentAccepted: data.get("consentAccepted") === "on",
          name: data.get("name"),
          email: data.get("email"),
          category: data.get("category"),
          subject: data.get("subject"),
          message: data.get("message"),
        }),
      });
      const body = (await response.json()) as {
        error?: { message?: string };
        result?: { submissionId?: string };
      };
      if (!response.ok || !body.result?.submissionId) {
        throw new Error(
          body.error?.message ?? "The inquiry could not be stored.",
        );
      }
      target.reset();
      operationKey.current = crypto.randomUUID();
      setTone("positive");
      setMessage("Your inquiry is stored for the artist.");
    } catch (error) {
      setTone("critical");
      setMessage(
        error instanceof Error
          ? error.message
          : "The inquiry could not be stored.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className={`${styles.section} ${embedded ? styles.embedded : ""}`}
      aria-labelledby="contact-form-heading"
    >
      <TelemetryPageView
        eventName="contact-view"
        resourceId={form.id}
        resourceType="contact"
      />
      <div className={styles.headingGroup}>
        <h2 id="contact-form-heading">{title ?? form.title}</h2>
        {description !== undefined ? (
          description ? (
            <p>{description}</p>
          ) : null
        ) : form.description ? (
          <p>{form.description}</p>
        ) : null}
      </div>
      {form.bookingInformation || form.publicContactDetails ? (
        <div className={styles.publicDetails}>
          {form.bookingInformation ? (
            <section aria-labelledby="booking-information-heading">
              <h3 id="booking-information-heading">Booking</h3>
              <p>{form.bookingInformation}</p>
            </section>
          ) : null}
          {form.publicContactDetails ? (
            <section aria-labelledby="public-contact-details-heading">
              <h3 id="public-contact-details-heading">Contact details</h3>
              <p>{form.publicContactDetails}</p>
            </section>
          ) : null}
        </div>
      ) : null}
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span>Name</span>
            <input name="name" autoComplete="name" maxLength={160} required />
          </label>
          <label className={styles.field}>
            <span>Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={320}
              required
            />
          </label>
        </div>
        <label className={styles.field}>
          <span>Inquiry category</span>
          <select
            name="category"
            required
            defaultValue={selectedCategory ?? ""}
          >
            <option value="" disabled>
              Select a category
            </option>
            {form.categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Subject</span>
          <input name="subject" maxLength={240} required />
        </label>
        <label className={styles.field}>
          <span>Message</span>
          <textarea name="message" rows={8} maxLength={12_000} required />
        </label>
        <label className={styles.consent}>
          <input name="consentAccepted" type="checkbox" required />
          <span>
            {form.consent.text}{" "}
            <small>Consent version {form.consent.version}</small>
          </span>
        </label>
        <p className={styles.boundary}>
          This form stores the inquiry in the artist&apos;s a-op installation.
          Its delivery adapter is stored only.
        </p>
        <div className={styles.actions}>
          <button
            className="button button-primary"
            disabled={pending}
            type="submit"
          >
            {pending ? "Storing…" : "Send inquiry"}
          </button>
          <p className={styles.message} data-tone={tone} aria-live="polite">
            {message}
          </p>
        </div>
      </form>
    </section>
  );
}
