import { test } from "node:test";
import assert from "node:assert";
import {
  isE2EMode,
  assertE2EAllowed,
  filterToSandbox,
  GUARDED_COMMANDS,
} from "../lib/e2e-guard.js";

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try { return fn(); } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("isE2EMode returns false when GREENTAP_E2E unset", () => {
  withEnv({ GREENTAP_E2E: undefined }, () => {
    assert.strictEqual(isE2EMode(), false);
  });
});

test("isE2EMode returns true only for exact '1'", () => {
  withEnv({ GREENTAP_E2E: "1" }, () => assert.strictEqual(isE2EMode(), true));
  withEnv({ GREENTAP_E2E: "true" }, () => assert.strictEqual(isE2EMode(), false));
  withEnv({ GREENTAP_E2E: "" }, () => assert.strictEqual(isE2EMode(), false));
});

test("assertE2EAllowed is a no-op outside E2E mode", () => {
  withEnv({ GREENTAP_E2E: undefined }, () => {
    assert.doesNotThrow(() => assertE2EAllowed("any-chat"));
  });
});

test("assertE2EAllowed throws when chat does not match sandbox default", () => {
  withEnv({ GREENTAP_E2E: "1", GREENTAP_E2E_CHAT: undefined }, () => {
    assert.throws(
      () => assertE2EAllowed("random-chat"),
      /E2E mode: chat 'random-chat' not allowed; only 'greentap-sandbox'/,
    );
  });
});

test("assertE2EAllowed passes when chat equals sandbox default", () => {
  withEnv({ GREENTAP_E2E: "1", GREENTAP_E2E_CHAT: undefined }, () => {
    assert.doesNotThrow(() => assertE2EAllowed("greentap-sandbox"));
  });
});

test("assertE2EAllowed respects GREENTAP_E2E_CHAT override", () => {
  withEnv({ GREENTAP_E2E: "1", GREENTAP_E2E_CHAT: "my-sandbox" }, () => {
    assert.throws(() => assertE2EAllowed("greentap-sandbox"));
    assert.doesNotThrow(() => assertE2EAllowed("my-sandbox"));
  });
});

test("filterToSandbox is identity outside E2E mode", () => {
  withEnv({ GREENTAP_E2E: undefined }, () => {
    const rows = [{ name: "a" }, { name: "b" }];
    assert.deepStrictEqual(filterToSandbox(rows, "name"), rows);
  });
});

test("filterToSandbox keeps only sandbox row in E2E mode", () => {
  withEnv({ GREENTAP_E2E: "1", GREENTAP_E2E_CHAT: undefined }, () => {
    const rows = [{ name: "other" }, { name: "greentap-sandbox" }, { name: "x" }];
    assert.deepStrictEqual(filterToSandbox(rows, "name"), [{ name: "greentap-sandbox" }]);
  });
});

test("GUARDED_COMMANDS is a non-empty array of strings and includes known commands", () => {
  assert.ok(Array.isArray(GUARDED_COMMANDS));
  assert.ok(GUARDED_COMMANDS.length >= 4);
  for (const n of ["navigateToChat", "read", "send", "pollResults"]) {
    assert.ok(GUARDED_COMMANDS.includes(n), `missing ${n}`);
  }
});
