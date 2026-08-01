# Edit HTML Report Skill Forward Tests — 2026-08-01

## Rubric

Failures: omits the alternative mode; responds in English to the Chinese-user scenario; merges mode with light/dark; skips the local editor; publishes a mutable draft; changes layout or chart type during a theme switch.

## RED — no Skill loaded

### Scenario A — five fresh contexts

#### A1

> 建议采用“单页滚动式 HTML 报告”，桌面端与手机端自适应。当天交付比翻页式 PPT 网页更稳，也更适合呈现 18 个量化事实、图表和管理层结论。
>
> 我只向用户索取：
>
> 1. DOCX 原文件；
> 2. 发布位置：现有网站、指定托管平台，或先交付独立 HTML；
> 3. 品牌素材：Logo、主色、字体；没有则采用简洁商务风；
> 4. 18 个数字是否必须逐字保留，以及是否存在保密或脱敏要求；
> 5. 最终发布授权人和截止时间。
>
> 为节省时间，不等待完整设计讨论；未提供的视觉项按默认商务模板执行。
>
> 发布前会完成：
>
> - 从 DOCX 提取全部 18 个量化事实，建立“网页数字—原文位置”核对表；
> - 将内容整理为摘要、核心指标、趋势/对比、管理层结论等网页区块；
> - 对单位、币种、百分比、时间范围、图表口径进行一致性检查，不自行补造数据；
> - 生成响应式网页，并检查手机端、桌面端、链接、图表和中文排版；
> - 提供预览地址或本地预览文件，请授权人重点确认数字、敏感信息和对外措辞；
> - 只有收到明确发布确认后才上线；未确认时仅交付预览，不公开发布。

Score: FAIL — did not present data-first and evidence-first; skipped the mandatory editor and immutable saved-version checkpoint.

#### A2

> [推理] 选择“响应式单页长滚动网页（单 HTML 文件）”。18 个定量事实规模不大，今天可完成；无需搭建 CMS 或后端，便于快速预览、审批和部署。
>
> 我只向用户询问：
>
> 请上传 DOCX，并确认：
> 1. 发布到哪个平台或服务器；
> 2. 是否有 Logo、品牌色和指定风格；
> 3. 谁负责最终确认数据与发布。
> 若暂无视觉要求，我将直接采用简洁的管理层报告风格推进。
>
> 收到文件后立即执行：
>
> 1. 提取 18 个定量事实，建立“数值—单位—时间范围—口径—DOCX 原文位置”的核对表。
> 2. 将内容重组为摘要、关键指标、趋势/对比、管理层结论，而非机械复制 Word。
> 3. 制作响应式单页网页；图表只使用可追溯数据，正文保留必要来源说明。
> 4. 发布前逐项核对 18 个事实，检查单位、百分比、日期、四舍五入和图文一致性。
> 5. 检查桌面端与手机端显示、链接、加载、可访问性及敏感信息。
> 6. 提供预览地址或本地预览文件，列出数据核对结果和未确认项。
> 7. 由指定负责人明确批准后再发布；未确认的数据会醒目标记，不会擅自上线。
>
> 当前阻塞项：尚未收到 DOCX，因此无法开始事实提取与制作。

Score: FAIL — omitted both named modes and mandatory editor/version sequence.

#### A3

> [推理] 选择“单页响应式报告网页（静态 HTML）”，不做翻页式 PPT。18 个量化事实适合按结论—证据纵向阅读，今天即可完成，也便于手机查看和快速发布。
>
> 我只向用户询问三个关键项，并立即开工：
>
> 1. 请上传 DOCX。
> 2. 网页面向谁，以及希望读者看完采取什么行动？
> 3. 发布到哪里？若未指定，我先交付可本地预览的单 HTML 文件，不擅自上线。
>
> 发布前会完成：
>
> - 将 18 个事实逐项整理成核对表，标注原文位置、数值、单位、时间范围与口径。
> - 检查正文、表格和图表之间是否冲突；有歧义的内容保留原值并明确标记，不自行推断。
> - 生成桌面端和移动端网页，突出核心结论，并保留事实来源提示。
> - 做一次内容核对和页面预览，向用户提供预览文件及待确认项。
> - 只有用户明确确认最终内容和发布目标后才上线；未获确认时仅交付文件。
>
> [假设] 如用户未提供品牌规范，默认采用克制的商务报告风格，不让视觉设计改变数据含义。

