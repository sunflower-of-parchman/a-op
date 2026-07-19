"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  ContactAdminWorkspaceDTO,
  ContactSubmissionAdminDTO,
} from "@/lib/contact/index.ts";
import styles from "./Contact.module.css";

async function mutate(path: string, input: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(body.error?.message ?? "The contact change failed.");
  }
}

function SubmissionOperations({
  submission,
}: {
  submission: ContactSubmissionAdminDTO;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const nextStates = {
    new: ["in_progress", "resolved", "archived"],
    in_progress: ["resolved", "archived"],
    resolved: ["in_progress", "archived"],
    archived: [],
  }[submission.state] as readonly ContactSubmissionAdminDTO["state"][];

  async function changeState(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setMessage("Updating inquiry…");
    try {
      await mutate(
        `/api/admin/contact/submissions/${encodeURIComponent(submission.id)}/state`,
        {
          state: data.get("state"),
          expectedRevision: submission.revision,
        },
      );
      setMessage("Inquiry state updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The change failed.");
    } finally {
      setPending(false);
    }
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const target = event.currentTarget;
    const data = new FormData(target);
    setPending(true);
    setMessage("Adding note…");
    try {
      await mutate(
        `/api/admin/contact/submissions/${encodeURIComponent(submission.id)}/notes`,
        { body: data.get("body") },
      );
      target.reset();
      setMessage("Note added.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The note failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.submissionOperations}>
      {nextStates.length > 0 ? (
        <form className={styles.inlineForm} onSubmit={changeState}>
          <label className={styles.field}>
            <span>Inquiry state</span>
            <select name="state" defaultValue="" required>
              <option value="" disabled>
                Choose the next state
              </option>
              {nextStates.map((state) => (
                <option key={state} value={state}>
                  {state.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-secondary"
            type="submit"
            disabled={pending}
          >
            Update state
          </button>
        </form>
      ) : null}
      <form className={styles.inlineForm} onSubmit={addNote}>
        <label className={styles.field}>
          <span>Internal note</span>
          <textarea name="body" rows={3} maxLength={4000} required />
        </label>
        <button
          className="button button-secondary"
          type="submit"
          disabled={pending}
        >
          Add note
        </button>
      </form>
      <p className={styles.message} aria-live="polite">
        {message}
      </p>
    </div>
  );
}

export function ContactAdminWorkspace({
  workspace,
}: {
  workspace: ContactAdminWorkspaceDTO;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const form = workspace.form;

  async function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const categories = String(data.get("categories") ?? "")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    setPending(true);
    setMessage("Saving contact form…");
    try {
      await mutate("/api/admin/contact/form", {
        formKey: "contact",
        title: data.get("title"),
        description: data.get("description"),
        bookingInformation: data.get("bookingInformation"),
        publicContactDetails: data.get("publicContactDetails"),
        categories,
        consentText: data.get("consentText"),
        state: data.get("state"),
        expectedRevision: form?.revision ?? null,
      });
      setMessage("Contact form saved.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The contact form failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-workspace">
      <header className="workspace-section-heading">
        <p className="eyebrow">Contact</p>
        <h2>Inquiries and consent</h2>
        <p>
          Configure one stored-only public form, retain each exact consent
          version, and manage inquiry state without an external delivery action.
        </p>
      </header>

      <section
        className="workspace-section"
        aria-labelledby="contact-config-heading"
      >
        <div className="workspace-section-heading">
          <h3 id="contact-config-heading">Public form</h3>
          <p>
            A consent-text change creates a new immutable version. Existing
            inquiries retain the text they accepted.
          </p>
        </div>
        <form className={styles.form} onSubmit={configure}>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span>Title</span>
              <input
                name="title"
                defaultValue={form?.title ?? "Contact the artist"}
                required
              />
            </label>
            <label className={styles.field}>
              <span>State</span>
              <select name="state" defaultValue={form?.state ?? "active"}>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
          </div>
          <label className={styles.field}>
            <span>Description</span>
            <textarea
              name="description"
              rows={3}
              defaultValue={form?.description ?? ""}
            />
          </label>
          <label className={styles.field}>
            <span>Booking information</span>
            <textarea
              name="bookingInformation"
              rows={5}
              maxLength={4000}
              defaultValue={form?.bookingInformation ?? ""}
            />
          </label>
          <label className={styles.field}>
            <span>Public contact details</span>
            <textarea
              name="publicContactDetails"
              rows={5}
              maxLength={4000}
              defaultValue={form?.publicContactDetails ?? ""}
            />
          </label>
          <label className={styles.field}>
            <span>Categories, one per line</span>
            <textarea
              name="categories"
              rows={5}
              defaultValue={form?.categories.join("\n") ?? "General\nLicensing"}
              required
            />
          </label>
          <label className={styles.field}>
            <span>Consent text</span>
            <textarea
              name="consentText"
              rows={5}
              defaultValue={form?.consent.text ?? ""}
              required
            />
          </label>
          <div className={styles.actions}>
            <button
              className="button button-primary"
              type="submit"
              disabled={pending}
            >
              {pending ? "Saving…" : form ? "Save new revision" : "Create form"}
            </button>
            <p className={styles.message} aria-live="polite">
              {message}
            </p>
          </div>
        </form>
        {form ? (
          <dl className={styles.facts}>
            <div>
              <dt>Form revision</dt>
              <dd>{form.revision}</dd>
            </div>
            <div>
              <dt>Current consent</dt>
              <dd>Version {form.consent.version}</dd>
            </div>
            <div>
              <dt>Delivery adapter</dt>
              <dd>Stored only</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <section
        className="workspace-section"
        aria-labelledby="contact-inquiries-heading"
      >
        <div className="workspace-section-heading">
          <h3 id="contact-inquiries-heading">Stored inquiries</h3>
          <p>
            {workspace.submissions.length} inquiries retain their exact accepted
            consent.
          </p>
        </div>
        {workspace.submissions.length === 0 ? (
          <p className={styles.empty}>No inquiries are stored.</p>
        ) : (
          <div className={styles.submissionList}>
            {workspace.submissions.map((submission) => (
              <article className={styles.submission} key={submission.id}>
                <header className={styles.submissionHeading}>
                  <div>
                    <p className="eyebrow">{submission.category}</p>
                    <h4>{submission.subject}</h4>
                  </div>
                  <span>{submission.state.replace("_", " ")}</span>
                </header>
                <dl className={styles.facts}>
                  <div>
                    <dt>From</dt>
                    <dd>
                      {submission.name} · {submission.email}
                    </dd>
                  </div>
                  <div>
                    <dt>Received</dt>
                    <dd>{submission.createdAt}</dd>
                  </div>
                  <div>
                    <dt>Consent</dt>
                    <dd>
                      Version {submission.consent.version} ·{" "}
                      {submission.consentedAt}
                    </dd>
                  </div>
                </dl>
                <p className={styles.messageBody}>{submission.message}</p>
                <details className={styles.consentDetail}>
                  <summary>Accepted consent text</summary>
                  <p>{submission.consent.text}</p>
                </details>
                {submission.notes.length > 0 ? (
                  <ol className={styles.noteList}>
                    {submission.notes.map((note) => (
                      <li key={note.id}>
                        <p>{note.body}</p>
                        <small>{note.createdAt}</small>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <SubmissionOperations submission={submission} />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
