"use client";

import { useState, type FormEvent } from "react";
import {
  EDITOR_PERMISSION_KEYS,
  type EditorPermissionKey,
} from "@/lib/auth/editor-permissions.ts";

interface EditorPermissionView {
  permissionKey: EditorPermissionKey;
  scopeId: string;
}

interface EditorView {
  userId: string;
  email: string;
  displayName: string;
  permissions: readonly EditorPermissionView[];
}

export interface EditorWorkspaceProps {
  readonly initialEditors: readonly EditorView[];
}

interface EditorApiBody {
  result?: {
    userId: string;
    scopeId?: string;
  };
  error?: { message?: string };
}

async function editorMutation(
  url: string,
  method: "POST" | "DELETE",
  body: unknown,
): Promise<EditorApiBody> {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as EditorApiBody;
  if (!response.ok) {
    throw new Error(
      result.error?.message ?? "The editor change could not be saved.",
    );
  }
  return result;
}

export function EditorWorkspace({ initialEditors }: EditorWorkspaceProps) {
  const [editors, setEditors] = useState<readonly EditorView[]>(initialEditors);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [permissionKey, setPermissionKey] =
    useState<EditorPermissionKey>("pages.write");
  const [scopeId, setScopeId] = useState("*");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("Assigning editor…");
    try {
      const result = await editorMutation("/api/admin/editors", "POST", {
        editor: {
          email,
          displayName,
          permissionKey,
          scopeId,
        },
      });
      if (result.result) {
        const granted = result.result;
        setEditors((current) => {
          const remaining = current.filter(
            ({ userId }) => userId !== granted.userId,
          );
          return [
            ...remaining,
            {
              userId: granted.userId,
              email,
              displayName,
              permissions: [
                {
                  permissionKey,
                  scopeId: granted.scopeId ?? scopeId,
                },
              ],
            },
          ];
        });
      }
      setEmail("");
      setDisplayName("");
      setScopeId("*");
      setMessage("Editor assignment saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The editor assignment could not be saved.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function revoke(userId: string) {
    setWorking(true);
    setMessage("Removing editor authority…");
    try {
      await editorMutation(`/api/admin/editors/${userId}`, "DELETE", {});
      setEditors((current) =>
        current.filter((editor) => editor.userId !== userId),
      );
      setMessage("Editor authority removed. Customer state was preserved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The editor could not be removed.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="admin-workspace">
      <header className="workspace-section-heading">
        <p className="eyebrow">Server-owned authority</p>
        <h2>Editors</h2>
        <p>
          An editor needs both an active editor role and an assigned content
          scope.
        </p>
      </header>
      <p className="operation-message" aria-live="polite" role="status">
        {message}
      </p>
      <form className="working-form" onSubmit={grant}>
        <div className="field-grid">
          <label className="field-group">
            <span>Email</span>
            <input
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="field-group">
            <span>Display name</span>
            <input
              maxLength={120}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              value={displayName}
            />
          </label>
          <label className="field-group">
            <span>Permission</span>
            <select
              onChange={(event) =>
                setPermissionKey(event.target.value as EditorPermissionKey)
              }
              value={permissionKey}
            >
              {EDITOR_PERMISSION_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <label className="field-group">
            <span>Content scope</span>
            <input
              aria-describedby="scope-help"
              maxLength={80}
              onChange={(event) => setScopeId(event.target.value.toLowerCase())}
              required
              value={scopeId}
            />
            <small id="scope-help">
              Use * for every item in this permission or one content slug.
            </small>
          </label>
        </div>
        <button
          className="button button-primary"
          disabled={working}
          type="submit"
        >
          Assign editor
        </button>
      </form>
      <div className="admin-row-list">
        {editors.map((editor) => (
          <article className="admin-row" key={editor.userId}>
            <div>
              <h3>{editor.displayName}</h3>
              <p>{editor.email}</p>
              <p>
                Assignments:{" "}
                {editor.permissions
                  .map(
                    ({ permissionKey: key, scopeId: scope }) =>
                      `${key} (${scope})`,
                  )
                  .join(", ") || "None"}
              </p>
            </div>
            <button
              className="button button-secondary"
              disabled={working}
              onClick={() => revoke(editor.userId)}
              type="button"
            >
              Remove editor
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
