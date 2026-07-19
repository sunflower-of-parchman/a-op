import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const vinextBinary = resolve(projectRoot, "node_modules/.bin/vinext");
const port = Number(process.env.AOP_RUNTIME_VERIFY_PORT ?? 3217);
const baseUrl = `http://localhost:${port}`;
const proofValue = "runtime-restart-proof";

if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error("AOP_RUNTIME_VERIFY_PORT must be a safe unprivileged port.");
}

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function startServer({ runtimeLab }) {
  const environment = { ...process.env };
  if (runtimeLab) {
    environment.AOP_ENABLE_RUNTIME_LAB = "1";
  } else {
    delete environment.AOP_ENABLE_RUNTIME_LAB;
  }
  environment.WRANGLER_LOG_PATH = ".wrangler/wrangler.log";

  const child = spawn(
    vinextBinary,
    ["dev", "--host", "localhost", "--port", String(port), "--strictPort"],
    {
      cwd: projectRoot,
      env: environment,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.resume();
  child.stderr.resume();

  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error("The local Sites verification server exited early.");
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status === 200) return child;
    } catch {
      // The server has not finished opening its strict verification port yet.
    }

    await delay(100);
  }

  await stopServer(child);
  throw new Error("The local Sites verification server did not become ready.");
}

async function stopServer(child) {
  if (child.exitCode !== null) return;

  const exited = once(child, "exit");
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }

  const completed = await Promise.race([
    exited.then(() => true),
    delay(5_000).then(() => false),
  ]);

  if (!completed && child.exitCode === null) {
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await once(child, "exit");
  }
}

async function expectResponse(path, expectedStatus, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(
    response.status,
    expectedStatus,
    `${init?.method ?? "GET"} ${path} returned ${response.status}`,
  );
  return response;
}

async function exerciseRuntimeLab() {
  const anonymousAccount = await expectResponse("/account", 307, {
    redirect: "manual",
  });
  const signInLocation = anonymousAccount.headers.get("location");
  assert.ok(signInLocation);
  const signInUrl = new URL(signInLocation, baseUrl);
  assert.equal(signInUrl.origin, baseUrl);
  assert.equal(signInUrl.pathname, "/signin-with-chatgpt");
  assert.equal(signInUrl.searchParams.get("return_to"), "/account");

  const anonymousHome = await expectResponse("/", 200);
  assert.match(
    anonymousHome.headers.get("content-security-policy") ?? "",
    /default-src 'self'/,
  );
  assert.match(
    anonymousHome.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
  assert.equal(anonymousHome.headers.get("cache-control"), "private, no-store");
  assert.equal(anonymousHome.headers.get("x-content-type-options"), "nosniff");
  assert.equal(anonymousHome.headers.get("x-frame-options"), "DENY");
  assert.match(
    anonymousHome.headers.get("permissions-policy") ?? "",
    /payment=\(\)/,
  );
  assert.equal((await anonymousHome.text()).includes(">Sign in</a>"), true);

  for (const role of ["customer", "editor", "owner"]) {
    const fixtureEmail = `${role}@a-op.invalid`;
    const identityHeaders = {
      "oai-authenticated-user-email": fixtureEmail,
      "oai-authenticated-user-full-name": encodeURIComponent(
        `Fictional ${role[0].toUpperCase()}${role.slice(1)}`,
      ),
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    };
    const account = await expectResponse("/account", 200, {
      headers: identityHeaders,
    });
    const accountHtml = (await account.text()).replaceAll("<!-- -->", "");
    assert.equal(
      accountHtml.includes(`active a-op role is ${role}`),
      true,
      `The ${role} account role was not rendered from D1.`,
    );
  }

  const authenticatedHome = await expectResponse("/", 200, {
    headers: { "oai-authenticated-user-email": "owner@a-op.invalid" },
  });
  assert.equal((await authenticatedHome.text()).includes(">Account</a>"), true);

  const proofResponse = await expectResponse("/api/runtime-lab/proof", 201, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: proofValue }),
  });
  const proofBody = await proofResponse.json();
  assert.equal(proofBody.proof.value, proofValue);
  assert.ok(proofBody.proof.revision >= 1);

  const createMedia = await expectResponse("/api/runtime-lab/media", 201, {
    method: "POST",
  });
  const mediaBody = await createMedia.json();
  assert.deepEqual(mediaBody.media, {
    id: "media_runtime-range",
    status: "ready",
    byteLength: 24,
    contentType: "text/plain; charset=utf-8",
  });

  const owner = await expectResponse("/api/runtime-lab/media?as=owner", 200);
  assert.equal(await owner.text(), "a-op runtime range proof");
  assert.equal(owner.headers.get("x-aop-access-source"), "role");

  const editor = await expectResponse("/api/runtime-lab/media?as=editor", 206, {
    headers: { range: "bytes=5-11" },
  });
  assert.equal(await editor.text(), "runtime");
  assert.equal(editor.headers.get("content-range"), "bytes 5-11/24");
  assert.equal(editor.headers.get("content-length"), "7");

  for (const persona of ["anonymous", "customer"]) {
    const denied = await expectResponse(
      `/api/runtime-lab/media?as=${persona}`,
      403,
    );
    const deniedBody = await denied.json();
    assert.equal(deniedBody.decision.allowed, false);
  }

  const unsatisfiable = await expectResponse(
    "/api/runtime-lab/media?as=owner",
    416,
    { headers: { range: "bytes=99-100" } },
  );
  assert.equal(unsatisfiable.headers.get("content-range"), "bytes */24");
  assert.equal(await unsatisfiable.text(), "");

  return {
    revision: proofBody.proof.revision,
    securityHeaders: "enforced",
    value: proofBody.proof.value,
  };
}

