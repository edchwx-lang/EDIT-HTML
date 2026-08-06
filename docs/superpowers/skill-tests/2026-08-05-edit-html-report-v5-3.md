# Edit HTML Report V5.3 AI 服务器报告验收证据

## 验收范围

- 源文件：`C:\Users\edchw\Documents\edit-ppt\AI服务器报告-v520-verify-20260805\source\AI服务器报告.docx`
- 自动化：`e2e/v5-3-ai-server-report.spec.js`
- 工作区：`C:\Users\edchw\AppData\Local\Temp\edit-html-v53-ai-server-acceptance`
- 原始证据：`test-results/v5-3-ai-server-report-V5-3-5e13f-ditor-and-local-publication/evidence.json`
- 运行时间：2026-08-06 12:46（Asia/Shanghai）

测试复制源文件后，通过生产接口实际执行 project create、variant create、interview import、design prepare、三个 candidate import、review prepare、selection confirm、final import、instrument、validate、editor server、save/restore、local publish 与 reveal。源文件本身未修改。

## Fresh evidence

聚焦命令：

```text
npx playwright test e2e/v5-3-ai-server-report.spec.js --reporter=line
1 passed (12.6s)
```

完整 release gate 命令结果见下方“完整套件”。

| 证据 | 结果 |
| --- | --- |
| doctor | 四个版本均为 `5.3.0`；runtime `current`；无 warning；未出现 `4.0.0` |
| source SHA-256 | `2396d495c83d49a6d28915d58ebb653c361bf1b49e80051bdd094ac004137069` |
| Source Pack SHA-256 | `ce86dd579ea850202a3371f54cd8b66fb6b11b6e4da9613008c4443558e6d09f` |
| interview | 仅 `purpose`、`contentWeight` 两题；上限 3；无无依据第三题 |
| Huashu input receipt | `9b27174c969a047a699a15fd8ef56ee13fb0df5bebf7d0dae3c20de75f88c0af` |
| 候选 | 3 个真实 HTML；每个恰好 1 张 1440×900 non-fullPage desktop PNG；narrative/visualization/interaction 均不同 |
| 选中方向 | `network-atlas`；candidate SHA `ab6f93d3a55dc1bdcc0a47e06e5366be92555b7baab3a1bb6da000d0142d271f` |
| final site | payload SHA `b4237428b1fadf4e7df37f652d5245b9f279ab9001f989e8843f3d244834ff95`；desktop/mobile 与交互通过；覆盖 189 个实质性 source units |
| final browser verification | receipt SHA `b112c6ba8ee857f2fcf2d2e4a602193fcd373da7eb8c5dacae4eb2e4f04b7d24`；Playwright 验证 1440×900、390×844、无横向溢出及核心交互 |
| Huashu preservation | body before/after 均为 `f1930ccc87448de4ed450b777fcbe50508cc01ea056575346df6d5dc3b8fc821` |
| instrumented artifact | SHA `3429e419c1dffb2482e44b59ebac6dc39790775cd9f9bfbeae33a4e5a9617e06` |
| editor | title、body、material detail、image、chart、block、undo、palette、save、restore 均通过，并断言 viewport 未重置 |
| 发布 | 每个版本 4 个 primary actions；本地 `report.html` 存在；SHA `b1467745cd8f6dd0256deb96381f47d783e494650ccc02ef6d08c2b18b18f086` |

关键耗时（ms）：create project 1436；doctor 1027；design prepare 448；三个 candidate 434/310/384；review 269；final author/import 394/250；final verification 268；instrument 215；validate 98；responsive checks 204。

## 证据路径

- capacity timeline：`C:\Users\edchw\AppData\Local\Temp\edit-html-v53-ai-server-acceptance\project\variants\8a770de6-5b9f-4a50-ae8b-0430b430263f\design\candidates\capacity-timeline\screenshots\desktop.png`
- material ledger：`C:\Users\edchw\AppData\Local\Temp\edit-html-v53-ai-server-acceptance\project\variants\8a770de6-5b9f-4a50-ae8b-0430b430263f\design\candidates\material-ledger\screenshots\desktop.png`
- network atlas：`C:\Users\edchw\AppData\Local\Temp\edit-html-v53-ai-server-acceptance\project\variants\8a770de6-5b9f-4a50-ae8b-0430b430263f\design\candidates\network-atlas\screenshots\desktop.png`
- final desktop：`C:\Users\edchw\AppData\Local\Temp\edit-html-v53-ai-server-acceptance\huashu-output\network-atlas-final\screenshots\desktop.png`
- final mobile：`C:\Users\edchw\AppData\Local\Temp\edit-html-v53-ai-server-acceptance\huashu-output\network-atlas-final\screenshots\mobile.png`
- publication：`C:\Users\edchw\AppData\Local\Temp\edit-html-v53-ai-server-acceptance\project\publications\9d568364-85b3-41e3-a775-a8aa11e1e8ea\report.html`

## 完整套件

```text
npm test
205 passed, 0 failed (34.9s; final independent verification)

npm run check
exit 0 (0.7s)

npm run check:editor-boundary
editor boundary intact (16 files)

npx playwright test --reporter=line
7 passed (13.4s; final independent verification)
```

## 未自动验证

没有声称 Windows Explorer 的窗口或选中态已被视觉确认。自动化确认 reveal 生产端点收到本地 publication 的绝对 `report.html` 路径、目标存在且接口成功；主代理随后已对该真实 publication 调用 `explorer.exe /select,<absolute report.html>` 并收到 `requested: true`，窗口与选中态仍需用户肉眼确认。
