# EDIT-HTML V5.5 安装与交付说明

本发行版内置真实 Huashu Design Skill（173 个文件及 MIT 许可证），不需要另外安装 Huashu。README 按用户要求保留仓库原版；V5.5 安装以本文和 `skills/edit-html/SKILL.md` 为准。

## Windows 安装

1. 安装 Node.js 20 或更高版本（含 npm），解压 ZIP 到本地目录。
2. 在解压后的 `EDIT-HTML-v5.5.0` 目录打开 PowerShell，执行：

```powershell
npm ci
npm run install:local
edit-html-report doctor --json
```

安装器会先运行测试，然后安装独立的全局 npm 副本及 Codex Skill；不是指向解压目录的链接。安装成功后解压目录可以移动，不影响已安装命令。旧 Skill 会备份到 Skill 发现目录外。

首次安装需要联网下载 npm 依赖。浏览器二进制不包含在 ZIP 内；没有可用浏览器时安装器下载 Chromium。有本机 Edge 时可先指定：

```powershell
$env:EDIT_HTML_BROWSER = 'msedge'
npm run install:local
```

`doctor --json` 的 `workflowReady: true` 才代表完整生成流程可用；仅 `basicReady: true` 不足。自定义浏览器也可通过 `EDIT_HTML_BROWSER_EXECUTABLE_PATH` 指定绝对路径。

## 版本及验证边界

- npm 包、工具、发布与设计流水线：5.5.0。
- Artifact contract 与 editor runtime：5.4.0（兼容边界，非漏升级）。
- 用户只回答内容问题，看到三套真实截图后选择 A/B/C；Huashu 自主设计。
- 本机已完成安装、隔离发行安装和真实 PDF 网页生成验收。尚未验证另一台实体电脑或 macOS。
- Huashu 可选视频、配音、PPT 导出依赖和凭证不包含在 HTML 安装流程内。
- 本包不包含个人报告项目、原始材料、node_modules、浏览器二进制或认证信息。

## 已知问题

真实 PDF 验收发现签章前预检与后置审计对数字单位空格、跨标签百分号的归一化不完全一致，可能误报数据来源缺失。本次验收网页通过等值排印调整并重走官方流程后通过审计；V5.5 工具本身未修复该规则差异。不要通过删除签章凭证或关闭审计绕过。后续应统一两套数字规则并增加回归测试。
