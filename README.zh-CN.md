# PDF_GalaxAI

### 语义文献星云与 RAG 阅读工作台

[English](README.md) · [详细使用说明](docs/USER_GUIDE.md) · [图形学方法](GRAPHICS_RESEARCH.md)

PDF_GalaxAI 将 PDF 文献库转换为可交互的三维知识空间。每篇文献对应一颗具有程序化月面纹理和自转动画的星体，语义主题形成流动的体积星云，相似度连线展示文献之间的联系。

项目结合实时计算机图形学、文档解析和检索增强生成（RAG），支持从主题探索进入原文阅读，并通过可追溯引用验证问答结果。

这是一个在本机运行的 Web 应用，完整功能需要同时运行浏览器前端与 Python 后端。下载源码后，请按下文安装依赖并配置模型。

[界面总览](#界面总览) · [功能介绍](#核心功能) · [下载项目](#下载项目) · [环境要求](#环境要求) · [图形演示](#快速查看图形演示) · [完整部署](#完整安装与启动) · [常见问题](#常见问题)

## 界面总览

![PDF_GalaxAI 主界面：语义知识星云与检索问答控制台](docs/images/interface-overview.png)

主界面将语义知识星云与检索问答控制台放在同一工作空间中。按主题组织的文献节点和相似度连线支持跨文献探索，右侧控制台提供基于上下文的问答与明确的模型选择。选中文献后，可进一步查看文献详情并进入 PDF 阅读。

## 核心功能

| 功能 | 可以完成的任务 |
| --- | --- |
| PDF 文献管理与处理 | 上传或批量导入文献，提取文本与元数据，维护本地向量索引；可选 OCR 和 MinerU 用于较难解析的文献。 |
| 三维语义知识星云 | 探索主题分组，选中文献节点，观察文献之间的相似度连线。 |
| 基于上下文的 AI 问答 | 将文献加入对话，选择自适应、文献问答或通用对话模式；支持 Ollama、Gemini 和 OpenAI 兼容接口。 |
| 原文证据追溯 | 查看检索片段，通过引用打开候选 PDF 页，再结合原文核验回答。 |
| PDF 阅读 | 在阅读器中查看论文、围绕当前论文提问并高亮候选原文；支持图像输入的模型还可接受公式和图表截图提问。 |
| 界面与模型配置 | 切换中英文、按文件名搜索、调整画质，并配置问答模型。 |

星云采用自定义 GLSL 体积渲染、GPU 粒子动画和程序化星体表面，视觉编码近似表达语义结构，不代表论文质量。技术细节见[图形学方法](GRAPHICS_RESEARCH.md)。

## 下载项目

以下方式任选一种，只有克隆方式需要 Git。

**不安装 Git：下载 ZIP**

1. 打开[项目仓库](https://github.com/zhD1dqz/PDF_GalaxAI)。
2. 点击 **Code → Download ZIP**，然后解压。
3. 在包含 `package.json`、`frontend/` 和 `backend/` 的项目目录中打开终端。下文命令均在该目录执行。

**已安装 Git：克隆仓库**

```bash
git clone https://github.com/zhD1dqz/PDF_GalaxAI.git
cd PDF_GalaxAI
```

源码不包含个人 PDF、已安装的依赖、模型权重、本地配置和向量数据库。下载后需要安装依赖，并准备自己的文献。

## 环境要求

| 环境或资源 | 图形演示 | 完整 PDF / RAG 应用 |
| --- | --- | --- |
| Node.js 与 npm | 必需，Node.js 20.19+ 或 22.12+ | 必需，版本要求相同 |
| 支持 WebGL 的浏览器 | 必需 | 必需 |
| Python | 不需要 | Python 3.11+，首次安装建议使用 3.11 或 3.12 |
| Embedding 模型 | 不需要 | 神经语义检索需要；首次使用下载，也可指定本地模型目录 |
| 自己的 PDF 文献 | 不需要，使用模拟节点 | 需要，用于建立真实文献库 |
| 问答模型 | 不需要 | AI 回答需要已运行的 Ollama 模型或已配置的云端/API 模型 |
| Tesseract / MinerU | 不需要 | 可选，OCR 或高级解析需要单独安装 |

Node.js 可从 [nodejs.org](https://nodejs.org/en/download) 下载，Python 可从 [python.org](https://www.python.org/downloads/) 下载。使用本地问答时，还需从 [ollama.com](https://ollama.com/download) 安装 Ollama。Windows 安装 Python 时勾选 **Add to PATH**，安装后重新打开终端。

先检查环境：

```bash
node --version
npm --version
```

完整应用还需检查 Python：Windows 使用 `python --version`，macOS/Linux 使用 `python3 --version`。安装依赖和首次下载模型通常需要联网，云端问答需要可用网络及自己的服务凭据。本地模型的内存占用与速度取决于模型和设备，这里不提供固定硬件性能保证。

**首次体验建议：** 只想查看可视化效果，可先运行图形演示；需要上传真实文献、阅读 PDF 和使用 RAG，则完成下方完整部署。

## 快速查看图形演示

演示模式使用四个主题、44 个节点的确定性模拟数据，只需启动前端，无需后端、PDF 或 API Key。

```bash
npm ci
npm run demo
```

浏览器未自动打开时，访问 `http://localhost:3000/?graphicsDemo=1`。Windows 也可以双击 `GRAPHICS_DEMO.cmd`。

演示节点用于展示图形效果。真实文献阅读与 RAG 需要下面的完整部署。

## 完整安装与启动

### 1. 安装依赖

在项目根目录执行。`.venv` 将后端依赖与其他项目隔离；这里直接调用其中的 Python，无需激活虚拟环境。

**Windows PowerShell**

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm ci
Copy-Item backend\.env.example backend\.env
```

**macOS / Linux**

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r backend/requirements.txt
npm ci
cp backend/.env.example backend/.env
```

只在首次安装时复制模板，之后编辑自己的 `backend/.env`。

### 2. 配置模型

模板采用轻量的 `sentence-transformers/all-MiniLM-L6-v2`，主题数量设为 4。需要更大的多语言模型时，可改为 `SCHOLAR_ST_MODEL=BAAI/bge-m3`。首次使用会下载模型，模型权重不随源码分发。

**问答方案任选一种，不必全部配置。**

**本地 Ollama：** 安装并启动 Ollama，下载配置中指定的模型，然后确认它能进行简单对话：

```bash
ollama pull qwen2.5:3b
ollama run qwen2.5:3b
```

确认模型可用后退出交互对话，但保持 Ollama 服务运行。模板使用 `SCHOLAR_LLM_PROVIDER=local` 和 `SCHOLAR_OLLAMA_MODEL=qwen2.5:3b`。

**云端 Gemini：** 在 `backend/.env` 中设置 `SCHOLAR_LLM_PROVIDER=gemini`，填写自己的 `GEMINI_API_KEY`，并通过 `SCHOLAR_GEMINI_MODEL` 指定账号可用的模型，然后重启后端。

**OpenAI 兼容接口：** 启动应用后，在“模型管理”中添加服务的 Base URL、模型 ID 和 API Key，测试连接后选择该模型进行问答。实际凭据只保存在本地配置中。

Embedding 模型负责寻找相关文献和文本片段，问答模型负责生成回答。即使使用云端问答，也仍需要 embedding 模型支持神经语义检索。首次下载模型和处理文献可能较慢，可查看后端日志确认进度。

### 3. 分别启动后端与前端

**Windows，终端 A**

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

**macOS / Linux，终端 A**

```bash
.venv/bin/python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

**终端 B**

在同一项目目录打开第二个终端，保持终端 A 运行。

```bash
npm run dev
```

访问 `http://localhost:3000/`；如果 Vite 因端口占用选择了其他端口，以终端输出的地址为准。后端健康检查地址为 `http://127.0.0.1:8000/api/health`，接口文档地址为 `http://127.0.0.1:8000/docs`。

依赖安装完成后，Windows 用户也可双击 `PDF_GalaxAI.cmd`。启动器优先使用项目的 `.venv`，首次下载模型或导入文献时需要额外等待。

### 4. 完成第一次文献操作

1. 上传一至两篇具有可读文本的 PDF，等待处理完成。新安装的真实文献库最初是空的。
2. 旋转星云并选中文献节点，查看详情。
3. 将文献加入对话，选择已配置的问答模型和“文献问答”模式，提出一个应能从该论文中找到答案的问题。
4. 查看来源片段，并点击引用进入 PDF 阅读器。页码匹配采用启发式方法，仍需自己核对原文。
5. 如果出现 embedding 模型不一致提示，按界面提示重建向量索引。正常上传新文献时采用增量索引。

手动启动时，在两个终端中分别按 **Ctrl+C** 停止服务；Windows 启动器则需停止两个服务窗口。PDF 和索引保留在 `backend/data/`，再次启动可以继续使用。

### 可选解析工具

具有正常文本层的 PDF 可直接解析。扫描版可能需要 Tesseract 和相应语言包；安装 Python 的 `pytesseract` 并不等于安装 OCR 引擎。MinerU 也需单独安装。系统无法找到可执行文件时，通过 `SCHOLAR_TESSERACT_CMD` 或 `SCHOLAR_MINERU_CMD` 指定路径。详细操作见[使用说明](docs/USER_GUIDE.md)。本项目在 Python 3.13 及以上版本采用 PCA，关闭 UMAP。

### 部署范围

以上步骤用于在自己的电脑上运行。GitHub 托管源码和文档，上传文件夹不会自动启动网站。`npm run build` 将前端构建到 `dist/`，PDF 处理和 RAG 仍需要后端与模型配置。公开在线服务还需要单独部署后端并设置访问控制，本地部署说明不包含这部分生产配置。

## 交互方式

| 操作 | 控制方式 |
| --- | --- |
| 旋转视角 | 鼠标左键拖动 |
| 平移星云 | 鼠标中键拖动 |
| 缩放 | 鼠标滚轮 |
| 查看文献详情 | 左键点击星体 |
| 将文献加入对话 | 右键点击星体 |
| 定位文献 | 按文件名搜索 |
| 调整渲染开销 | 低 / 高画质切换 |
| 切换界面语言 | 中文 / 英文选择器 |

通过界面上传 PDF，或在后端启动前，将命名 PDF 放入 `backend/data/files/` 或 `backend/data/inbox/`。`files` 中的源文件保持原位，`inbox` 导入成功的文件移动到 `_processed` 子目录。

后端自动创建数据目录，并使用内容指纹防止重复导入。

## 技术结构

| 层级 | 技术 |
| --- | --- |
| 界面 | React、TypeScript、Vite、Tailwind CSS |
| 实时图形 | Three.js、React Three Fiber、自定义 GLSL、Bloom |
| PDF 处理 | FastAPI、PyMuPDF、可选 Tesseract / MinerU |
| 语义分析 | Sentence Transformers、KMeans、UMAP/PCA、TF-IDF 回退 |
| 检索问答 | Chroma、混合重排序、Ollama / Gemini / OpenAI 兼容接口 |

文献解析产生元数据和文本片段，embedding 分别服务于主题聚类、空间布局和全文检索。检索结果经 LLM 生成带引用的回答，并与星图和 PDF 阅读器联动。完整流程图见[英文 README](README.md#architecture)。

## 配置与恢复

| 配置项 | 作用 |
| --- | --- |
| `SCHOLAR_ST_MODEL` | 语义模型 ID 或本地模型目录 |
| `SCHOLAR_OFFLINE` | 设为 `1` 时仅使用本地或缓存模型 |
| `SCHOLAR_CLUSTER_COUNT` | 指定主题数，或设为 `auto` 自动选择 |
| `SCHOLAR_OCR_ENABLED` | `auto`、`force` 或 `off` |
| `SCHOLAR_LLM_PROVIDER` | 默认问答模型提供方 |
| `GEMINI_API_KEY` | 可选 Gemini 凭据 |

更换 embedding 模型后，重启后端并通过界面重建索引。模型不可用时，星图采用 TF-IDF 回退布局；完整的语义 RAG 仍需要可用的 embedding 模型。

旧文献库出现原文件缺失、坐标重叠时，先关闭后端，再执行：

```bash
python backend/recover_library.py --archive-missing
```

脚本会导入本地 PDF、重算布局，并将缺少原 PDF 的旧记录保存在 `backend/data/backups/` 中，完成后重新启动项目。

## 常见问题

| 现象 | 检查与处理 |
| --- | --- |
| 找不到 `node`、`npm`、`python` 或 `python3` | 安装对应环境，检查 PATH，并重新打开终端；使用当前平台正确的 Python 命令。 |
| Python 提示模块缺失 | 使用启动后端的同一个 `.venv` Python 安装 `backend/requirements.txt`。 |
| 前端提示后端不可用 | 保持终端 A 运行，检查 `http://127.0.0.1:8000/api/health`；Vite 代理默认连接后端 8000 端口。 |
| 启动后星云为空 | 上传自己的 PDF，源码不包含截图中的文献库；查看模拟节点可用 `npm run demo`。 |
| 首次启动或上传较慢 | 查看后端日志，确认是否正在下载 embedding 模型或处理 PDF；模型权重不随源码分发。 |
| 问答失败或没有来源证据 | 检查所选模型是否可用，上传相关文献，并处理索引提示；通用对话模式不检索文献证据。 |
| 云端请求失败 | 在模型管理中核对 API Key、Base URL、模型 ID 和网络/代理设置，并使用测试连接。 |
| PDF 文本缺失或乱码 | 检查原文文本层，安装带相应语言包的 Tesseract，或配置可选 MinerU。 |
| 三维画面较卡 | 选择低画质模式并使用支持 WebGL 的浏览器；更大文献库和本地模型会增加资源开销。 |

`backend/.env`、个人 PDF、模型权重和生成的向量数据库不应提交到仓库，源码包也排除这些内容。文件与向量保存在本地；使用云端模型时，选中的上下文及提交的图片会发送给所配置的服务。

仍无法解决时，保留后端错误日志和浏览器控制台报错，参考[详细使用说明](docs/USER_GUIDE.md)。

## 开发与打包

```bash
npm run typecheck
npm run build
python tests/test_layout_recovery.py
python scripts/package_github.py
```

回归检查覆盖路径解析、导入去重、回退布局、节点间距与主题数量，不依赖下载好的模型或个人 PDF。

`tests/verify_live_library.py` 是针对本地 24 篇测试文献的集成检查，需要前后端运行。数据要求见[测试数据说明](docs/TEST_DATA.md)。

源码包生成到 `release/`，上传步骤见[GitHub 上传说明](docs/GITHUB_UPLOAD.md)。

## 项目边界

本项目是可运行的图形可视化与 RAG 原型，星云和光晕采用艺术化近似。星体纹理包含文献身份变化，不代表论文质量。主题与空间距离是语义关系的近似，指定主题数决定展示粒度。

问答结果需要结合引用原文核对。大规模渲染性能评测与正式用户实验尚待开展。

源码包不包含个人 PDF、向量库、模型权重、浏览器配置和凭据。克隆后需要自行下载模型并导入文献。