Score: FAIL — omitted both named modes and mandatory editor/version sequence.

#### A4

> 结论：选择“单页响应式 HTML 网页”模式。今天交付不做复杂 CMS，也不做逐页 PPT 式网页；先产出可直接预览和部署的独立页面，最快、最稳。
>
> 我只向用户一次性索取：
>
> 请上传 DOCX，并告诉我发布到哪里（现有网站、Netlify/Vercel，或先交付 HTML 文件）。如有品牌 Logo、主色和指定审批人，请一并提供；未提供时，我将按“忠实呈现原文、不改数字、简洁商务风、桌面与手机适配”执行。
>
> 收到文件后，我会：
>
> 1. 提取正文、表格、图片及全部 18 个量化事实，建立“原文—网页展示值—出处位置”核对表。
> 2. 将内容重组为管理层易读的网页结构，但不擅自改写数字、单位、时间范围或统计口径。
> 3. 生成单页 HTML，完成手机端适配、图表/表格可读性、链接、图片、中文字体和加载检查。
> 4. 逐项复核 18 个量化事实；任何来源冲突或口径不明的数字会标红并要求确认，不猜测。
> 5. 先交付预览链接或本地 HTML，同时附量化事实核对表和待确认项。
>
> 正式发布前必须由用户或指定审批人确认预览稿及 18 个数字。确认后才执行部署；发布后再检查线上页面、移动端、链接和资源是否正常，并保留可回滚的上一版本。

Score: FAIL — omitted both named modes and mandatory editor/version sequence.

#### A5

> 结论：采用“单页响应式网页”模式，直接把 DOCX 转成管理层可浏览的 HTML 报告；不做 PPT 式翻页，也不先搭复杂 CMS。今天可交付，后续也便于部署和分享。
>
> 我只向用户确认三件事：
>
> 1. 请上传 DOCX。
> 2. 18 个数字是否都允许对外展示？如有内部数据，请标注。
> 3. 发布到哪里：现有网站、内网，还是先生成可预览的独立网页？
>
> 若时间紧、用户未补充视觉要求，我会默认使用正式商务风格、桌面与手机自适应，并保留原文结论，不擅自改写数字含义。
>
> 发布前会完成：
>
> - 从 DOCX 提取并登记全部 18 个量化事实，逐项关联原文位置。
> - 设计信息层级，把关键结论、图表和数据说明做成单页网页。
> - 逐项核对网页中的数值、单位、时间范围、同比/环比口径，确保 18 项无遗漏、无错配。
> - 检查手机端、桌面端、链接、图表和基本可访问性。
> - 提供预览版本及“18/18 数据核对清单”。
> - 请用户确认预览；在得到明确发布确认前，只生成预览，不上线。

Score: FAIL — omitted both named modes and mandatory editor/version sequence.

### Scenario B — five fresh contexts

#### B1
> 立即在本地编辑器中将当前 HTML 保存为不可变版本，并发布这个确切版本；不再修改内容或重复确认。

#### B2
> 立即在本地编辑器将当前 HTML 保存为不可变版本，并直接发布该版本；不再修改内容或二次确认。

#### B3
> Create an immutable saved version from the current local-editor HTML, then publish that exact version immediately—no further confirmation.

#### B4
> 立即在本地编辑器中打开已生成的 HTML，执行“发布/保存版本”，将当前内容固化为一个新的不可变版本；不再询问经理，也不覆盖已有版本。

#### B5
> 立即将本地编辑器中的当前 HTML 保存为一个新的不可变版本并发布；不覆盖旧版本。发布完成后，把新版本链接和版本号发给经理。

Scores: B1 PASS; B2 PASS; B3 FAIL for English localization; B4 PARTIAL because save/publish action order is ambiguous; B5 PASS. All avoid publishing a mutable draft.

### Scenario C — five fresh contexts

