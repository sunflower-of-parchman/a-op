"use client";

import { useState, type FormEvent } from "react";
import { MODULE_REGISTRY, type ModuleKey } from "@/lib/modules/index.ts";

interface ArtistFields {
  displayName: string;
  siteTitle: string;
  headline: string;
  introduction: string;
  footerText: string;
}

interface ModuleState {
  moduleKey: ModuleKey;
  active: boolean;
}

interface NavigationItemState {
  itemKey: string;
  label: string;
  href: string;
  position: number;
  moduleKey: ModuleKey | null;
  external: boolean;
}

interface NavigationState {
  revision: number;
  items: readonly NavigationItemState[];
}

export interface ArtistWorkspaceProps {
  readonly artist: ArtistFields & { readonly version: number };
  readonly modules: readonly ModuleState[];
  readonly navigation: {
    readonly primary: NavigationState;
    readonly footer: NavigationState;
  };
}

interface ApiErrorBody {
  error?: { message?: string };
}

async function mutate<T>(
  url: string,
  method: "POST" | "PUT",
  input: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as T & ApiErrorBody;
  if (!response.ok) {
    throw new Error(body.error?.message ?? "The change could not be saved.");
  }
  return body;
}

function resultMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The change could not be saved.";
}

function reindex(items: readonly NavigationItemState[]): NavigationItemState[] {
  return items.map((item, position) => ({ ...item, position }));
}

