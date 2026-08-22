export const TOOLSETS = Object.freeze([
  {
    id: "core",
    title: "Core HAL",
    shortTitle: "Core",
    description: "Values, functions, bindings and control flow.",
    tools: [
      {
        id: "value",
        label: "Value",
        description: "Bind a value in the current namespace.",
        snippet: `(def answer
  42)`
      },
      {
        id: "function",
        label: "Function",
        description: "Define a reusable function.",
        snippet: `(defn square [x]
  (* x x))`
      },
      {
        id: "bindings",
        label: "Bindings",
        description: "Evaluate with local names.",
        snippet: `(let [width 6
      height 7]
  (* width height))`
      },
      {
        id: "condition",
        label: "Condition",
        description: "Choose a result from a predicate.",
        snippet: `(let [score 86]
  (if (> score 80)
    :pass
    :retry))`
      }
    ]
  },
  {
    id: "data",
    title: "Data",
    shortTitle: "Data",
    description: "Vectors, maps and immutable updates.",
    tools: [
      {
        id: "vector",
        label: "Vector",
        description: "Create an ordered collection.",
        snippet: `[1 2 3 4]`
      },
      {
        id: "map",
        label: "Map",
        description: "Create a keyed value.",
        snippet: `{:name "Hara"
 :status :ready}`
      },
      {
        id: "lookup",
        label: "Lookup",
        description: "Read a key with an optional fallback.",
        snippet: `(get {:name "Hara"}
     :name
     "Unknown")`
      },
      {
        id: "assoc",
        label: "Assoc",
        description: "Return a map with an updated key.",
        snippet: `(assoc {:status :draft}
       :status
       :ready)`
      }
    ]
  },
  {
    id: "interface",
    title: "HTA Interface",
    shortTitle: "Interface",
    description: "Components, HTA trees and sandboxed preview output.",
    tools: [
      {
        id: "element",
        label: "Element",
        description: "Create an HTA element vector.",
        snippet: `[:section {:class "card"}
 [:h1 "Hello from Hara"]
 [:p "This value renders in the preview."]]`
      },
      {
        id: "component",
        label: "Component",
        description: "Create a function that returns HTA.",
        snippet: `(defn card [title body]
  [:article {:class "card"}
   [:h1 title]
   [:p body]])`
      },
      {
        id: "view",
        label: "View",
        description: "Create a preview root.",
        snippet: `(defn view []
  [:main {:class "preview-shell"}
   [:h1 "Live interface"]])`
      },
      {
        id: "html-effect",
        label: "HTML effect",
        description: "Send trusted author text to the sandboxed HTML preview.",
        snippet: `(preview/html "<main><h1>Hello</h1></main>")`
      }
    ]
  },
  {
    id: "inspect",
    title: "Inspect & Debug",
    shortTitle: "Inspect",
    description: "Trace values and turn assumptions into executable checks.",
    tools: [
      {
        id: "print",
        label: "Print",
        description: "Write values to the REPL output stream.",
        snippet: `(println "value" 42)`
      },
      {
        id: "type",
        label: "Type",
        description: "Inspect the runtime category of a value.",
        snippet: `(type 42)`
      },
      {
        id: "equality",
        label: "Check",
        description: "Evaluate an equality assertion.",
        snippet: `(= 42 (* 6 7))`
      },
      {
        id: "branch-trace",
        label: "Branch trace",
        description: "Print which path a condition takes.",
        snippet: `(let [temperature 24]
  (if (> temperature 20)
    (println "branch" :warm)
    (println "branch" :cool)))`
      }
    ]
  }
]);

