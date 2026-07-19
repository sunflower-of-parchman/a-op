"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type {
  AccessDownloadDisposition,
  AdminAccessOverviewDTO,
  AdminAccessPlanDTO,
  AdminAccessResourceOptionDTO,
} from "@/lib/access-management/types.ts";
import type { ProtectedAccessAction } from "@/db/access-read.ts";
import styles from "./AccessWorkspace.module.css";
import { useAccessMutation } from "./useAccessMutation";

export interface AccessWorkspaceProps {
  readonly data: AdminAccessOverviewDTO;
}

interface SelectedResource {
  readonly key: string;
  readonly resourceType: AdminAccessResourceOptionDTO["resourceType"];
  readonly resourceId: string;
  readonly actions: readonly ProtectedAccessAction[];
  readonly downloadDisposition: AccessDownloadDisposition | null;
}

const ACTION_LABELS: Readonly<Record<ProtectedAccessAction, string>> =
  Object.freeze({
    view: "View",
    stream: "Stream",
    download: "Download",
  });

function resourceKey(resource: {
  readonly resourceType: string;
  readonly resourceId: string;
}): string {
  return `${resource.resourceType}:${resource.resourceId}`;
}

function dateLabel(value: string | null): string {
  if (value === null) return "Open";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function byteLabel(value: number): string {
  if (value < 1_000) return `${value} B`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} KB`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  return `${(value / 1_000_000_000).toFixed(1)} GB`;
}

function toTimestamp(value: string): string | null {
  if (value === "") return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("Choose a valid access date.");
  return new Date(time).toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The access change did not finish.";
}

function planCanBeEdited(
  plan: AdminAccessPlanDTO,
  resources: readonly AdminAccessResourceOptionDTO[],
): boolean {
  if (plan.definitionLocked || plan.state !== "active") return false;
  const resourceMap = new Map(
    resources.map((resource) => [resourceKey(resource), resource]),
  );
  return plan.items.every((item) => {
    const resource = resourceMap.get(resourceKey(item));
    return (
      resource !== undefined &&
      item.actions.every((action) => resource.allowedActions.includes(action))
    );
  });
}

export function AccessWorkspace({ data }: AccessWorkspaceProps) {
  const router = useRouter();
  const mutate = useAccessMutation();
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [expectedRevision, setExpectedRevision] = useState<number | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedResources, setSelectedResources] = useState<
    readonly SelectedResource[]
  >([]);
  const activePlans = useMemo(
    () => data.plans.filter(({ state }) => state === "active"),
    [data.plans],
  );
  const [issuePlanId, setIssuePlanId] = useState(activePlans[0]?.id ?? "");
  const [issueCustomerId, setIssueCustomerId] = useState(
    data.customers[0]?.userId ?? "",
  );
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const selectedByKey = useMemo(
    () => new Map(selectedResources.map((item) => [item.key, item])),
    [selectedResources],
  );

  function resetPlanEditor() {
    setEditingPlanId(null);
    setExpectedRevision(null);
    setSlug("");
    setName("");
    setDescription("");
    setSelectedResources([]);
  }

  function editPlan(plan: AdminAccessPlanDTO) {
    if (!planCanBeEdited(plan, data.resources)) return;
    setEditingPlanId(plan.id);
    setExpectedRevision(plan.revision);
    setSlug(plan.slug);
    setName(plan.name);
    setDescription(plan.description);
    setSelectedResources(
      plan.items.map((item) => ({
        key: resourceKey(item),
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        actions: item.actions,
        downloadDisposition: item.downloadDisposition,
      })),
    );
    setMessage(`Editing ${plan.name}.`);
  }

  function toggleResource(
    resource: AdminAccessResourceOptionDTO,
    included: boolean,
  ) {
    const key = resourceKey(resource);
    setSelectedResources((current) => {
      if (!included) return current.filter((item) => item.key !== key);
      if (current.some((item) => item.key === key)) return current;
      return [
        ...current,
        {
          key,
          resourceType: resource.resourceType,
          resourceId: resource.resourceId,
          actions: resource.allowedActions,
          downloadDisposition: resource.allowedActions.includes("download")
            ? "attachment"
            : null,
        },
      ];
    });
  }

  function toggleAction(
    resource: AdminAccessResourceOptionDTO,
    action: ProtectedAccessAction,
    included: boolean,
  ) {
    const key = resourceKey(resource);
    setSelectedResources((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        const actions = included
          ? [...item.actions, action]
          : item.actions.filter((candidate) => candidate !== action);
        return {
          ...item,
          actions,
          downloadDisposition: actions.includes("download")
            ? (item.downloadDisposition ?? "attachment")
            : null,
        };
      }),
    );
  }

  function setDisposition(
    key: string,
    downloadDisposition: AccessDownloadDisposition,
  ) {
    setSelectedResources((current) =>
      current.map((item) =>
        item.key === key ? { ...item, downloadDisposition } : item,
      ),
    );
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      selectedResources.length === 0 ||
      selectedResources.some(({ actions }) => actions.length === 0)
    ) {
      setMessage("Choose at least one resource and one action per resource.");
      return;
    }
    setWorking(true);
    setMessage(editingPlanId ? "Saving access plan…" : "Creating access plan…");
    const items = selectedResources.map((item) => ({
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      actions: item.actions,
      remainingUses: null,
      downloadDisposition: item.downloadDisposition,
    }));
    try {
      if (editingPlanId && expectedRevision !== null) {
        await mutate(
          `/api/admin/access/plans/${encodeURIComponent(editingPlanId)}`,
          "PUT",
          {
            expectedRevision,
            plan: { name, description, items },
          },
        );
        setMessage("Access plan saved.");
      } else {
        await mutate("/api/admin/access/plans", "POST", {
          plan: { slug, name, description, items },
        });
        setMessage("Access plan created.");
      }
      resetPlanEditor();
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function archivePlan(plan: AdminAccessPlanDTO) {
    setWorking(true);
    setMessage(`Archiving ${plan.name}…`);
    try {
      await mutate(
        `/api/admin/access/plans/${encodeURIComponent(plan.id)}`,
        "DELETE",
        { expectedRevision: plan.revision },
      );
      if (editingPlanId === plan.id) resetPlanEditor();
      setMessage(`${plan.name} archived. Existing access history remains.`);
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function issuePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const plan = data.plans.find(({ id }) => id === issuePlanId);
    if (!plan || issueCustomerId === "") {
      setMessage("Choose an active plan and customer.");
      return;
    }
    setWorking(true);
    setMessage("Issuing access…");
    try {
      await mutate("/api/admin/access/grants", "POST", {
        expectedPlanRevision: plan.revision,
        grant: {
          accessPlanId: plan.id,
          customerUserId: issueCustomerId,
          startsAt: toTimestamp(startsAt),
          expiresAt: toTimestamp(expiresAt),
          reason,
        },
      });
      setReason("");
      setStartsAt("");
      setExpiresAt("");
      setMessage("Access issued. Grants and entitlements are active.");
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function transitionGrant(
    grantSetId: string,
    revision: number,
    transition: "expire" | "revoke",
  ) {
    setWorking(true);
    setMessage(
      transition === "revoke" ? "Revoking access…" : "Expiring access…",
    );
    try {
      await mutate(
        `/api/admin/access/grants/${encodeURIComponent(grantSetId)}/${transition}`,
        "POST",
        { expectedRevision: revision },
      );
      setMessage(
        transition === "revoke"
          ? "Access revoked across grants and entitlements."
          : "Access marked expired across grants and entitlements.",
      );
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.workspace}>
      <p className={styles.message} aria-live="polite" role="status">
        {message}
      </p>

      <section className={styles.section} aria-labelledby="access-plans-title">
        <header className={styles.heading}>
          <p className="eyebrow">Definitions</p>
          <h2 id="access-plans-title">Access plans</h2>
          <p>
            Connect current published music to reusable access definitions. The
            definition freezes when its first grant is issued.
          </p>
        </header>

        {data.plans.length === 0 ? (
          <p className={styles.empty}>No access plans yet.</p>
        ) : (
          <ul className={styles.planList}>
            {data.plans.map((plan) => {
              const editable = planCanBeEdited(plan, data.resources);
              return (
                <li className={styles.planRow} key={plan.id}>
                  <div className={styles.rowPrimary}>
                    <div className={styles.titleLine}>
                      <strong>{plan.name}</strong>
                      <span className={styles.state} data-state={plan.state}>
                        {plan.state}
                      </span>
                    </div>
                    <span className={styles.meta}>
                      {plan.items.length} resource
                      {plan.items.length === 1 ? "" : "s"} · revision{" "}
                      {plan.revision}
                      {plan.definitionLocked ? " · definition locked" : ""}
                    </span>
                    {plan.description ? <p>{plan.description}</p> : null}
                    <ul
                      className={styles.inlineList}
                      aria-label="Plan resources"
                    >
                      {plan.items.map((item) => (
                        <li key={item.id}>
                          {item.href ? (
                            <Link href={item.href}>{item.title}</Link>
                          ) : (
                            item.title
                          )}{" "}
                          <span className={styles.meta}>
                            {item.actions.join(", ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={working || !editable}
                      onClick={() => editPlan(plan)}
                    >
                      Edit
                    </button>
                    {plan.state === "active" ? (
                      <button
                        className="text-link"
                        type="button"
                        disabled={working}
                        onClick={() => archivePlan(plan)}
                      >
                        Archive
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="plan-editor-title">
        <header className={styles.heading}>
          <p className="eyebrow">{editingPlanId ? "Edit" : "Create"}</p>
          <h2 id="plan-editor-title">
            {editingPlanId ? "Edit access plan" : "New access plan"}
          </h2>
          <p>
            Finite-use credits join this same definition in the commerce
            milestone. Current grants remain open-use until then.
          </p>
        </header>

        <form className={styles.form} onSubmit={savePlan}>
          <div className={styles.fieldGrid}>
            <label>
              <span>Name</span>
              <input
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              <span>Slug</span>
              <input
                required
                maxLength={80}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                disabled={editingPlanId !== null}
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
              />
            </label>
          </div>
          <label>
            <span>Description</span>
            <textarea
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <fieldset className={styles.resources}>
            <legend>Published resources and actions</legend>
            {data.resources.length === 0 ? (
              <p className={styles.empty}>
                Publish a current track, release, collection, or Course before
                creating an access plan.
              </p>
            ) : (
              data.resources.map((resource) => {
                const key = resourceKey(resource);
                const selected = selectedByKey.get(key);
                return (
                  <div className={styles.resourceRow} key={key}>
                    <label className={styles.resourceChoice}>
                      <input
                        type="checkbox"
                        checked={selected !== undefined}
                        onChange={(event) =>
                          toggleResource(resource, event.target.checked)
                        }
                      />
                      <span>
                        <strong>{resource.title}</strong>
                        <small>{resource.resourceType}</small>
                      </span>
                    </label>
                    {selected ? (
                      <div className={styles.actionChoices}>
                        {resource.allowedActions.map((action) => (
                          <label key={action}>
                            <input
                              type="checkbox"
                              checked={selected.actions.includes(action)}
                              onChange={(event) =>
                                toggleAction(
                                  resource,
                                  action,
                                  event.target.checked,
                                )
                              }
                            />
                            <span>{ACTION_LABELS[action]}</span>
                          </label>
                        ))}
                        {selected.actions.includes("download") ? (
                          <label>
                            <span>Delivery</span>
                            <select
                              value={
                                selected.downloadDisposition ?? "attachment"
                              }
                              onChange={(event) =>
                                setDisposition(
                                  key,
                                  event.target
                                    .value as AccessDownloadDisposition,
                                )
                              }
                            >
                              <option value="attachment">Download</option>
                              <option value="inline">Open in browser</option>
                            </select>
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </fieldset>

          <div className={styles.actions}>
            <button
              className="button button-primary"
              type="submit"
              disabled={working || data.resources.length === 0}
            >
              {editingPlanId ? "Save plan" : "Create plan"}
            </button>
            {editingPlanId ? (
              <button
                className="button button-secondary"
                type="button"
                disabled={working}
                onClick={resetPlanEditor}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="issue-access-title">
        <header className={styles.heading}>
          <p className="eyebrow">Customer relationship</p>
          <h2 id="issue-access-title">Issue access</h2>
          <p>
            Issuance creates one exact grant and entitlement for every resource
            in the selected plan.
          </p>
        </header>
        <form className={styles.form} onSubmit={issuePlan}>
          <div className={styles.fieldGrid}>
            <label>
              <span>Access plan</span>
              <select
                required
                value={issuePlanId}
                onChange={(event) => setIssuePlanId(event.target.value)}
              >
                <option value="">Choose a plan</option>
                {activePlans.map((plan) => (
                  <option value={plan.id} key={plan.id}>
                    {plan.name} · revision {plan.revision}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Customer</span>
              <select
                required
                value={issueCustomerId}
                onChange={(event) => setIssueCustomerId(event.target.value)}
              >
                <option value="">Choose a customer</option>
                {data.customers.map((customer) => (
                  <option value={customer.userId} key={customer.userId}>
                    {customer.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Starts</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </label>
            <label>
              <span>Expires</span>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </label>
          </div>
          <label>
            <span>Reason</span>
            <textarea
              maxLength={1000}
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            className="button button-primary"
            type="submit"
            disabled={
              working || activePlans.length === 0 || data.customers.length === 0
            }
          >
            Issue access
          </button>
        </form>
      </section>

      <section className={styles.section} aria-labelledby="grant-history-title">
        <header className={styles.heading}>
          <p className="eyebrow">Authority</p>
          <h2 id="grant-history-title">Grant history</h2>
          <p>
            Revocation and expiration update the set, every child grant, and
            every linked entitlement in one operation.
          </p>
        </header>
        {data.grantSets.length === 0 ? (
          <p className={styles.empty}>No access has been issued.</p>
        ) : (
          <ul className={styles.planList}>
            {data.grantSets.map((grant) => (
              <li className={styles.planRow} key={grant.id}>
                <div className={styles.rowPrimary}>
                  <div className={styles.titleLine}>
                    <strong>{grant.customerDisplayName}</strong>
                    <span className={styles.state} data-state={grant.state}>
                      {grant.state}
                    </span>
                  </div>
                  <span className={styles.meta}>
                    {grant.accessPlanName} · plan revision{" "}
                    {grant.accessPlanRevision}
                    {" · "}
                    {grant.entitlementCount} entitlement
                    {grant.entitlementCount === 1 ? "" : "s"}
                  </span>
                  <span className={styles.meta}>
                    Starts {dateLabel(grant.startsAt)} · expires{" "}
                    {dateLabel(grant.expiresAt)}
                  </span>
                  {grant.reason ? <p>{grant.reason}</p> : null}
                </div>
                {grant.state === "active" ? (
                  <div className={styles.rowActions}>
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={working}
                      onClick={() =>
                        transitionGrant(grant.id, grant.revision, "revoke")
                      }
                    >
                      Revoke
                    </button>
                    <button
                      className="text-link"
                      type="button"
                      disabled={working}
                      onClick={() =>
                        transitionGrant(grant.id, grant.revision, "expire")
                      }
                    >
                      Mark expired
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="deliveries-title">
        <header className={styles.heading}>
          <p className="eyebrow">Operational evidence</p>
          <h2 id="deliveries-title">Recent protected delivery</h2>
          <p>
            The latest successful deliveries show customer, resource, access
            source, byte count, and completion time. Request and storage details
            remain server-private.
          </p>
        </header>
        {data.recentDeliveries.length === 0 ? (
          <p className={styles.empty}>No completed deliveries yet.</p>
        ) : (
          <ul className={styles.deliveryList}>
            {data.recentDeliveries.map((delivery) => (
              <li key={delivery.id}>
                <strong>{delivery.resourceTitle}</strong>
                <span>
                  {delivery.customerDisplayName ?? "Public visitor"} ·{" "}
                  {delivery.accessSource}
                </span>
                <span>
                  {byteLabel(delivery.byteLength)} ·{" "}
                  {dateLabel(delivery.deliveredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
