# Edit HTML Report Skill V4 实施方案

## 目标

V4 以结构化内容为唯一事实源，彻底停止把 HTML 正则替换当作主编辑链路。项目 schema 为 4，程序版本为 4.0.0；V3 仅通过显式迁移层接入。

## 数据流与目录契约

`原始文档 → source-model → coverage-map → 用户确认模式 → report-model → Huashu presentation-plan → 确定性 artifact.html → 本地编辑器 → 不可变版本 → 本地/公开发布`

- 根目录：`project.json`、`source-model.json`、`coverage-map.json`、`analysis.json`、`deployments.json`、两个项目启动器。
- `source/` 与 `source-assets/`：原文及提取资源。
- `variants/<id>/`：variant、report-model、presentation-plan、artifact、草稿操作日志。
- `versions/<id>/`：不可变 HTML、模型快照和版本元数据。
- `publications/<id>/`：规范发布 HTML 与 publication 元数据。
- `.editor-runtime/`：可移动的轻量编辑器运行时；`.runtime/`：不打包的活动会话状态。

## 四个实施域

### 1. 本地编辑器与发布

后台 loopback 会话支持健康检查、端口复用、失效清理和重启；保存/发布/关页不停止。项目启动器按自身相对位置打开。发布历史统一记录版本、模式、主题、哈希、本地路径/URL、服务商、deployment ID 与状态，并从规范副本恢复。

### 2. 编辑与版本

使用稳定节点 ID、revision 和结构化 patch；409 阻止多标签静默覆盖。编辑按钮在“编辑/完成”切换，上下文工具条随区域类型出现。图表使用表格化数值编辑。草稿自动保存，保存版本创建不可变检查点；历史恢复创建后继版本；dirty 草稿禁止发布。

### 3. 内容、模式与 Huashu

提取 DOCX/PPTX/PDF/Markdown/HTML/TXT 的结构、顺序、资源和来源。coverage 锁定所有实质内容。数据优先保持原文骨架并提供高密度图表与分层交互；证据优先按判断—证据—解释—边界—来源组织。Huashu 仅生成组件/布局/交互/响应式计划，不修改事实、顺序或覆盖。

### 4. 主题

六套可见主题为暖纸赤陶、研究钴蓝、砂岩档案、线性靛蓝、海军蓝金、黑场信号橙；每套恰好八个序列色和完整语义状态。主题只改颜色。旧 `swiss-monochrome`、`ink-teal` 隐藏兼容并显式迁移。

## 实施顺序与验收

1. 模型/schema/迁移与失败测试。
2. 两种模式、presentation-plan、渲染器和主题。
3. 模型编辑、版本、后台会话和发布历史。
4. Skill/Agent 文档与安装产物。
5. 用《AI服务器报告.docx》验证原文顺序、十二种材料、区域/技术/价值链维度、图表互动和零关键遗漏。
6. 运行单元、Playwright、check、Skill quick_validate 和 npm pack；分域提交并创建 annotated tag `edit-html-report-v4.0.0`，不推送远端。