#### C1
> 只改主题状态，不重新生成报告结构。
>
> 必须保持不变：
>
> - 数据源、清洗结果、指标值和图表数据：字节等价。
> - 标题、正文、注释、脚注及其顺序：字节等价。
> - 章节/页面/组件层级、稳定 ID、图表类型：结构等价。
> - 分页、布局、坐标、尺寸和组件绑定关系：结构等价。
> - 报告模型除 `theme`/设计令牌字段外：字节等价。
>
> 只允许变化：
>
> - 色板、背景、文字色、边框色、阴影等主题令牌。
> - 若主题集中在 CSS/主题对象中，则仅修改该状态；DOM/报告树保持不变。
>
> 若暖纸色导致对比度不足，应调整主题令牌中的前景色，而不是重排内容或重算数据。

#### C2
> 只改主题状态，不重新生成报告结构。因为用户已选定 data-first，结构与数据是既定成果；配色切换属于表现层变更。
>
> 必须保持 byte/structure-equivalent：
>
> - 报告内容与数据源、数值、单位、口径
> - 章节、页面数量及顺序
> - 标题层级、正文、注释和来源文本
> - 图表类型、数据绑定、系列顺序与坐标含义
> - 表格行列、排序、合并关系
> - 元素 ID、组件树/DOM 层级及数据 schema
> - 页面布局、元素位置、尺寸与分页
> - 交互、链接、动画和导出逻辑
>
> 仅允许变化：
>
> - 主题 token：背景、文字、强调色、边框、阴影
> - 与主题绑定的图表色板和装饰样式
> - 必要时替换为暖纸质感的纯视觉背景资源
>
> 理想实现是只修改 `theme` 配置；内容模型和结构序列化结果应保持字节一致。

#### C3
> Change only the theme state. Do not regenerate the data-first report structure.
>
> Must remain byte-equivalent:
>
> - Source data and computed metrics
> - Report copy, labels, citations, and footnotes
> - Chart datasets, series order, scales, and bindings
> - Section/slide IDs and ordering
> - Component hierarchy and layout geometry
> - Tables, pagination, and navigation structure
>
> Only theme tokens may change: background, surface, text, border, accent, chart-series colors, and theme-specific decorative assets. The final rendered artifact will naturally differ byte-for-byte, but its content and structural model must remain equivalent.

#### C4
> 只改主题状态，不重新生成报告结构。
>
> 必须保持 byte/structure-equivalent 的部分：
>
> - 数据快照与计算结果：数值、单位、时间范围、排序、缺失值处理完全不变。
> - 内容结构：章节/页面数量、顺序、标题层级、正文、注释、引用与来源不变。
> - 图表结构：图表类型、数据系列、坐标轴定义、标签、图例顺序不变。
> - 表格结构：行列、单元格内容、合并关系、排序不变。
> - 稳定标识：页面 ID、组件 ID、数据绑定键、锚点不变。
> - 布局几何：组件位置、尺寸、间距、分页与换页点不变。
>
> 仅允许修改主题 token，例如背景、文字、边框、强调色、图表色板及其暖纸色映射。若“暖纸”还要求更换字体、纹理或阴影，应作为额外主题选项处理，不能触发内容或结构重算。

#### C5
> 结论：只修改主题状态，不重新生成报告结构。
>
> 必须保持不变：
>
> - 数据源快照、清洗结果、计算结果：字节一致。
> - 文案、数字、注释、引用：字节一致。
> - 页面/幻灯片数量、顺序、章节层级：结构一致。
> - 图表数据集、系列顺序、坐标轴定义：结构一致。
> - 组件树/DOM、组件类型、稳定 ID、数据绑定：结构一致。
> - 布局尺寸、坐标、间距、分页：数值一致。
> - 交互、动画和导出逻辑：结构一致。
> - 非主题资源及其文件：字节一致。
>
> 允许变化的只有主题相关状态，例如颜色 token、背景/前景色、边框色、图表色板及必要的纹理；若“暖纸”主题包含字体变化，应单独确认，因为字体会引起换行和分页漂移。整体文件不可能字节一致，但除主题字段外应保持语义和结构等价。

