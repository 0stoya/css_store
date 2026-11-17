import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import loadTypeScript from "./helpers/load-typescript.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

class NextRedirect extends Error {
  constructor(location) {
    super("Next redirect");
    this.location = location;
  }
}

// Execute the *real* Magento GraphQL client against an isolated fake HTTP
// response. The redirect is a throwing Next.js stand-in, so any accidental
// cookie-clearing/session-expired navigation makes the test fail.
function clientFor(response) {
  const source = readFileSync(new URL("../lib/magento/client.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: "lib/magento/client.ts",
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const diagnostics = (javascript.diagnostics || []).filter(
    (d) => d.category === ts.DiagnosticCategory.Error
  );
  assert.equal(diagnostics.length, 0);

  const mod = { exports: {} };
  vm.runInNewContext(javascript.outputText, {
    module: mod,
    exports: mod.exports,
    require: (name) => {
      if (name === "next/navigation") {
        return { redirect: (location) => { throw new NextRedirect(location); } };
      }
      if (name === "@/lib/config") {
        return { getMagentoConfig: () => ({
          graphqlUrl: "https://magento.example.invalid/graphql",
          storeCode: "default",
        }) };
      }
      throw new Error("Unmocked dependency: " + name);
    },
    fetch: async () => response,
    AbortSignal,
    Date,
    Error,
    process: { env: {} },
    console,
  }, { filename: "lib/magento/client.ts" });
  return mod.exports;
}

function graphqlResponse(status, message, category = "graphql-authorization") {
  return new Response(JSON.stringify({
    errors: [{ message, extensions: { category } }],
  }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function probe(response, scope = "PO") {
  const client = clientFor(response);
  const creditOrders = loadTypeScript(root, "lib/magento/credit-orders.ts", {
    "@/lib/magento/client": client,
  });
  return creditOrders.canUseCreditOrderScope("valid-manager-token", scope);
}

test("HTTP 403 for missing Enter PO Numbers is a permission denial, not logout", async () => {
  const allowed = await probe(graphqlResponse(
    403, "You are not authorized to enter PO Numbers."
  ));
  assert.equal(allowed, false);
});

test("HTTP 403 for missing Approve/Reject is a permission denial, not logout", async () => {
  const allowed = await probe(graphqlResponse(
    403, "You are not authorized to approve and reject credit orders."
  ), "APPROVAL");
  assert.equal(allowed, false);
});

test("HTTP 200 graphql-authorization is also a missing scope permission", async () => {
  const allowed = await probe(graphqlResponse(
    200, "You are not authorized to enter PO Numbers."
  ));
  assert.equal(allowed, false);
});

test("authorized scope probes remain enabled", async () => {
  const allowed = await probe(new Response(
    JSON.stringify({ data: { css_credit_orders: { total_count: 0 } } }),
    { status: 200, headers: { "content-type": "application/json" } }
  ));
  assert.equal(allowed, true);
});

test("explicit invalid-customer 403 still triggers session-expired redirect", async () => {
  await assert.rejects(
    () => probe(graphqlResponse(403, "The current customer isn't authorized.")),
    (error) => error instanceof NextRedirect && error.location === "/api/auth/session-expired"
  );
});

test("HTTP 401 still triggers session-expired redirect", async () => {
  await assert.rejects(
    () => probe(graphqlResponse(401, "Unauthenticated", "graphql-authentication")),
    (error) => error instanceof NextRedirect && error.location === "/api/auth/session-expired"
  );
});

test("explicit authentication-category 403 still triggers logout", async () => {
  await assert.rejects(
    () => probe(graphqlResponse(403, "The customer token has expired.", "graphql-authentication")),
    (error) => error instanceof NextRedirect && error.location === "/api/auth/session-expired"
  );
});

test("non-GraphQL 403 remains an HTTP failure, not a cookie-clearing redirect", async () => {
  await assert.rejects(
    () => probe(new Response("Forbidden", { status: 403 })),
    (error) => error.name === "MagentoGraphQLError" && error.status === 403
  );
});

test("an unrelated GraphQL input error on 403 is NOT silently hidden as no access", async () => {
  await assert.rejects(
    () => probe(graphqlResponse(403, "The requested page size is invalid.", "graphql-input")),
    (error) => error.name === "MagentoGraphQLError"
      && error.category === "graphql-input"
      && error.status === 403
  );
});
