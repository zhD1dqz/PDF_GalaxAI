# 本地测试文献说明

图形演示模式与真实文献测试是两套数据。`?graphicsDemo=1` 使用前端生成的 44 个模拟节点，不对应实际 PDF。

本地集成检查使用 24 篇真实文献，覆盖四个主题，每类 6 篇。PDF 不随源码分发。

## 参考文献集合

| 主题 | 文献 |
| --- | --- |
| 图形学与三维渲染 | NeRF, Mip-NeRF, Plenoxels, Instant Neural Graphics Primitives, DreamFusion, 3D Gaussian Splatting |
| 多模态学习 | CLIP, BLIP, BLIP-2, Flamingo, ImageBind, Visual Instruction Tuning |
| 检索与 RAG | Retrieval-Augmented Generation, Dense Passage Retrieval, REALM, ColBERT, Contriever, HyDE |
| 文档理解与 OCR | LayoutLM, LayoutLMv2, LayoutLMv3, DocFormer, Donut, Nougat |

可以自行准备上述文献，或用自己的文献测试日常功能。若要运行 `tests/verify_live_library.py`，需要一个仅包含 24 篇文献的独立测试库，并将命名源 PDF 放在 `backend/data/files/`，以便脚本比对文件内容。

## 验证流程

1. 先停止后端，确认使用的是测试数据目录，并备份已有数据。
2. 在 `backend/.env` 中设置 `SCHOLAR_CLUSTER_COUNT=4`，配置可用的 embedding 模型。
3. 放入命名 PDF，启动后端，等待导入和索引完成，再启动前端。
4. 执行 `python tests/verify_live_library.py`。

脚本检查四个聚类与四种颜色、24 个独立坐标、最小星体间距、语义连线、PDF 文件访问、全文索引和重复扫描去重。它会调用一次扫描接口，适合测试文献库。

当前参考库检查结果为 24 篇文献、4 个主题、60 条连线，全部原文和全文索引可用。这是功能检查记录，不是用户实验或渲染性能基准。

## 无数据回归检查

`python tests/test_layout_recovery.py` 使用临时目录和模拟语义向量，不需要以上 PDF，也不需要下载模型权重。一般代码变更优先运行这项检查。
