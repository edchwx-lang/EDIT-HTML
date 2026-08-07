# EDIT-HTML

EDIT-HTML is a source-closed workflow for turning DOCX, PDF, PPTX, Markdown, HTML, or TXT material into a Huashu-designed, editable, versioned offline HTML report.

EDIT-HTML 是一个“材料闭环”的网页报告生成流程：把 DOCX、PDF、PPTX、Markdown、HTML 或 TXT 转成由花叔 Design 负责设计、可编辑、可保存版本、可本地发布的 HTML 报告。

## V5.3.2 focus

- Huashu owns the actual website design: layout, DOM, CSS, interaction, visualization, responsiveness, and narrative structure.
- EDIT-HTML owns extraction, provenance, audit, instrumentation, editor runtime, versioning, and publication.
- Candidate selection is explicit: the user must choose A/B/C before final production.
- Source images are judged, not blindly copied. High-value evidence images should be used or redrawn; low-value or repetitive images may be omitted.
- The editor saves immutable versions and local publications.
- V5.3.2 includes a local-folder-open patch: Windows now opens the concrete publication folder instead of a generic Documents-level location.

## V5.3.2 重点

- 花叔 Design 拥有真实网页设计权：布局、DOM、CSS、交互、可视化、响应式和叙事结构。
- EDIT-HTML 负责材料提取、溯源、审计、HTML 注入、编辑器运行时、版本保存和发布。
- 候选稿必须由用户明确选择 A/B/C，不能由模型自动确认。
- 原图使用需要判断，不是按数量搬运。高价值证据图应使用或重绘，低价值、重复或装饰性图片可以省略。
- 编辑器保存的是不可变版本，本地发布会生成独立 publication 文件夹。
- V5.3.2 包含本地文件夹打开补丁：Windows 会打开具体发布目录，而不是退到“文档”等上层目录。

## Workflow / 流程

```mermaid
flowchart TD
  A["Source material<br/>原始材料"] --> B["Source Pack<br/>文本、图片、来源、事实表"]
  B --> C["Content interview<br/>用途、重点、必要澄清"]
  C --> D["Huashu candidates<br/>A / B / C 三个可执行样张"]
  D --> E["User selection<br/>用户选择方向"]
  E --> F["Huashu final website<br/>完整网页设计"]
  F --> G["EDIT-HTML audit<br/>事实、覆盖、图片决策、边界"]
  G --> H["artifact.html<br/>可编辑 HTML"]
  H --> I["Editor<br/>编辑、保存版本、发布"]
  I --> J["Local publication folder<br/>publications/<id>/report.html"]
```

Example from the “报告中转站” test material:

```mermaid
flowchart LR
  W["Word report<br/>全球顶尖科学家正在向哪儿搬家？"] --> S["Source Pack"]
  S --> H["Huashu-designed web report"]
  H --> P["Local publication<br/>report.html"]

  subgraph Evidence["Evidence blocks / 证据模块"]
    B["北京 450 人"]
    L["伦敦 573 人"]
    C["城市流动与科研人才迁移"]
  end

  S --> Evidence
  Evidence --> H
```

## Install

```powershell
npm install
npm run install:local
```

The npm package and CLI command remain `edit-html-report` for compatibility. The Codex Skill name is `EDIT-HTML`.

为保持兼容，npm 包名和 CLI 命令仍为 `edit-html-report`；Codex Skill 名称为 `EDIT-HTML`。

## Basic usage

```powershell
edit-html-report doctor
edit-html-report create "input.docx" --out "my-report"
edit-html-report variant create "my-report"
```

Then follow the V5.3.2 Skill workflow:

1. Inspect the Source Pack and warnings.
2. Ask only content questions: purpose, content weight, and necessary clarification.
3. Start the Huashu candidate stage.
4. Show A/B/C screenshots and wait for user selection.
5. Start the Huashu final stage from the selected candidate.
6. Import, verify, render, validate, and open the editor.
7. Save a version, publish locally, and open the local publication folder.

## Boundaries / 边界

EDIT-HTML must not redesign Huashu output during audit or instrumentation. Audit failures are diagnostics; they do not authorize silent layout, wording, chart, or interaction rewrites.

EDIT-HTML 在审计和注入阶段不能重写花叔 Design 的设计输出。审计失败只能返回诊断，不能静默修改布局、文案、图表或交互。

## Validation

```powershell
npm test
node --check bin/edit-html-report.js
```