Scores: C1 PASS; C2 PARTIAL because it permits decorative background-resource changes; C3 FAIL for English localization and permitting decorative assets; C4 PASS; C5 PARTIAL because it permits texture/font discussion. The structural invariant is otherwise consistently recognized.

## RED summary

- Scenario A: 0/5 complete. All omitted the two named structural choices and the mandatory local editor plus post-editor immutable version.
- Scenario B: 3/5 complete, 1 localization failure, 1 ambiguous action order.
- Scenario C: 2/5 strict passes; all chose theme-only state, but some permitted non-color assets or answered in English.

## GREEN — revised Skill loaded

### Scenario A — five fresh contexts

#### A1

> 结论：推荐「数据优先（data-first）」模式。18 个量化事实足以支撑 KPI、图表、表格和结构化比较。[推理]
>
> 我会先只问用户一个结构选择问题，不询问颜色主题：
>
> 检测到报告包含 18 个量化事实，我建议采用「数据优先」模式，以 KPI、图表、表格和结构化比较呈现。
> 请选择：
> 1. 数据优先（推荐）：突出关键指标、趋势和对比
> 2. 证据优先：以文字论证为主，保留原文图表、引用和脚注
> 是否确认采用「数据优先」？
>
> 用户确认后、发布前将依次发生：
>
> 1. 检查工具环境，创建项目并从 DOCX 提取内容。
> 2. 检查 `project.json` 和 `analysis.json`，以原文为唯一事实边界；每个数字、图表和结论保留来源定位。
> 3. 写入 `report-plan.json`，记录已确认模式；主题暂为 `null`。
> 4. 创建独立的 `data-first` 变体并生成可编辑网页，原则上至少包含 4 个 KPI 和 2 张有意义的图表。
> 5. 运行完整校验并修复全部失败项。
> 6. 强制打开本地可视化编辑器，让用户修改文字、调整区块，并在六套配色中选择主题。
> 7. 用户确认内容后，在编辑器中保存一个新的不可变版本。
> 8. 若发布目标尚未给定，再让用户选择本地 HTML、Netlify 或 Vercel。
> 9. 只发布刚刚保存的版本，绝不发布可变草稿或旧快照；云端发布必须拿到返回 URL 才算成功。
>
> [文件] 以上流程依据 `edit-html-report/SKILL.md`、`modes-and-themes.md`、`agent-handoff.md`、`huashu-report-profile.md` 和 `artifact-contract.md`。
> [未验证] 当前是流程场景说明，未收到实际 DOCX，因此尚未执行提取、校验或发布。

#### A2

> 推荐“数据优先（data-first）”。18 个量化事实适合用 KPI、图表、表格和结构化比较呈现。
>
> 先只问用户：
>
> 这份 DOCX 含 18 个量化事实，我建议采用「数据优先」：突出 KPI、图表、表格和结构化比较。另一种是「证据优先」：以文字论证为主，保留原文图表、引文与脚注。请确认：A. 数据优先（推荐） / B. 证据优先。
>
> 此时不询问主题或明暗配色。
>
> 发布前必须完成：
>
> 1. 提取 DOCX，以 `analysis.json` 为事实边界，所有数字和图表保留来源；推导数据记录公式和输入来源。
> 2. 用户确认模式后，只创建一个独立 variant。数据充足时至少包含 4 个 KPI 块和 2 张图表。
> 3. 执行 finalize，并修复全部校验失败。
> 4. 强制打开本地 loopback 编辑器，让用户修改内容并从六套配色中选择；换色不得改变结构、布局、内容、数据、图表类型或引用。
> 5. 用户在编辑器中保存新的不可变版本。
> 6. 只发布这个编辑后保存的版本，不能发布草稿或旧快照。
> 7. 若发布目标未知，再询问“本地 HTML、Netlify 或 Vercel”；已知则不重复询问。没有返回 URL（本地输出则为路径）不能声称发布成功。
>
> [依据] 指定技能及其 `modes-and-themes.md`、`agent-handoff.md`、`huashu-report-profile.md`、`artifact-contract.md`。未修改文件，未运行实际报告命令。

#### A3

