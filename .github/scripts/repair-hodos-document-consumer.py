from pathlib import Path
import re
import textwrap

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def write_clean(path: str, content: str) -> None:
    write(path, textwrap.dedent(content).lstrip("\n"))


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


def regex_once(source: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.M)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return updated


def repair_projection() -> None:
    path = "src/hodos/workspace-shell-state.js"
    source = read(path)
    source = replace_once(
        source,
        '  const selectedAreaId = selectedSurface?.["surface/area"] || ids.editor;\n',
        '  const selectedProjectedAreaId = selectedSurface?.["surface/area"] || ids.editor;\n',
        "selected projected area declaration",
    )
    source = replace_once(
        source,
        '      "area/id": selectedAreaId,\n',
        '      "area/id": selectedProjectedAreaId,\n',
        "selected projected area use",
    )
    write(path, source)


def repair_package_marker() -> None:
    path = "scripts/prepare-web-packages.mjs"
    source = read(path)
    source = replace_once(
        source,
        '    marker: "vendor/hodos/packages/2d-ui/src/document-dom-host.js",\n',
        '    marker: "vendor/hodos/packages/dev-ui/src/index.js",\n',
        "shared Hodos checkout marker",
    )
    write(path, source)


def repair_consumer_test() -> None:
    path = "tests/hodos-document-consumer.test.js"
    source = read(path)
    source = regex_once(
        source,
        r"const \[html, shell, styles, prepare, manifest\] = await Promise\.all",
        "const [html, shell, styles, manifest] = await Promise.all",
        "document consumer fixture bindings",
    )
    source = regex_once(
        source,
        r'^\s*read\("\.\./scripts/prepare-web-packages\.mjs"\),\n',
        "",
        "document consumer preparation fixture",
    )
    source = regex_once(
        source,
        r'^\s*assert\.match\(prepare, /2d-ui\\/src\\/document-dom-host\\\.js/\);\n',
        "",
        "document consumer preparation assertion",
    )
    write(path, source)


def repair_existing_tests() -> None:
    path = "tests/browser-audio-workflow.test.js"
    source = read(path)
    source = replace_once(
        source,
        '  assert.match(workflow, /scripts\\/verify-supersonic-project-open\\.mjs/);\n',
        '  assert.match(workflow, /scripts\\/verify-supersonic-project-open\\.mjs/);\n'
        '  assert.match(workflow, /scripts\\/verify-hodos-document-project-open\\.mjs/);\n'
        '  assert.match(workflow, /samples\\/hodos-document\\/\\*\\*/);\n',
        "browser Hodos Document paths",
    )
    source = replace_once(
        source,
        '    "scripts/verify-supersonic-project-open.mjs"\n',
        '    "scripts/verify-supersonic-project-open.mjs",\n'
        '    "scripts/verify-hodos-document-project-open.mjs"\n',
        "browser runner list",
    )
    write(path, source)

    path = "tests/project-catalog.test.js"
    source = read(path)
    source = replace_once(
        source,
        "  assert.equal(FEATURED_PROJECTS.length, 4);\n",
        "  assert.equal(FEATURED_PROJECTS.length, 5);\n",
        "featured project count",
    )
    write(path, source)


