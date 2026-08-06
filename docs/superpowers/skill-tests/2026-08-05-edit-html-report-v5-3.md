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
| Huashu input receipt | `110a570a5805f1696db6b94368951493b3034721da92518a10cff18ab23e1393` |
| 候选 | 3 个真实 HTML；每个恰好 1 张 1440×900 non-fullPage desktop PNG；narrative/visualization/interaction 均不同 |
| 选中方向 | `network-atlas`；candidate SHA `494bbc68ddf0cfd6ebda3431f2adac9252eca2c064ffc71c61a7a14da0c0364e` |
| final site | payload SHA `448f13f558ea303e05a2d312b9e78b24c3ef8b595798ed88ccd7b05baa1b1b73`；desktop/mobile 与交互通过；覆盖 189 个实质性 source units |
| Huashu preservation | body before/after 均为 `f1930ccc87448de4ed450b777fcbe50508cc01ea056575346df6d5dc3b8fc821` |
| instrumented artifact | SHA `31508e4ce4b49cc3d0dada290d9de0dfcff9b00b59d1690e9c1056b45a7c7151` |
| editor | title、body、material detail、image、chart、block、undo、palette、save、restore 均通过，并断言 viewport 未重置 |
| 发布 | 每个版本 4 个 primary actions；本地 `report.html` 存在；SHA `c61748ec8fb7566ddadb1bbe67a05de9b50dd3bdb262f47079e1edf06451429c` |

关键耗时（ms）：create project 755；doctor 425；design prepare 209；三个 candidate 250/232/219；review 100；final author/import 371/128；instrument 53；validate 25；responsive checks 139。

## 证据路径

- capacity timeline：`C:\Users\edchw\AppData\Local\Temp\edit-html-v53-ai-server-acceptance\project\variants\70bb8d34-c4a1-4596-b821-1d5e3e6ce97c\design\candidates\capacity-timeline\screenshots\desktop.png`
- material ledger：`C:\Users\edchw\AppData\Local\Temp\edit-html-v53-ai-server-acceptance\project\variants\70bb8d34-c4a1-4596-b821-1d5e3e6ce97c\design\candidates\material-ledger\screenshots\desktop.png`
- network atlas：`C:\Users\edchw\AppData\Local\Temp\edit-html-v53-ai-server-acceptance\project\variants\70bb8d34-c4a1-4596-b821-1d5e3e6ce97c\design\candidates\network-atlas\screenshots\desktop.png`
- final desktop：`C:\Users\edchw\AppData\Local\Temp\edit-html-v53-ai-server-acceptance\huashu-output\network-atlas-final\screenshots\desktop.png`
- final mobile：`C:\Users\edchw\AppData\Local\Temp\edit-html-v53-ai-server-acceptance\huashu-output\network-atlas-final\screenshots\mobile.png`
- publication：`C:\Users\edchw\AppData\Local\Temp\edit-html-v53-ai-server-acceptance\project\publications\fda52aa0-1180-44b8-ab44-4bcc8ff39ce8\report.html`

## 完整套件

```text
npm test
200 passed, 0 failed (66.83s; shell wall time 68.2s)

npm run check
exit 0 (0.7s)

npm run check:editor-boundary
editor boundary intact (15 files) (0.7s)

npx playwright test --reporter=line
7 passed (8.4s; shell wall time 9.9s)
```

## 未自动验证

没有声称 Windows Explorer 的窗口或选中态已被视觉确认。自动化仅确认 reveal 生产端点收到本地 publication 的绝对 `report.html` 路径、目标存在且接口成功；真实 Explorer 可见 smoke 由主代理最后人工执行。