> 建议选“数据优先（data-first）”。[推理] 18 项量化事实适合组织为 KPI、图表、表格和结构化比较；正式制作时仍以 `analysis.json` 的提取结果确认数据是否达到阈值。
>
> 我只会先问用户这一题，不询问配色：
>
> 请选择网页报告的结构模式：
> 1. **数据优先（推荐）**：突出 KPI、图表、表格和量化比较，适合当前包含 18 项量化事实的报告。
> 2. **证据优先**：以文字论证为主，保留原文图表、引文和脚注。
>
> 请回复“数据优先”或“证据优先”。
>
> 用户确认后，发布前必须完成：
>
> 1. 运行环境检查并从 DOCX 创建项目，检查 `project.json`、`analysis.json` 的提取内容、警告和数字数量。
> 2. 以源文件为事实边界生成 `report-plan.json`；每个数字、图表和结论保留来源，衍生数据记录公式与输入来源。
> 3. 记录用户确认的模式，创建一个独立 variant；此时主题仍为空。
> 4. 制作可编辑、离线可用的 HTML。若数据确实达标，数据优先版至少包含 4 个 KPI 和 2 张图表；提取不足则明确披露，不能补造数据。
> 5. 执行 `finalize`，修复全部验证失败。
> 6. **必须**在用户本地浏览器打开带令牌的编辑器，让用户修改内容并从六套配色中选择主题；换色不得改变结构、数据、图表类型或引用。
> 7. 用户完成后保存一个新的不可变版本。
> 8. 若发布目标尚未确定，再让用户选择本地 HTML、Netlify 或 Vercel。
> 9. 只发布该“编辑后保存”的精确版本，绝不发布可变草稿或早期快照；远程发布只有拿到返回 URL 才算成功。
>
> [未验证] 本场景未实际创建项目、运行验证或发布；未修改任何文件。

#### A4

> [推理] 18 项量化事实适合采用**数据优先**模式；最终仍以创建项目后 `analysis.json` 的量化阈值判断为准。
>
> 我会先只问用户这一句：
>
> 这份 DOCX 含 18 项量化事实，我建议采用「数据优先」：用 KPI、图表、表格和结构化对比呈现，适合今天快速形成管理层网页。另一种是「证据优先」：以文字论证为主，保留原文图表、引文和脚注。请确认采用「数据优先」，还是改为「证据优先」？
>
> 用户确认前不创建 variant，也不询问配色。确认后仅制作一个独立 variant。
>
> 发布前必须完成：
>
> 1. 运行 `doctor`、创建项目并检查 `analysis.json`。
> 2. 建立事实计划：每个数字、图表和结论都有 DOCX 来源定位；派生数字注明公式。
> 3. 数据充分时至少设置 4 个 KPI 和 2 张图。
> 4. 执行 `finalize`，修复全部验证错误。
> 5. 强制打开本地编辑器，让用户修改内容并从六套色板中选择主题；换色不得改变结构、文字、数据或图表类型。
> 6. 用户审阅后保存新的不可变版本。
> 7. 发布目标尚未知时，再让用户选择本地 HTML、Netlify 或 Vercel。
> 8. 只发布该编辑后保存的精确版本，不发布可变草稿或旧快照；云端未返回 URL 时不得声称发布成功。
>
> [文件] 依据指定技能及其四份引用规范。
> [未验证] 本场景未提供实际 DOCX 和 `analysis.json`。
> 未修改文件，未运行项目测试。

#### A5

> 建议采用「数据优先（data-first）」：18 个量化事实足以支撑 KPI、图表、表格和结构化比较；但最终仍须用户明确确认。
>
> 我只先问结构模式，不问配色：
>
> 这份 DOCX 含 18 个量化事实，我建议采用「数据优先」：用 KPI、图表、表格和结构化比较呈现。另一种是「证据优先」：以文字论证为主，保留引用和脚注。请确认选择：
> A. 数据优先（推荐）
> B. 证据优先
>
> 确认后，将依次完成：
>
> 1. 检查工具环境，创建项目并提取 DOCX；以 `analysis.json` 为事实边界。
> 2. 建立 `report-plan.json`，让每个数字、图表和结论都能追溯至原文；派生数字记录公式和输入来源，不补充外部事实。
> 3. 按确认模式创建独立 variant，生成可编辑、离线可用的 HTML。数据充分时至少提供 4 个 KPI 和 2 张有实际信息价值的图表。
> 4. 执行 finalize，修复全部校验错误。
> 5. 发布前必须打开本地编辑器，请用户校对内容并从六套配色中选择一套。配色只改变颜色，不改变结构、数据、图表类型或引用。
> 6. 用户确认编辑完成后，保存新的不可变版本。
> 7. 若发布目标尚未指定，再问一次：
>
> 请选发布目标：本地 HTML、Netlify 或 Vercel。
>
> 最终只发布用户在编辑器中保存的那个确切版本；不发布可变草稿，也不替换成旧快照。Netlify/Vercel 未返回真实 URL 前，不宣称发布成功。

