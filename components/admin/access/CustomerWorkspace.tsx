import Link from "next/link";
import type { AdminAccessOverviewDTO } from "@/lib/access-management/types.ts";
import styles from "./CustomerWorkspace.module.css";

export interface CustomerWorkspaceProps {
  readonly data: AdminAccessOverviewDTO;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function CustomerWorkspace({ data }: CustomerWorkspaceProps) {
  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <p className="eyebrow">Customer relationships</p>
        <h2>Customers</h2>
        <p>
          Active customer identities, durable access history, and completed
          delivery evidence remain joined to the same account record.
        </p>
      </header>

      {data.customers.length === 0 ? (
        <p className={styles.empty}>
          Customer accounts appear after a signed-in visitor activates their
          account.
        </p>
      ) : (
        <ul className={styles.customers}>
          {data.customers.map((customer) => {
            const grants = data.grantSets.filter(
              ({ customerUserId }) => customerUserId === customer.userId,
            );
            const deliveries = data.recentDeliveries.filter(
              ({ customerUserId }) => customerUserId === customer.userId,
            );
            return (
              <li key={customer.userId}>
                <div className={styles.identity}>
                  <strong>{customer.displayName}</strong>
                  <span>{customer.email}</span>
                  <Link
                    className="text-link"
                    href={`/admin/customers/${encodeURIComponent(customer.userId)}`}
                  >
                    View relationship
                  </Link>
                </div>
                <dl className={styles.facts}>
                  <div>
                    <dt>Active access</dt>
                    <dd>{customer.activeGrantSetCount}</dd>
                  </div>
                  <div>
                    <dt>Total grants</dt>
                    <dd>{customer.totalGrantSetCount}</dd>
                  </div>
                  <div>
                    <dt>Recent deliveries</dt>
                    <dd>{deliveries.length}</dd>
                  </div>
                </dl>
                {grants.length > 0 ? (
                  <ul className={styles.history} aria-label="Access history">
                    {grants.map((grant) => (
                      <li key={grant.id}>
                        <span>{grant.accessPlanName}</span>
                        <span data-state={grant.state}>{grant.state}</span>
                        <span>{dateLabel(grant.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.meta}>No access has been issued.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Link className="button button-primary" href="/admin/access">
        Manage access
      </Link>
    </div>
  );
}