export const ACTIVITIES = Object.freeze([
  {
    id: "live-value",
    toolsetId: "core",
    title: "Make a live value",
    level: "Beginner",
    summary: "Edit one definition and watch the value beside the form update.",
    instructions: [
      "Open the activity file.",
      "Change answer so the live result becomes 42.",
      "Run the activity checks."
    ],
    path: "src/activities/live-value.hal",
    source: `(ns activities.live-value)

;; Change this value. InstaREPL evaluates the complete form after you pause.
(def answer
  0)

answer
`,
    checks: [
      { id: "answer", label: "answer is 42", expression: `(= answer 42)`, expected: "true" }
    ]
  },
  {
    id: "square-function",
    toolsetId: "core",
    title: "Complete a function",
    level: "Beginner",
    summary: "Define a function and verify it against more than one input.",
    instructions: [
      "Replace the function body with the square of x.",
      "Evaluate the function form or leave InstaREPL enabled.",
      "Run both checks."
    ],
    path: "src/activities/square-function.hal",
    source: `(ns activities.square-function)

(defn square [x]
  x)

(square 9)
`,
    checks: [
      { id: "square-3", label: "square 3 is 9", expression: `(= (square 3) 9)`, expected: "true" },
      { id: "square-9", label: "square 9 is 81", expression: `(= (square 9) 81)`, expected: "true" }
    ]
  },
  {
    id: "profile-data",
    toolsetId: "data",
    title: "Model a profile",
    level: "Beginner",
    summary: "Create a map, read a key and derive an updated value.",
    instructions: [
      "Set the profile name to Hara.",
      "Keep the original profile immutable.",
      "Create active-profile with status ready."
    ],
    path: "src/activities/profile-data.hal",
    source: `(ns activities.profile-data)

(def profile
  {:name "Unknown"
   :status :draft})

(def active-profile
  profile)

active-profile
`,
    checks: [
      { id: "profile-name", label: "profile name is Hara", expression: `(= (get profile :name) "Hara")`, expected: "true" },
      { id: "profile-status", label: "active profile is ready", expression: `(= (get active-profile :status) :ready)`, expected: "true" }
    ]
  },
  {
    id: "status-card",
    toolsetId: "interface",
    title: "Render a status card",
    level: "Builder",
    summary: "Build a small HTA component and send its value to the preview.",
    instructions: [
      "Change view so it is rooted at :main.",
      "Use status-card inside view.",
      "Evaluate (view) to refresh the preview."
    ],
    path: "src/activities/status-card.hal",
    source: `(ns activities.status-card)

(defn status-card [label state]
  [:article {:class "card"}
   [:span {:class "eyebrow"} label]
   [:h1 state]
   [:p "Rendered from a guided Play activity."]])

(defn view []
  [:section {:class "preview-shell"}
   (status-card "INSTANT HARA" "Ready")])

(view)
`,
    checks: [
      { id: "view-root", label: "view is rooted at :main", expression: `(= (first (view)) :main)`, expected: "true" },
      { id: "view-shape", label: "view has attributes and content", expression: `(= (count (view)) 3)`, expected: "true" }
    ]
  },
  {
    id: "trace-a-value",
    toolsetId: "inspect",
    title: "Trace a decision",
    level: "Builder",
    summary: "Inspect a value and make a branch observable in the REPL.",
    instructions: [
      "Set temperature above 20.",
      "Derive label using if.",
      "Print label and run the check."
    ],
    path: "src/activities/trace-a-value.hal",
    source: `(ns activities.trace-a-value)

(def temperature
  0)

(def label
  (if (> temperature 20)
    "warm"
    "cool"))

(println "temperature label" label)
label
`,
    checks: [
      { id: "warm-label", label: "the derived label is warm", expression: `(= label "warm")`, expected: "true" }
    ]
  }
]);

export const DEFAULT_TOOLSET_ID = "core";
export const DEFAULT_ACTIVITY_ID = "live-value";

export function toolsetById(id) {
  return TOOLSETS.find((toolset) => toolset.id === id) || null;
}

export function activityById(id) {
  return ACTIVITIES.find((activity) => activity.id === id) || null;
}

export function activitiesForToolset(toolsetId) {
  return ACTIVITIES.filter((activity) => activity.toolsetId === toolsetId);
}

export function toolById(toolsetId, toolId) {
  return toolsetById(toolsetId)?.tools.find((tool) => tool.id === toolId) || null;
}

export function normaliseActivityResult(value) {
  return String(value ?? "").trim();
}

export function activityCheckPassed(actual, expected) {
  const value = normaliseActivityResult(actual);
  const accepted = Array.isArray(expected) ? expected : [expected];
  return accepted.some((candidate) => value === normaliseActivityResult(candidate));
}

export function validateStudioCatalog(toolsets = TOOLSETS, activities = ACTIVITIES) {
  const errors = [];
  const toolsetIds = new Set();
  const activityIds = new Set();

  for (const toolset of toolsets) {
    if (!toolset.id || toolsetIds.has(toolset.id)) errors.push(`Duplicate or missing toolset id: ${toolset.id || "<missing>"}`);
    toolsetIds.add(toolset.id);
    const toolIds = new Set();
    for (const tool of toolset.tools || []) {
      if (!tool.id || toolIds.has(tool.id)) errors.push(`Duplicate or missing tool id in ${toolset.id}: ${tool.id || "<missing>"}`);
      toolIds.add(tool.id);
      if (!tool.snippet?.trim()) errors.push(`Tool ${toolset.id}/${tool.id} has no snippet`);
    }
  }

  for (const activity of activities) {
    if (!activity.id || activityIds.has(activity.id)) errors.push(`Duplicate or missing activity id: ${activity.id || "<missing>"}`);
    activityIds.add(activity.id);
    if (!toolsetIds.has(activity.toolsetId)) errors.push(`Activity ${activity.id} references unknown toolset ${activity.toolsetId}`);
    if (!activity.path?.endsWith(".hal")) errors.push(`Activity ${activity.id} must target a .hal file`);
    if (!activity.source?.trim()) errors.push(`Activity ${activity.id} has no starter source`);
    if (!(activity.checks || []).length) errors.push(`Activity ${activity.id} has no checks`);
  }

  return errors;
}
