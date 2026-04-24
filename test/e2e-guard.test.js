import { test } from "node:test";
import assert from "node:assert";
import {
  isE2EMode,
  assertE2EAllowed,
  filterToSandbox,
  GUARDED_COMMANDS,
} from "../lib/e2e-guard.js";
import * as commands from "../lib/commands.js";

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  const restore = () => {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  };
  let result;
  try {
    result = fn();
  } catch (err) {
    restore();
    throw err;
  }
  if (result && typeof result.then === "function") {
    return result.then(
      (v) => { restore(); return v; },
      (err) => { restore(); throw err; },
    );
  }
  restore();
  return result;
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

// Minimal fake page: every method returns something that lets the guard
// check throw first. The guard runs before any page interaction, so these
// stubs should never actually be exercised in these negative tests.
function makeFakePage() {
  const stub = new Proxy(() => stub, {
    get: () => stub,
    apply: () => stub,
  });
  return stub;
}

test("every name in GUARDED_COMMANDS corresponds to an exported chat-guarded function", () => {
  for (const name of GUARDED_COMMANDS) {
    assert.strictEqual(typeof commands[name], "function", `commands.${name} should be a function`);
  }
});

test("each guarded command throws under GREENTAP_E2E=1 with a non-sandbox chat", async () => {
  await withEnv({ GREENTAP_E2E: "1", GREENTAP_E2E_CHAT: undefined }, async () => {
    const page = makeFakePage();
    for (const name of GUARDED_COMMANDS) {
      await assert.rejects(
        () => commands[name](page, "not-the-sandbox"),
        /E2E mode: chat 'not-the-sandbox' not allowed/,
        `commands.${name} must call assertE2EAllowed before touching the page`,
      );
    }
  });
});

test("chats/unread return only sandbox row in E2E mode", async () => {
  // These commands build output from aria snapshots, which would normally
  // hit the page. We verify the filter semantic via a direct call to
  // filterToSandbox — the enforcement that commands.chats / commands.unread
  // actually pipe through filterToSandbox is covered by the integration
  // stage in e2e runE2E (Task 3).
  // (Reinforces the filter contract documented in the spec.)
  withEnv({ GREENTAP_E2E: "1" }, () => {
    const rows = [{ name: "alice" }, { name: "greentap-sandbox" }];
    const out = filterToSandbox(rows);
    assert.deepStrictEqual(out, [{ name: "greentap-sandbox" }]);
  });
});