let server;
let restartProof;
let firstPassCompleted = false;

try {
  server = await startServer({ runtimeLab: true });
  restartProof = await exerciseRuntimeLab();
  firstPassCompleted = true;
} finally {
  if (server) {
    if (!firstPassCompleted) {
      try {
        await fetch(`${baseUrl}/api/runtime-lab/media`, {
          method: "DELETE",
          signal: AbortSignal.timeout(2_000),
        });
      } catch {
        // Cleanup remains best-effort if the server itself failed.
      }
    }
    await stopServer(server);
    server = undefined;
  }
}

try {
  server = await startServer({ runtimeLab: true });
  const persisted = await expectResponse("/api/runtime-lab/proof", 200);
  const persistedBody = await persisted.json();
  assert.equal(persistedBody.proof.value, restartProof.value);
  assert.equal(persistedBody.proof.revision, restartProof.revision);

  const persistedMedia = await expectResponse(
    "/api/runtime-lab/media?as=owner",
    206,
    { headers: { range: "bytes=5-11" } },
  );
  assert.equal(await persistedMedia.text(), "runtime");
  assert.equal(persistedMedia.headers.get("content-range"), "bytes 5-11/24");

  await expectResponse("/api/runtime-lab/media", 204, { method: "DELETE" });
  await expectResponse("/api/runtime-lab/media?as=owner", 404);
} finally {
  if (server) {
    try {
      await fetch(`${baseUrl}/api/runtime-lab/media`, {
        method: "DELETE",
        signal: AbortSignal.timeout(2_000),
      });
    } catch {
      // Cleanup remains best-effort if a restart assertion failed.
    }
    await stopServer(server);
    server = undefined;
  }
}

try {
  server = await startServer({ runtimeLab: false });
  await expectResponse("/api/runtime-lab/proof", 404);
  await expectResponse("/api/runtime-lab/media", 404, { method: "POST" });
} finally {
  if (server) await stopServer(server);
}

process.stdout.write(
  `${JSON.stringify({
    status: "passed",
    d1RestartRevision: restartProof.revision,
    mediaStatuses: [200, 206, 403, 404, 416],
    securityHeaders: restartProof.securityHeaders,
    runtimeLabDefault: "off",
    retainedVerificationObjects: 0,
  })}\n`,
);
