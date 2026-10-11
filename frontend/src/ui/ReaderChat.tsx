import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { queryVision, queryWithProvider, type AssistantMode } from '../api/client';
import type { Paper } from '../types/scholar';
import MarkdownMessage from './MarkdownMessage';
import ModelPicker from './ModelPicker';
import { useLanguage } from '../i18n/LanguageContext';

interface Props {
  paper: Paper;
  llmProvider: string;
  onProviderChange: (id: string) => void;
  onLocateSnippet?: (snippet: string, page?: number | null) => void;
}

type Msg = {
  role: 'user' | 'ai';
  text: string;
  textEn?: string;
  imagePreview?: string; // dataURL 缩略图
  citeDetails?: Array<{ paper_id: string; chunk_id?: string; snippet?: string; page?: number | null }>;
};

type CiteDetail = NonNullable<Msg['citeDetails']>[number];

/**
 * 深度阅读侧边的轻量对话面板。
 * - 默认锁定当前论文作为 RAG 目标（把文献信息拼进 question 前缀）。
 * - 独立于全局 chat：关闭阅读器即丢弃，避免和左侧主对话互相污染。
 * - 支持截图提问：按钮上传 / 粘贴板粘贴 → 调用 queryVision（需多模态模型）。
 */
export default function ReaderChat({ paper, llmProvider, onProviderChange, onLocateSnippet }: Props) {
  const { language, tr } = useLanguage();
  const normalizeAnswerText = (
    raw: string,
    details: Array<{ paper_id: string; chunk_id?: string; snippet?: string }> = [],
  ) => {
    const firstIndexByPaper = new Map<string, number>();
    details.forEach((d, i) => {
      if (!d?.paper_id || firstIndexByPaper.has(d.paper_id)) return;
      firstIndexByPaper.set(d.paper_id, i + 1);
    });
    let t = raw || '';
    t = t.replace(/\[CITE:([^\]]+)\]/gi, (_m, pid) => {
      const idx = firstIndexByPaper.get(String(pid).trim());
      return idx ? `[${idx}]` : '';
    });
    t = t.replace(/(?:\(|（)?\s*paper_id\s*=\s*([A-Za-z0-9_-]+)\s*(?:\)|）)?/gi, (_m, pid) => {
      const idx = firstIndexByPaper.get(String(pid).trim());
      return idx ? `[${idx}]` : '';
    });
    t = t.replace(/(?:\(|（)?\s*chunk_id\s*=\s*([A-Za-z0-9_-]+)\s*(?:\)|）)?/gi, '');
    t = t.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
    return t;
  };
  const citationTerms = (text: string) => {
    const raw = (text || '').toLowerCase();
    const zh = raw.match(/[\u4e00-\u9fa5]{3,}/g) || [];
    const en = raw.match(/[a-z][a-z0-9_-]{4,}/g) || [];
    const stop = new Set([
      'this',
      'that',
      'with',
      'from',
      'have',
      'about',
      'which',
      'there',
      'their',
      'paper',
      'chunk',
      'reference',
      'according',
      'based',
    ]);
    return Array.from(new Set([...zh, ...en].filter((x) => !stop.has(x)))).slice(0, 24);
  };
  const scoreCitationForBlock = (block: string, hit: CiteDetail) => {
    const blockTerms = citationTerms(block);
    const snippetTerms = new Set(citationTerms(hit.snippet || ''));
    if (!blockTerms.length || !snippetTerms.size) return 0;
    return blockTerms.reduce((score, term) => score + (snippetTerms.has(term) ? 1 : 0), 0);
  };
  const citationIndexesForBlock = (block: string, cards: CiteDetail[], fallbackIdx: number) => {
    if (!cards.length) return [];
    const ranked = cards
      .map((hit, idx) => ({ idx, score: scoreCitationForBlock(block, hit) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((x) => x.idx);
    if (ranked.length) return ranked;
    return [Math.min(fallbackIdx, cards.length - 1)];
  };
  const splitAnswerBlocks = (text: string) => {
    const normalized = (text || '').trim();
    if (!normalized) return [];
    const paragraphBlocks = normalized
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
    return paragraphBlocks.flatMap((block) => {
      const lines = block.split('\n').map((s) => s.trim()).filter(Boolean);
      const bulletLike = lines.length > 1 && lines.every((line) => /^(\s*[-*•]\s+|\s*\d+[.、]\s+|#{1,4}\s+)/.test(line) || line.length < 48);
      return bulletLike ? lines : [block];
    });
  };
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'ai',
      text:
        `已进入文献《${paper.displayTitle || paper.title || paper.filename}》的深度阅读。\n` +
        `在这里提问，我会优先基于这篇文献作答。\n\n` +
        `**截图提问**：用系统截图工具（Win+Shift+S）截好后直接粘贴 (Ctrl+V) 到输入框，或点 📷 上传，结合文字提问即可。`,
      textEn:
        `Deep reading opened for “${paper.displayTitle || paper.title || paper.filename}”.\n` +
        `Questions here will prioritize this paper.\n\n` +
        `**Ask about a screenshot:** capture an image, paste it with Ctrl+V, or use the 📷 button, then add your question.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [anchored, setAnchored] = useState(true);
  const [attachedImage, setAttachedImage] = useState<{ file: File; preview: string } | null>(null);
  const [visionError, setVisionError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const renderCitationChip = (hit: CiteDetail, idx: number, key: string) => {
    const snippet = (hit?.snippet || '').trim();
    return (
      <button
        key={key}
        type="button"
        onClick={() => onLocateSnippet?.(snippet, hit.page)}
        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-500/35 bg-slate-700/35 px-1.5 text-[10px] text-slate-200 hover:bg-slate-600/50 transition-colors"
        title={snippet || tr('点击定位到引用原文', 'Open the cited passage')}
      >
        <span className="font-mono">{idx + 1}</span>
      </button>
    );
  };

  useEffect(() => {
    setMsgs([
      {
        role: 'ai',
        text:
          `已切换到《${paper.displayTitle || paper.title || paper.filename}》。\n` +
          `你可以继续提问，我会基于这篇文献作答。`,
        textEn:
          `Switched to “${paper.displayTitle || paper.title || paper.filename}”.\n` +
          `Continue asking questions based on this paper.`,
      },
    ]);
    setAnchored(true);
    setAttachedImage(null);
    setVisionError('');
  }, [paper.id]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, loading]);

  // 图片选中后生成缩略图
  const attachImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) {
      setVisionError(tr('图片过大（上限 8MB）', 'Image is too large (8MB maximum)'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage({ file, preview: String(reader.result || '') });
      setVisionError('');
    };
    reader.readAsDataURL(file);
  };

  const handlePickImage = () => fileInputRef.current?.click();

  const handlePaste: React.ClipboardEventHandler<HTMLTextAreaElement> = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          attachImageFile(file);
          return;
        }
      }
    }
  };

  const send = async () => {
    const raw = input.trim();
    if (loading) return;
    if (!raw && !attachedImage) return;

    const displayText = raw || (attachedImage ? tr('（请分析这张图）', '(Please analyze this image)') : '');
    const preview = attachedImage?.preview;

    setMsgs((prev) => [...prev, { role: 'user', text: displayText, imagePreview: preview }]);
    setInput('');
    setLoading(true);
    setVisionError('');

    try {
      if (attachedImage) {
        // 多模态分支：走 queryVision
        const question = raw
          ? `${anchored ? tr(`【已锁定文献 paper_id=${paper.id}】\n`, `[Paper locked: paper_id=${paper.id}]\n`) : ''}${raw}`
          : anchored
          ? tr(
            `请详细解释这张来自文献《${paper.displayTitle || paper.title}》(paper_id=${paper.id}) 的截图，包括公式、变量和图表。`,
            `Explain this screenshot from “${paper.displayTitle || paper.title}” (paper_id=${paper.id}) in detail, including equations, variables, and charts.`,
          )
          : tr('请详细解释这张截图中的公式、变量和图表。', 'Explain the equations, variables, and charts in this screenshot in detail.');

        const res = await queryVision({
          image: attachedImage.file,
          question,
          provider: llmProvider,
          paperId: anchored ? paper.id : undefined,
          mode: anchored ? 'rag' : 'auto',
        });
        setAttachedImage(null);
        const citeDetails = (res.cite_details || []);
        setMsgs((prev) => [
          ...prev,
          {
            role: 'ai',
            text: normalizeAnswerText(res.answer || tr('AI 未返回内容', 'The AI returned no content.'), citeDetails),
            citeDetails,
          },
        ]);
      } else {
        const backendMsg = anchored
          ? tr(
            `【已选定以下文献作为重点参考】\n1. 《${paper.displayTitle || paper.title || paper.filename}》(paper_id=${paper.id})\n\n用户问题：\n${raw}`,
            `[Primary reference selected]\n1. “${paper.displayTitle || paper.title || paper.filename}” (paper_id=${paper.id})\n\nUser question:\n${raw}`,
          )
          : raw;
        const recent = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
        const mode: AssistantMode = anchored ? 'rag' : 'auto';
        const res = await queryWithProvider(backendMsg, llmProvider, recent, mode);
        const citeDetails = (res.cite_details || []);
        setMsgs((prev) => [
          ...prev,
          {
            role: 'ai',
            text: normalizeAnswerText(res.answer || tr('AI 未返回内容', 'The AI returned no content.'), citeDetails),
            citeDetails,
          },
        ]);
      }
    } catch (e: any) {
      console.error(e);
      const msg = String(e?.message || tr('请求失败', 'Request failed'));
      if (msg.includes('不支持看图')) {
        setVisionError(tr('当前模型不支持图片。请切换到 Gemini、GPT-4o 或 Claude 3.5+ 等多模态模型。', 'The current model does not support images. Switch to a multimodal model such as Gemini, GPT-4o, or Claude 3.5+.'));
        setMsgs((prev) => [
          ...prev,
          {
            role: 'ai',
            text: `❌ ${msg}\n\n请在右上角切换到支持图片的模型后重试。`,
            textEn: `❌ ${msg}\n\nSwitch to an image-capable model in the upper-right corner and try again.`,
          },
        ]);
      } else {
        setMsgs((prev) => [...prev, {
          role: 'ai',
          text: `❌ 请求失败：${msg}`,
          textEn: `❌ Request failed: ${msg}`,
        }]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-black/40">
      {/* 顶部：标题 + 模型选择 */}
      <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-yellow-400 shrink-0" />
          <div className="text-xs font-semibold truncate">{tr('阅读对话', 'Reading Chat')}</div>
        </div>
        <ModelPicker
          currentProviderId={llmProvider}
          onProviderChange={onProviderChange}
        />
      </div>

      {/* 次栏：锚定状态 */}
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setAnchored((v) => !v)}
          title={anchored ? tr('已锁定当前文献，点击切换为通用问答', 'Current paper locked; click for general Q&A') : tr('通用问答，点击重新锁定当前文献', 'General Q&A; click to lock the current paper')}
          className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-all ${
            anchored
              ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-100'
              : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Paperclip className="w-3 h-3" />
          {anchored ? tr('锁定本篇', 'Paper Locked') : tr('通用问答', 'General Q&A')}
        </button>
      </div>

      {/* 消息列表 */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-hide">
        {msgs.map((m, i) => {
          const messageText = language === 'en' && m.textEn ? m.textEn : m.text;
          const cards = (m.citeDetails || [])
            .filter((d) => d.paper_id === paper.id && (d.snippet || '').trim())
            .slice(0, 5);
          const blocks = m.role === 'ai' ? splitAnswerBlocks(messageText) : [];

          return (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[92%] px-3 py-2 rounded-xl text-[12.5px] leading-relaxed break-words ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white whitespace-pre-wrap'
                    : 'bg-white/5 border border-white/10'
                }`}
              >
                {m.imagePreview && (
                  <img
                    src={m.imagePreview}
                    alt="screenshot"
                    className="rounded-md mb-1.5 max-h-40 border border-white/10"
                  />
                )}
                {m.role === 'user' ? (
                  messageText
                ) : cards.length > 0 && blocks.length > 0 ? (
                  <div className="space-y-2.5">
                    {blocks.map((block, blockIdx) => {
                      const refIndexes = citationIndexesForBlock(
                        block,
                        cards,
                        blockIdx % Math.max(cards.length, 1),
                      );
                      return (
                        <div key={`${i}-reader-block-${blockIdx}`} className="leading-relaxed">
                          <MarkdownMessage text={block} compact />
                          {refIndexes.length > 0 ? (
                            <span className="mt-1 inline-flex items-center gap-1 align-middle">
                              {refIndexes.map((refIdx) =>
                                renderCitationChip(
                                  cards[refIdx],
                                  refIdx,
                                  `${i}-reader-block-${blockIdx}-ref-${refIdx}`,
                                ),
                              )}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <MarkdownMessage text={messageText} compact />
                )}
                {m.role === 'ai' && cards.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-white/10 flex flex-col gap-1.5">
                    <div className="text-[10px] text-yellow-300/90">{tr('全部来源（点击定位到 PDF）', 'All sources (click to locate in PDF)')}</div>
                    {cards.map((d, idx) => (
                      <button
                        key={`${d.chunk_id || idx}`}
                        className="text-left text-[10px] px-2 py-1 rounded border border-yellow-400/35 bg-yellow-300/10 hover:bg-yellow-300/20 text-yellow-100 line-clamp-2"
                        title={d.snippet || ''}
                        onClick={() => onLocateSnippet?.((d.snippet || '').trim(), d.page)}
                      >
                        [{idx + 1}] {d.page ? tr(`（第 ${d.page} 页） `, `(Page ${d.page}) `) : ''}{(d.snippet || '').trim()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex gap-1.5 p-2 bg-white/5 rounded-xl w-fit">
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]" />
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]" />
          </div>
        )}
      </div>

      {/* 附加图片预览 */}
      {attachedImage && (
        <div className="px-3 py-2 border-t border-white/10 bg-white/5">
          <div className="flex items-start gap-2">
            <img
              src={attachedImage.preview}
              alt="attached"
              className="w-16 h-16 object-cover rounded-md border border-white/15"
            />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-slate-300 truncate">{attachedImage.file.name || tr('截图', 'Screenshot')}</div>
              <div className="text-[10px] text-slate-500">
                {(attachedImage.file.size / 1024).toFixed(0)} KB · {tr('将与文字问题一起发送给多模态模型', 'sent with your question to the multimodal model')}
              </div>
            </div>
            <button
              onClick={() => setAttachedImage(null)}
              className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title={tr('移除截图', 'Remove screenshot')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {visionError && (
            <div className="mt-1.5 text-[10px] text-red-300">{visionError}</div>
          )}
        </div>
      )}

      {/* 输入区 */}
      <div className="p-3 border-t border-white/10">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) =>
              e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())
            }
            placeholder={
              attachedImage
                ? tr('针对这张截图提问…（Enter 发送）', 'Ask about this screenshot… (Enter to send)')
                : anchored
                ? tr('针对当前文献提问，可按 Ctrl+V 粘贴截图…（Enter 发送）', 'Ask about this paper; paste screenshots with Ctrl+V… (Enter to send)')
                : tr('通用提问，可按 Ctrl+V 粘贴截图…（Enter 发送）', 'Ask anything; paste screenshots with Ctrl+V… (Enter to send)')
            }
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pr-20 text-[12.5px] outline-none focus:border-indigo-500/50 min-h-[72px] resize-none transition-all"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) attachImageFile(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={handlePickImage}
            className="absolute bottom-2.5 right-12 p-1.5 bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg transition-all active:scale-95"
            title={tr('附加截图（或直接按 Ctrl+V 粘贴）', 'Attach a screenshot (or paste with Ctrl+V)')}
          >
            <ImageIcon className="w-3.5 h-3.5 text-slate-200" />
          </button>
          <button
            onClick={send}
            disabled={loading || (!input.trim() && !attachedImage)}
            className="absolute bottom-2.5 right-2.5 p-1.5 bg-indigo-600 rounded-lg hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
