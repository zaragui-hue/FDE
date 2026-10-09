# FDE 刷题手册

这是一个可在手机和电脑浏览器打开的静态刷题网页，使用 Excel 题库中的 210 道题：80 道单选、40 道多选、80 道判断、10 道简答。

## 使用方式

- **看解答**：打开题目就能看到答案、解析或简答题评分标准。
- **刷题**：先作答，提交后核对答案。简答题查看参考答案后自行选择「会／模糊／不会」。
- **错题复习**：答错的客观题、标为「模糊／不会」的简答题会进入复习列表；重做正确后移除。
- **本机进度**：不需要登录。记录保存在当前浏览器中，不会自动同步到另一台设备。可在「备份进度」导出 JSON，再到另一台设备导入。题库更新后，不兼容的进度文件会被拒绝。

题目和答案会随网页公开。原始 Excel 文件不在 Git 仓库和网站发布目录中。

## 本地预览

直接打开 [`quiz-app/index.html`](quiz-app/index.html) 即可使用。也可以在项目目录运行：

```sh
python3 -m http.server 8765 --directory quiz-app
```

然后访问 `http://127.0.0.1:8765/`。本地服务器只用于预览，不参与正式使用。

## 从 Excel 更新题库

源工作簿放在 `人工智能应用FDE工程师题库/人工智能应用FDE工程师测试题目 260827.xlsx`。安装 `openpyxl` 后运行：

```sh
python3 scripts/export_questions.py
```

脚本会校验题型数量、题目 ID、答案和解析，并生成 `quiz-app/questions.json` 与 `quiz-app/questions.js`。提交这两个生成文件即可更新网页题库，不要提交原始 Excel。

## 发布到 GitHub Pages

仓库中的 [Pages 工作流](.github/workflows/pages.yml) 会在 `main` 分支的网页文件更新时发布 `quiz-app/`，也可以在 Actions 页面手动运行。创建 GitHub 仓库并推送代码后，在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。首次部署完成后，GitHub Pages 页面会显示网址。

工作流只上传 `quiz-app/`，因此 `docs/`、脚本和原始 Excel 不会出现在网站上。GitHub 免费账户的 Pages 可用于公开仓库；进度仍只保存在各自浏览器中。