def write_sample() -> None:
    write_clean("samples/hodos-document/project.edn", r'''
    {:hara/type :project
     :hara/version "1.0.0"
     :project/id playground.hodos-document
     :project/version "0.1.0"
     :project/source-paths ["src"]
     :project/test-paths ["test"]
     :project/extension-paths ["extensions"]
     :project/main playground.hodos-document
     :project/capabilities
     #{:studio/eval}}
    ''')

    write_clean("samples/hodos-document/src/main.hal", r'''
    (ns playground.hodos-document)

    (def answer
      (* 6 7))

    (defn view []
      [:main {:class "preview-shell"}
       [:article {:class "card"}
        [:span {:class "eyebrow"} "HODOS 2D"]
        [:h1 "Inspectable document"]
        [:p "The committed answer is " answer]]])

    (view)
    ''')

    write_clean("samples/hodos-document/workspace.edn", r'''
    {:hara/type :workspace
     :hara/version "1.0.0"
     :workspace/id :playground-hodos-document
     :workspace/revision 0
     :workspace/layout
     {:layout/type :split
      :layout/id :layout/root
      :layout/direction :horizontal
      :layout/ratio 0.2
      :layout/first {:layout/type :area :layout/area "area/project"}
      :layout/second
      {:layout/type :split
       :layout/id :layout/work
       :layout/direction :horizontal
       :layout/ratio 0.44
       :layout/first {:layout/type :area :layout/area "area/editor"}
       :layout/second
       {:layout/type :split
        :layout/id :layout/document-output
        :layout/direction :vertical
        :layout/ratio 0.72
        :layout/first {:layout/type :area :layout/area "area/document"}
        :layout/second {:layout/type :area :layout/area "area/output"}}}}
     :workspace/documents
     [{:document/id "document/source"
       :document/path "src/main.hal"
       :document/title "main.hal"
       :document/language :hal
       :document/dirty? false}
      {:document/id "document/review"
       :document/profile "hodos.rich-text/2"}]
     :workspace/areas
     [{:area/id "area/project"
       :area/type :project
       :area/title "Project"
       :area/presentation
       {:presentation/role :project
        :presentation/label "Files"}}
      {:area/id "area/editor"
       :area/type :code-editor
       :area/title "main.hal"
       :area/presentation
       {:presentation/role :editor
        :presentation/label "Code"}}
      {:area/id "area/output"
       :area/type :output
       :area/title "Preview"
       :area/presentation
       {:presentation/role :output
        :presentation/label "Canvas"}}
      {:area/id "area/document"
       :area/type "hodos.2d/document"
       :area/title "Inspectable document"
       :area/presentation
       {:presentation/label "Document"
        :presentation/icon :document
        :presentation/surface :document
        :presentation/mode :document
        :presentation/order 2
        :presentation/compact true
        :presentation/auto-focus true}
       :area/component
       {:component/id "hodos.2d/document"
        :component/contract "workspace.component/1"
        :component/model
        {:document
         {:profile "hodos.rich-text/2"
          :id "document/review"
          :title "Inspectable documents"
          :revision 0
          :metadata {:source "workspace.edn" :authority "playground"}
          :children
          [{:id "block/title"
            :type "heading"
            :attrs {:level 1}
            :children [{:id "text/title" :type "text" :text "Inspectable documents"}]}
           {:id "block/intro"
            :type "paragraph"
            :attrs {}
            :children [{:id "text/intro" :type "text" :text "Edit this sentence. The stable text identity survives each Hodos update."}]}
           {:id "block/artefact"
            :type "hara-artefact"
            :attrs
            {:artefactId "artefact/answer"
             :kind "value"
             :title "Committed Hara value"
             :mode "snapshot"
             :entry "playground.hodos-document/answer"
             :capabilities []
             :snapshotRoot "sha256:answer-42"
             :snapshotDisplay "42"
             :snapshotMediaType "application/edn"
             :snapshotSourceRoot "sha256:source-answer"
             :metadata {:committed true}}
            :children [{:id "text/artefact-source" :type "text" :text "answer"}]}]}
         :selection {:nodeId "block/intro" :anchor nil :focus nil}
         :status "ready"
         :readOnly false
         :capabilities
         {:select true
          :editText true
          :insertBlock false
          :deleteBlock false
          :activateArtefact false
          :commitArtefact false
          :command false}
         :error nil}
        :component/events
        ["document/select"
         "document/edit-text"
         "document/insert-block"
         "document/delete-block"
         "document/activate-artefact"
         "document/commit-artefact"
         "document/command"]}}]
     :workspace/nodes []
     :workspace/connections []
     :workspace/links
     [{:link/id "link/source-editor"
       :link/document "document/source"
       :link/area "area/editor"}
      {:link/id "link/review-document"
       :link/document "document/review"
       :link/area "area/document"}]
     :workspace/selection
     {:area/id "area/document"
      :document/id "document/review"
      :surface/id "document"}
     :workspace/customizations
     {:responsive/breakpoint 1000
      :responsive/default-surface "document"
      :recovery/journal true}
     :workspace/extensions []
     :workspace/pending []
     :workspace/audit []}
    ''')


def clean_staging() -> None:
    for path in (
        ".github/scripts/repair-hodos-document-consumer.py",
        ".github/workflows/repair-hodos-document-consumer.yml",
    ):
        target = ROOT / path
        if target.exists():
            target.unlink()


def main() -> None:
    repair_projection()
    repair_package_marker()
    repair_consumer_test()
    repair_existing_tests()
    write_sample()
    clean_staging()


if __name__ == "__main__":
    main()
