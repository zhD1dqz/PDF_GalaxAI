# GitHub 上传说明

项目当前提供可上传的源码包，尚未创建或推送远程 GitHub 仓库。

## 方式一：使用打包源码

1. 解压 `release/PDF_GalaxAI-github.zip`。
2. 打开解压后的 `PDF_GalaxAI` 文件夹，确认其中有 `README.md`、`frontend`、`backend` 等源码。
3. 在 GitHub 创建仓库，建议名称为 `PDF_GalaxAI`。
4. 通过仓库的上传文件入口上传源码目录内的文件。若上传操作不保留隐藏文件或目录结构，使用下面的 Git 方式。
5. 压缩包可以作为发布附件保存，仓库首页应直接包含源码与 README。

可用于仓库 About 的说明：

> Semantic literature visualization with custom GLSL nebulae, GPU particles, procedural planets, and citation-aware RAG.

可用 Topics：`webgl`、`threejs`、`glsl`、`data-visualization`、`rag`、`fastapi`、`pdf`、`digital-media`。

## 方式二：使用 Git 推送

在解压后的源码目录运行以下命令。将地址中的 `YOUR_USERNAME` 替换为自己的 GitHub 用户名，仓库名按实际填写。远程仓库应为空。

```bash
git init
git branch -M main
git add .
git status --short
git commit -m "Initial release of PDF_GalaxAI"
git remote add origin https://github.com/YOUR_USERNAME/PDF_GalaxAI.git
git push -u origin main
```

首次提交可能需要设置自己的 Git 用户名和邮箱，首次推送可能需要完成 GitHub 认证。以上步骤由用户在自己的 GitHub 账户中执行。

## 上传内容

`.gitignore` 和打包脚本会排除以下本地内容：

- `.env` 与实际 API 凭据。
- `backend/data/` 中的 PDF、元数据、Chroma 数据库和模型管理配置。
- `backend/models/` 中的模型权重。
- `node_modules/`、虚拟环境、编译产物、缓存和浏览器配置。
- `release/` 中的压缩包。

保留 `backend/.env.example`，它只包含通用配置和空凭据。不要将 `.env` 改名后上传，也不要手动把数据目录加进仓库。

若后续决定公开许可方式，再添加相应的 `LICENSE` 文件。当前打包没有替项目选择许可证。

## 重新打包

在项目根目录运行：

```bash
python scripts/package_github.py
```

脚本会检查上传文件，生成并校验一个新的源码 ZIP。已有同名包会保留，新包添加时间戳。
