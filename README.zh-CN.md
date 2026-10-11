# PDF_GalaxAI

### 语义文献星云与 RAG 阅读工作台

[English](README.md) · [详细使用说明](docs/USER_GUIDE.md) · [图形学方法](GRAPHICS_RESEARCH.md)

PDF_GalaxAI 将 PDF 文献库转换为可交互的三维知识空间。每篇文献对应一颗具有程序化月面纹理和自转动画的星体，语义主题形成流动的体积星云，相似度连线展示文献之间的联系。

项目结合实时计算机图形学、文档解析和检索增强生成（RAG），支持从主题探索进入原文阅读，并通过可追溯引用验证问答结果。

## 核心功能

- **语义视觉编码**：KMeans 聚类决定星云颜色，UMAP/PCA 生成空间坐标，簇间分离与碰撞修正保证布局可读。星体尺寸映射文献向量与聚类中心的相似度。
- **自定义 GLSL 星云**：在对象空间中对动态 FBM 密度场执行射线步进与透明度累积，低、高画质分别采用最多 28、46 次体积采样。
- **GPU 粒子动画**：通过单个 `THREE.Points` 系统提交粒子，在顶点着色器中计算运动和亮度变化。
- **程序化文献星体**：稳定文献指纹控制月面细节、自转速度与轴倾角，连续径向光晕从边缘向外逐渐变暗、透明并降低饱和度。
- **证据联动阅读**：检索命中与星体高亮联动，引用可打开对应 PDF 页。多模态模型支持针对公式、图表截图提问。
- **完整文献流程**：PDF 上传、批量导入、OCR、可选 MinerU 解析、Chroma 持久化索引、中英文界面及模型管理。

## 快速查看图形演示

演示模式使用四个主题、44 个节点的确定性模拟数据，只需启动前端，无需后端、PDF 或 API Key。

```bash
npm ci
npm run demo
```

浏览器未自动打开时，访问 `http://localhost:3000/?graphicsDemo=1`。Windows 也可以双击 `GRAPHICS_DEMO.cmd`。

演示节点用于展示图形效果。真实文献阅读与 RAG 需要下面的完整部署。

## 完整安装与启动

### 环境要求

- Node.js 20.19+ 或 22.12+
- Python 3.11+ 和支持 WebGL 的浏览器
- 可下载或已准备好的本地 embedding 模型
- 问答功能需要本地 Ollama 或可用的云端模型

Tesseract 和 MinerU 是可选的外部工具。Python 3.13 及以上版本在本项目中采用 PCA，避免 UMAP 兼容性问题。

### 1. 安装依赖

在项目根目录执行。

**Windows PowerShell**

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm ci
Copy-Item backend\.env.example backend\.env
```

**macOS / Linux**

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm ci
cp backend/.env.example backend/.env
```

只在首次安装时复制模板，之后编辑自己的 `backend/.env`。

### 2. 配置模型

模板采用轻量的 `sentence-transformers/all-MiniLM-L6-v2`，主题数量设为 4。需要更大的多语言模型时，可改为 `SCHOLAR_ST_MODEL=BAAI/bge-m3`。首次使用会下载模型，模型权重不随源码分发。

使用本地问答时，准备配置中指定的 Ollama 模型：

```bash
ollama pull qwen2.5:3b
```

也可在 `.env` 中填写自己的 Gemini Key，或在界面“模型管理”中添加 OpenAI 兼容接口。

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

```bash
npm run dev
```

访问 `http://localhost:3000/`。后端健康检查地址为 `http://127.0.0.1:8000/api/health`。

依赖安装完成后，Windows 用户也可双击 `PDF_GalaxAI.cmd`。启动器优先使用项目的 `.venv`，首次下载模型或导入文献时需要额外等待。

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
