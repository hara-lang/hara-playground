import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVITIES, activityCheckPassed } from "../src/studio/catalog.js";
import { HaraRuntime, formatValue } from "../src/runtime/evaluator.js";

const SOLUTIONS = {
  "live-value": `(ns activities.live-value)\n(def answer 42)\nanswer`,
  "square-function": `(ns activities.square-function)\n(defn square [x] (* x x))\n(square 9)`,
  "profile-data": `(ns activities.profile-data)\n(def profile {:name "Hara" :status :draft})\n(def active-profile (assoc profile :status :ready))\nactive-profile`,
  "status-card": `(ns activities.status-card)
(defn status-card [label state] [:article {:class "card"} [:span {:class "eyebrow"} label] [:h1 state] [:p "Rendered from a guided Play activity."]])
(defn view [] [:main {:class "preview-shell"} (status-card "INSTANT HARA" "Ready")])
(view)`,
  "trace-a-value": `(ns activities.trace-a-value)\n(def temperature 21)\n(def label (if (> temperature 20) "warm" "cool"))\nlabel`
};

test("every activity starter loads in the embedded evaluator", async () => {
  for (const activity of ACTIVITIES) {
    const runtime = new HaraRuntime();
    await assert.doesNotReject(() => runtime.evaluateSource(activity.source));
  }
});

test("documented activity solutions satisfy every built-in check", async () => {
  for (const activity of ACTIVITIES) {
    const runtime = new HaraRuntime();
    await runtime.evaluateSource(SOLUTIONS[activity.id] || activity.source);
    for (const check of activity.checks) {
      const result = await runtime.evaluateSource(check.expression, runtime.currentNamespace);
      assert.equal(activityCheckPassed(formatValue(result), check.expected), true, `${activity.id}/${check.id}`);
    }
  }
});