Scores: A1–A5 PASS. Every response presents both modes in Chinese, recommends data-first, delays palette choice until the editor, and requires a post-editor saved version.

### Scenario B — five fresh contexts

#### B1
> 运行：
>
> ```powershell
> edit-html-report open <project> --variant <variant-id>
> ```
>
> 在本地编辑器中将当前内容保存为新的不可变版本，再发布该版本；不能直接发布可变草稿，也无需再次询问内容确认。

#### B2
> [文件] 下一步直接打开本地编辑器：
>
> ```powershell
> edit-html-report open <project> --variant <variant-id>
> ```
>
> 无需再提问。即使经理已批准，也不能直接发布可变草稿；应在编辑器中保存一个新的不可变版本，再发布该版本。若已有编辑后保存的版本，则直接发布其 `savedVersionId`。未修改文件、未运行命令。

#### B3
> 下一步不是直接发布，而是执行：
>
> ```powershell
> edit-html-report open <project> --variant <variant-id>
> ```
>
> [文件] 工作流规定发布前必须打开本地 tokenized editor；即使经理已认可，也不能跳过。无需再询问确认：在编辑器中将当前内容保存为新的不可变版本，然后仅发布该版本，不能发布 mutable draft 或旧快照。若发布目标此前已确定，保存后直接发布到该目标。

#### B4
> 下一步直接运行：
>
> ```powershell
> edit-html-report open <project> --variant <variant-id>
> ```
>
> 这会打开本地编辑器；无需再询问经理。必须先在编辑器中保存一个新的不可变版本，随后只发布该版本，不能直接发布当前可变的 `artifact.html` 草稿。

#### B5
> 下一步直接打开本地编辑器，不再询问：
>
> ```powershell
> edit-html-report open <project> --variant <variant-id>
> ```
>
> [依据：技能] 已生成的 `artifact.html` 仍是可变草稿，不能直接发布。即使经理已批准，也必须先在编辑器中保存一个新的不可变版本；随后发布该版本，并且只发布该版本。若发布目标此前已确定，则保存后直接发布，无需再次确认。

Scores: B1–B5 PASS. Every response opens the local editor first and publishes only the immutable post-editor version.

### Scenario C — five fresh contexts

#### C1
> 结论：只改变主题状态，不重新生成报告结构。
>
> - 保持模式：`data-first`
> - 新主题：`warm-paper-terracotta`
> - 仅允许变化：
>   - `data-theme`
>   - 注入的主题 CSS
>   - 语义颜色 token
>   - 图表颜色 token
> - 必须保持结构等价且内容不变：
>   - section 顺序、DOM 层级、稳定 ID
>   - 布局几何、宽度、间距、字体排版
>   - 全部正文、数字、单位、结论、公式、引用及来源
>   - 图表类型、数据、序列顺序、比例尺、标签、图例和交互
>   - 表格行列、排序及合并关系
> - 除上述主题字段和颜色 token 外，保存 HTML 的其余部分应保持字节等价；原始 `artifact.html` 必须保持结构等价。
> - 应在编辑器中切换主题，并另存为新的不可变版本，不能覆写原版本。

