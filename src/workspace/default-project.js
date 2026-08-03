export const defaultProject = [
  {
    path: "project.edn",
    content: `{:hara/type :project
 :hara/version "1.0.0"
 :project/id hara.studio.hello
 :project/version "0.1.0"
 :project/source-paths ["src"]
 :project/test-paths ["test"]
 :project/extension-paths ["extensions"]
 :project/main app.core
 :project/capabilities
 #{:studio/eval}}
`
  },
  {
    path: "workspace.edn",
    content: `{:hara/type :workspace
 :hara/version "1.0.0"
 :workspace/id :hara-studio-hello
 :workspace/layout
 {:layout/type :split
  :layout/direction :horizontal
  :layout/ratio 0.62
  :layout/first {:layout/type :area :layout/area "area/editor"}
  :layout/second {:layout/type :area :layout/area "area/output"}}
 :workspace/documents
 [{:document/id "document/core"
   :document/path "src/app/core.hal"
   :document/language :hal}]
 :workspace/areas
 [{:area/id "area/editor" :area/type :code-editor :area/title "core.hal"}
  {:area/id "area/output" :area/type :output :area/title "Output"}]
 :workspace/nodes []
 :workspace/connections []
 :workspace/links
 [{:link/id "link/core-editor"
   :link/document "document/core"
   :link/area "area/editor"}]
 :workspace/customizations
 {:recovery/journal true}}
`
  },
  {
    path: "src/app/core.hal",
    content: `(ns app.core)

(defn card [title body]
  [:article {:class "card"}
   [:span {:class "eyebrow"} "LIVE FROM THE HARA REPL"]
   [:h1 title]
   [:p body]
   [:div {:class "status-row"}
    [:span {:class "status-dot"}]
    [:span "Runtime connected"]]])

(defn view []
  [:main {:class "preview-shell"}
   (card "Hello from Hara"
         "Edit this function, evaluate the file, then run (view) again.")])

(view)
`
  },
  {
    path: "src/app/math.hal",
    content: `(ns app.math)

(defn square [x]
  (* x x))

(defn sum [& values]
  (apply + values))
`
  },
  {
    path: "README.md",
    content: `# Hello Studio

This is a canonical Hara project using \`project.edn\`, \`workspace.edn\`, and HAL source files.

- Press **Ctrl/Cmd + Enter** to evaluate the current file.
- Enter forms in the REPL at the bottom.
- Return an HTA vector, such as \`(view)\`, to refresh the preview.
- Install the official Hara Studio runtime archive for the full WASM kernel.
- Public GitHub repositories can be imported from the toolbar.
`
  }
];
