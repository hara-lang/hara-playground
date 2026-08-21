import { assertString, fail } from "./common.mjs";

const EXPECTED_TYPES = new Set(["boolean", "nil", "number", "string"]);
const EFFECT_STATUSES = new Set(["deferred", "not-required"]);

function expectedValue(label, expected) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    fail(label, "must be an object");
  }
  if (!EXPECTED_TYPES.has(expected.type)) {
    fail(`${label}.type`, `must be one of ${[...EXPECTED_TYPES].join(", ")}`);
  }
  const value = expected.value;
  if (expected.type === "nil") {
    if (value !== null) fail(`${label}.value`, "must be null for nil");
  } else if (typeof value !== expected.type) {
    fail(`${label}.value`, `must be a ${expected.type}`);
  }
  if (expected.type === "number" && !Number.isFinite(value)) {
    fail(`${label}.value`, "must be finite");
  }
  return Object.freeze({ type: expected.type, value });
}

export function validateRuntimeValidation(sample, label) {
  const plan = sample.runtimeValidation;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    fail(`${label}.runtimeValidation`, "must be an object");
  }
  if (plan.load !== "full-source") {
    fail(`${label}.runtimeValidation.load`, "must be full-source");
  }
  const smokeForm = assertString(`${label}.runtimeValidation.smokeForm`, plan.smokeForm);
  if (smokeForm.length > 2_000) {
    fail(`${label}.runtimeValidation.smokeForm`, "must be at most 2000 characters");
  }
  const expected = expectedValue(`${label}.runtimeValidation.expected`, plan.expected);
  const effect = plan.effect;
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
    fail(`${label}.runtimeValidation.effect`, "must be an object");
  }
  if (!EFFECT_STATUSES.has(effect.status)) {
    fail(`${label}.runtimeValidation.effect.status`, `must be one of ${[...EFFECT_STATUSES].join(", ")}`);
  }

  const capabilityMode = sample.validation.mode === "host-capability"
    || sample.validation.mode === "browser-capability";
  if (capabilityMode) {
    if (effect.status !== "deferred") {
      fail(label, `${sample.validation.mode} effects must be deferred`);
    }
    const capability = assertString(`${label}.runtimeValidation.effect.capability`, effect.capability);
    if (capability !== sample.validation.hostCapability) {
      fail(label, `deferred capability ${capability} differs from ${sample.validation.hostCapability}`);
    }
    const reason = assertString(`${label}.runtimeValidation.effect.reason`, effect.reason);
    if (reason.length < 24) {
      fail(`${label}.runtimeValidation.effect.reason`, "must explain the deferred boundary");
    }
    if (/\b(?:Host\/call|ai\/generate|sonic\/(?:start|update|status|stop))\b/.test(smokeForm)) {
      fail(`${label}.runtimeValidation.smokeForm`, "must not execute the deferred host/browser effect");
    }
  } else if (effect.status !== "not-required") {
    fail(label, `${sample.validation.mode} effects must be not-required`);
  }

  return Object.freeze({
    load: "full-source",
    smokeForm,
    expected,
    effect: Object.freeze({ ...effect }),
  });
}

export function runtimeValueType(value) {
  if (value === null) return "nil";
  if (typeof value === "number") return Number.isFinite(value) ? "number" : "non-finite-number";
  return typeof value;
}

export function assertRuntimeExpectation(expected, actual, label) {
  const actualType = runtimeValueType(actual);
  if (actualType !== expected.type) {
    fail(label, `expected ${expected.type}, received ${actualType}`);
  }
  if (!Object.is(actual, expected.value)) {
    fail(label, `expected ${JSON.stringify(expected.value)}, received ${JSON.stringify(actual)}`);
  }
}

export function buildRuntimeReport(catalog, results) {
  const byId = new Map(results.map((result) => [result.id, result]));
  if (byId.size !== catalog.samples.length) {
    fail("sample runtime report", "must contain one result per catalog sample");
  }
  const samples = catalog.samples.map((sample) => {
    const result = byId.get(sample.id);
    if (!result) fail("sample runtime report", `missing ${sample.id}`);
    return {
      id: sample.id,
      mainNamespace: sample.mainNamespace,
      mode: sample.validation.mode,
      load: "passed",
      smoke: {
        status: "passed",
        form: sample.runtimeValidation.smokeForm,
        expected: sample.runtimeValidation.expected,
        actual: result.actual,
      },
      effect: sample.runtimeValidation.effect,
    };
  });
  return {
    schemaVersion: 1,
    authority: {
      repository: catalog.authority.repository,
      commit: catalog.authority.commit,
      packageSpec: catalog.authority.packageSpec,
    },
    runtime: {
      lockPath: catalog.runtime.lockPath,
      lockGitBlobSha: catalog.runtime.lockGitBlobSha,
      version: catalog.runtime.version,
      sha256: catalog.runtime.sha256,
    },
    samples,
  };
}