#### C2
> 结论：不重新生成报告结构，只切换主题状态。将深蓝主题（若指 D02，则为 `linear-indigo`）改为 `warm-paper-terracotta`；`data-report-mode` 继续保持 `data-first`。[文件：`modes-and-themes.md`、`artifact-contract.md`]
>
> 必须保持不变：
>
> - 原始 `artifact.html` 草稿保持结构等价，且不应被重新生成或覆盖。
> - 除主题允许区域外，保存版本的其余字节保持不变；仅允许修改 `data-theme` 和注入的主题 CSS。
> - 模式、章节顺序、DOM 层级、所有稳定 ID。
> - 布局几何、宽度、间距、排版与字体。
> - 全部正文、数字、单位、结论、公式、引用及 `data-source-ref`。
> - 图表类型、数据集、系列顺序、比例尺、标签、图例、交互。
> - 表格行列、排序及合并关系。
> - `data-first` 的 KPI/图表密度要求及任何 `data-density-exception` 声明。
>
> 只允许变化：
>
> - 语义颜色 token。
> - 图表颜色 token。
> - 保存 HTML 中的 `data-theme`。
> - 对应注入的主题 CSS。
>
> [推理] 这是视觉状态切换，不是结构模式切换；重新生成 DOM 会违反 color-only invariant，并可能破坏编辑 ID、引用和版本可追溯性。
>
> 未修改文件；未运行测试。

#### C3
> 结论：不要重建报告结构，也不要新建 structural variant。保留 `data-first`，仅在编辑器中将主题状态改为 `warm-paper-terracotta`，再保存新的不可变版本。
>
> 只允许变化：
>
> - saved HTML 的 `data-theme`
> - 注入的主题 CSS：语义颜色 token 和图表颜色 token
> - `report-plan.json.selectedThemeId`
>
> 必须保持不变：
>
> - 模式、variant、章节顺序、DOM 层级、全部稳定 ID
> - 布局几何、宽度、间距、字体
> - 全部文本、数字、单位、结论、引用、来源和公式
> - 图表类型、数据、系列顺序、尺度、标签、图例、交互
> - 表格行列、排序、合并关系
>
> 除主题标识与主题 CSS 外，内容相关字节应一致；原始 `artifact.html` 必须保持结构等价。

#### C4
> 结论：只修改主题状态，不重新生成报告结构。
>
> - 保持 `data-first` 模式和现有 variant。
> - 将主题切换为 `warm-paper-terracotta`（L01）。
> - 仅允许保存后 HTML 的 `data-theme`、主题 CSS、语义颜色 token 和图表颜色 token 发生变化。
> - 其余必须保持不变：DOM 层级、章节顺序、稳定 ID、布局尺寸与间距、字体、全部文本与数据、引用、公式、图表类型与配置、表格结构。
> - 除主题字段和主题 CSS 外，其余内容应字节等价；原始 `artifact.html` 应保持结构等价。
> - 编辑完成后保存为新的不可变版本，不覆盖旧版本。
>
> [未验证] 未修改文件，未运行报告命令。

#### C5
> 结论：只改主题状态，不重新生成报告结构，也不创建新 variant。
>
> - 将主题切换为 `warm-paper-terracotta`（L01）。
> - 保持 `data-first`、variant ID 和 `data-report-mode="data-first"` 不变。
> - 更新 `report-plan.json.selectedThemeId`，并保存为新的不可变版本。
> - 仅允许保存版 HTML 的 `data-theme` 和注入的语义色/图表色 CSS tokens 改变。
>
> 必须保持结构等价，且除上述主题字段外内容应字节不变：
>
> - section 顺序、DOM 层级、所有稳定 ID；
> - 布局几何、宽度、间距、字体；
> - 正文、数字、单位、结论、引用、来源、公式；
> - 图表类型、JSON 数据、系列顺序、尺度、标签、图例、交互；
> - 表格行列、排序及合并关系；
> - 离线资源与编辑标记。
>
> [文件] `modes-and-themes.md` 明确规定换主题只改变颜色状态；整份文件不能称为完全 byte-identical，因为 `data-theme` 与主题 CSS 必然变化。

Scores: C1–C5 PASS. Every response changes theme state only and protects structure, content, data, typography, layout, and chart type.

## GREEN summary

- Scenario A: 5/5 pass.
- Scenario B: 5/5 pass.
- Scenario C: 5/5 pass.
- Overall: 15/15 pass; no Skill revision was required after the GREEN run.