export function ArtistWorkspace({
  artist: initialArtist,
  modules,
  navigation,
}: ArtistWorkspaceProps) {
  const [artist, setArtist] = useState<ArtistFields>(initialArtist);
  const [artistVersion, setArtistVersion] = useState(initialArtist.version);
  const [activeModules, setActiveModules] = useState<readonly ModuleKey[]>(
    modules.filter(({ active }) => active).map(({ moduleKey }) => moduleKey),
  );
  const [savedActiveModules, setSavedActiveModules] = useState<
    readonly ModuleKey[]
  >(modules.filter(({ active }) => active).map(({ moduleKey }) => moduleKey));
  const [primaryItems, setPrimaryItems] = useState<NavigationItemState[]>(
    reindex(navigation.primary.items),
  );
  const [footerItems, setFooterItems] = useState<NavigationItemState[]>(
    reindex(navigation.footer.items),
  );
  const [navigationRevisions, setNavigationRevisions] = useState({
    primary: navigation.primary.revision,
    footer: navigation.footer.revision,
  });
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  function updateArtist(field: keyof ArtistFields, value: string) {
    setArtist((current) => ({ ...current, [field]: value }));
  }

  async function saveArtist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("Saving artist draft…");
    try {
      const body = await mutate<{
        result: { version: number };
      }>("/api/admin/artist", "PUT", {
        artist,
        expectedVersion: artistVersion,
      });
      setArtistVersion(body.result.version);
      setMessage("Artist draft saved. The published site is unchanged.");
    } catch (error) {
      setMessage(resultMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function publishArtist() {
    setWorking(true);
    setMessage("Publishing artist draft…");
    try {
      const body = await mutate<{ result: { version: number } }>(
        "/api/admin/artist/publish",
        "POST",
        { expectedVersion: artistVersion },
      );
      setArtistVersion(body.result.version);
      setMessage("Artist material published.");
    } catch (error) {
      setMessage(resultMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function saveModules() {
    setWorking(true);
    setMessage("Applying module state…");
    const active = new Set(activeModules);
    const saved = new Set(savedActiveModules);
    try {
      const body = await mutate<{
        result: { activeModules: readonly ModuleKey[] };
      }>("/api/admin/modules", "PUT", {
        activate: activeModules.filter((key) => !saved.has(key)),
        deactivate: savedActiveModules.filter((key) => !active.has(key)),
      });
      setActiveModules(body.result.activeModules);
      setSavedActiveModules(body.result.activeModules);
      setMessage("Module state saved. Durable module records were preserved.");
    } catch (error) {
      setMessage(resultMessage(error));
    } finally {
      setWorking(false);
    }
  }

  function updateNavigationItem(
    setId: "primary" | "footer",
    itemKey: string,
    field: "label" | "href" | "moduleKey",
    value: string,
  ) {
    const setter = setId === "primary" ? setPrimaryItems : setFooterItems;
    setter((current) =>
      current.map((item) =>
        item.itemKey === itemKey
          ? {
              ...item,
              [field]:
                field === "moduleKey"
                  ? value === ""
                    ? null
                    : (value as ModuleKey)
                  : value,
            }
          : item,
      ),
    );
  }

  function addNavigationItem(setId: "primary" | "footer") {
    const setter = setId === "primary" ? setPrimaryItems : setFooterItems;
    setter((current) =>
      reindex([
        ...current,
        {
          itemKey: `custom-${crypto.randomUUID()}`,
          label: "New link",
          href: "/about",
          position: current.length,
          moduleKey: null,
          external: false,
        },
      ]),
    );
  }

  function removeNavigationItem(setId: "primary" | "footer", itemKey: string) {
    const setter = setId === "primary" ? setPrimaryItems : setFooterItems;
    setter((current) =>
      reindex(current.filter((item) => item.itemKey !== itemKey)),
    );
  }

  async function saveNavigation() {
    setWorking(true);
    setMessage("Saving navigation draft…");
    try {
      const body = await mutate<{
        result: {
          primary: { revision: number };
          footer: { revision: number };
        };
      }>("/api/admin/navigation", "PUT", {
        expectedRevisions: navigationRevisions,
        navigation: [
          { id: "primary", items: reindex(primaryItems) },
          { id: "footer", items: reindex(footerItems) },
        ],
      });
      setNavigationRevisions({
        primary: body.result.primary.revision,
        footer: body.result.footer.revision,
      });
      setMessage("Navigation draft saved. Public navigation is unchanged.");
    } catch (error) {
      setMessage(resultMessage(error));
    } finally {
      setWorking(false);
    }
  }

  async function publishNavigation() {
    setWorking(true);
    setMessage("Publishing navigation…");
    try {
      const body = await mutate<{
        result: {
          primary: { revision: number };
          footer: { revision: number };
        };
      }>("/api/admin/navigation/publish", "POST", {
        expectedRevisions: navigationRevisions,
      });
      setNavigationRevisions({
        primary: body.result.primary.revision,
        footer: body.result.footer.revision,
      });
      setMessage("Navigation published. Inactive module links remain hidden.");
    } catch (error) {
      setMessage(resultMessage(error));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="admin-workspace">
      <p className="operation-message" aria-live="polite" role="status">
        {message}
      </p>

      <section
        className="workspace-section"
        aria-labelledby="artist-material-title"
      >
        <header className="workspace-section-heading">
          <p className="eyebrow">Published identity</p>
          <h2 id="artist-material-title">Artist material</h2>
          <p>
            Save a private draft, then publish it when the wording is ready.
          </p>
        </header>
        <form className="working-form" onSubmit={saveArtist}>
          <div className="field-grid">
            <label className="field-group">
              <span>Artist name</span>
              <input
                maxLength={120}
                onChange={(event) =>
                  updateArtist("displayName", event.target.value)
                }
                required
                value={artist.displayName}
              />
            </label>
            <label className="field-group">
              <span>Site title</span>
              <input
                maxLength={120}
                onChange={(event) =>
                  updateArtist("siteTitle", event.target.value)
                }
                required
                value={artist.siteTitle}
              />
            </label>
          </div>
          <label className="field-group">
            <span>Headline</span>
            <input
              maxLength={240}
              onChange={(event) => updateArtist("headline", event.target.value)}
              value={artist.headline}
            />
          </label>
          <label className="field-group">
            <span>Introduction</span>
            <textarea
              maxLength={2000}
              onChange={(event) =>
                updateArtist("introduction", event.target.value)
              }
              rows={4}
              value={artist.introduction}
            />
          </label>
          <label className="field-group">
            <span>Footer statement</span>
            <textarea
              maxLength={1000}
              onChange={(event) =>
                updateArtist("footerText", event.target.value)
              }
              rows={3}
              value={artist.footerText}
            />
          </label>
          <div className="working-form__actions">
            <button
              className="button button-primary"
              disabled={working}
              type="submit"
            >
              Save draft
            </button>
            <button
              className="button button-secondary"
              disabled={working}
              onClick={publishArtist}
              type="button"
            >
              Publish artist material
            </button>
          </div>
        </form>
      </section>

      <section className="workspace-section" aria-labelledby="modules-title">
        <header className="workspace-section-heading">
          <p className="eyebrow">Capability registry</p>
          <h2 id="modules-title">Optional modules</h2>
          <p>
            Music, streaming, identity, access, and administration stay active.
          </p>
        </header>
        <div className="toggle-list">
          {MODULE_REGISTRY.map((definition) => (
            <label key={definition.key} className="toggle-row">
              <input
                checked={activeModules.includes(definition.key)}
                onChange={(event) =>
                  setActiveModules((current) =>
                    event.target.checked
                      ? [...current, definition.key]
                      : current.filter((key) => key !== definition.key),
                  )
                }
                type="checkbox"
              />
              <span>
                <strong>{definition.label}</strong>
                {definition.requires.length > 0
                  ? ` Requires ${definition.requires.join(", ")}.`
                  : ""}
              </span>
            </label>
          ))}
        </div>
        <button
          className="button button-primary"
          disabled={working}
          onClick={saveModules}
          type="button"
        >
          Apply module state
        </button>
      </section>

      <section className="workspace-section" aria-labelledby="navigation-title">
        <header className="workspace-section-heading">
          <p className="eyebrow">Published structure</p>
          <h2 id="navigation-title">Navigation</h2>
          <p>Module-linked items remain stored and appear only while active.</p>
        </header>
        {(
          [
            ["primary", "Primary navigation", primaryItems],
            ["footer", "Footer navigation", footerItems],
          ] as const
        ).map(([setId, label, items]) => (
          <div className="navigation-editor" key={setId}>
            <h3>{label}</h3>
            {items.map((item) => (
              <div className="navigation-editor__row" key={item.itemKey}>
                <label className="field-group">
                  <span>Label</span>
                  <input
                    maxLength={80}
                    onChange={(event) =>
                      updateNavigationItem(
                        setId,
                        item.itemKey,
                        "label",
                        event.target.value,
                      )
                    }
                    value={item.label}
                  />
                </label>
                <label className="field-group">
                  <span>Path</span>
                  <input
                    maxLength={2048}
                    onChange={(event) =>
                      updateNavigationItem(
                        setId,
                        item.itemKey,
                        "href",
                        event.target.value,
                      )
                    }
                    value={item.href}
                  />
                </label>
                <label className="field-group">
                  <span>Module</span>
                  <select
                    onChange={(event) =>
                      updateNavigationItem(
                        setId,
                        item.itemKey,
                        "moduleKey",
                        event.target.value,
                      )
                    }
                    value={item.moduleKey ?? ""}
                  >
                    <option value="">Always active</option>
                    {MODULE_REGISTRY.map(({ key, label: moduleLabel }) => (
                      <option key={key} value={key}>
                        {moduleLabel}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button button-secondary"
                  disabled={setId === "primary" && item.href === "/music"}
                  onClick={() => removeNavigationItem(setId, item.itemKey)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="text-button"
              onClick={() => addNavigationItem(setId)}
              type="button"
            >
              Add link
            </button>
          </div>
        ))}
        <div className="working-form__actions">
          <button
            className="button button-primary"
            disabled={working}
            onClick={saveNavigation}
            type="button"
          >
            Save navigation draft
          </button>
          <button
            className="button button-secondary"
            disabled={working}
            onClick={publishNavigation}
            type="button"
          >
            Publish navigation
          </button>
        </div>
      </section>
    </div>
  );
}
