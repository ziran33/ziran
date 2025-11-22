
import React, { useState, useRef, useEffect } from 'react';
import { VariableMap, Attachment, TestRun, LLMConfig } from '../types';
import { Button } from './Button';
import { marked } from 'marked';

interface TestPanelProps {
  variables: string[];
  onRun: (inputs: VariableMap, attachments: Attachment[], config: LLMConfig) => void;
  isLoading: boolean;
  lastRun: TestRun | null;
  history: TestRun[];
  selectedModelId: string;
  onModelChange: (id: string) => void;
  availableAPIs: LLMConfig[];
  onClearHistory: () => void;
}

export const TestPanel: React.FC<TestPanelProps> = ({
  variables,
  onRun,
  isLoading,
  lastRun,
  history,
  selectedModelId,
  onModelChange,
  availableAPIs,
  onClearHistory
}) => {
  const [inputs, setInputs] = useState<VariableMap>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [showProtocol, setShowProtocol] = useState(false);
  
  // Result Modal State
  const [isOutputModalOpen, setIsOutputModalOpen] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(true);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          if (evt.target?.result) {
            const newAtt: Attachment = {
              id: Math.random().toString(36).substr(2, 9),
              name: file.name,
              mimeType: file.type,
              type: file.type.startsWith('image') ? 'image' : 'text',
              data: evt.target.result as string
            };
            setAttachments(prev => [...prev, newAtt]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleInputChange = (key: string, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const triggerRun = () => {
    const config = availableAPIs.find(a => a.id === selectedModelId);
    if (config) {
        onRun(inputs, attachments, config);
    }
  };

  // Construct a mock request object for visualization
  const getMockProtocol = () => {
     return JSON.stringify({
        model: selectedModelId,
        variables: inputs,
        attachments: attachments.map(a => ({ name: a.name, type: a.mimeType, size: a.data.length })),
        timestamp: new Date().toISOString()
     }, null, 2);
  };

  const getMarkdownHtml = (text: string) => {
    try {
        return marked.parse(text);
    } catch (e) {
        return text;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-950 flex-shrink-0">
        <div className="flex items-center gap-2 text-slate-400">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
             <span className="text-xs font-bold uppercase tracking-wider">调试控制台 (Runner)</span>
        </div>
        <select 
            value={selectedModelId} 
            onChange={(e) => onModelChange(e.target.value)}
            className="max-w-[150px] bg-slate-900 border border-slate-700 text-slate-300 text-[10px] rounded px-2 py-1 focus:outline-none focus:border-indigo-500 truncate"
        >
          {availableAPIs.map(api => (
             <option key={api.id} value={api.id}>{api.name}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        
        {/* Inputs Section */}
        <div className="space-y-4">
          <div>
             <div className="flex justify-between mb-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Variables (变量)</label>
             </div>
             <div className="space-y-3">
                {variables.length === 0 && <div className="text-xs text-slate-600 italic py-2 text-center border border-dashed border-slate-800 rounded">无变量，可直接运行</div>}
                {variables.map(v => (
                    <div key={v} className="group">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono text-emerald-500 bg-emerald-900/10 px-1 rounded border border-emerald-900/30 select-none">{`{{${v}}}`}</span>
                        </div>
                        <textarea 
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-y min-h-[80px] custom-scrollbar placeholder-slate-700 leading-relaxed"
                            value={inputs[v] || ''}
                            onChange={(e) => handleInputChange(v, e.target.value)}
                            placeholder={`输入 ${v} 测试值...`}
                        />
                    </div>
                ))}
             </div>
          </div>

          {/* Attachments Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Attachments (附件)</label>
                <button onClick={() => fileInputRef.current?.click()} className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg> 上传
                </button>
                <input type="file" ref={fileInputRef} multiple className="hidden" onChange={handleFileSelect} />
            </div>
            <div className="space-y-1">
                {attachments.map(att => (
                    <div key={att.id} className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800 hover:border-slate-700 transition-colors">
                        <div className="flex items-center gap-2 truncate">
                             <span className="text-[10px] bg-slate-800 text-slate-400 px-1 rounded uppercase">{att.type}</span>
                             <span className="text-xs text-slate-300 truncate max-w-[100px]">{att.name}</span>
                        </div>
                        <button onClick={() => setAttachments(prev => prev.filter(p => p.id !== att.id))} className="text-slate-600 hover:text-red-400">
                             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                ))}
                {attachments.length === 0 && <div className="text-[10px] text-slate-700 italic p-2 text-center">暂无附件</div>}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
              <Button variant="secondary" className="col-span-1" onClick={() => setShowProtocol(!showProtocol)} title="查看请求报文">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
              </Button>
              <Button variant="primary" className="col-span-3 shadow-lg shadow-indigo-900/20" onClick={triggerRun} isLoading={isLoading}>
                运行测试 (Run)
              </Button>
          </div>
          
          {showProtocol && (
              <div className="bg-black rounded border border-slate-800 p-3 animate-fadeIn">
                  <div className="text-[10px] text-slate-500 mb-1 uppercase font-bold">Preview Request Body</div>
                  <pre className="text-[10px] font-mono text-slate-400 whitespace-pre-wrap overflow-x-auto custom-scrollbar">
                      {getMockProtocol()}
                  </pre>
              </div>
          )}
        </div>

        {/* Latest Result */}
        {lastRun && (
             <div className="animate-fadeIn border-t border-slate-800 pt-4 relative group">
                 <div className="flex justify-between items-end mb-2">
                    <span className="text-[10px] font-bold text-emerald-500 uppercase flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        最新输出
                    </span>
                    <div className="flex gap-2 items-center">
                        <div className="flex gap-2 text-[9px] font-mono text-slate-500">
                            <span title="耗时">{lastRun.latency}ms</span>
                            <span title="Token (In/Out)">T:{lastRun.tokenUsage.totalTokens}</span>
                        </div>
                        <button 
                           onClick={() => setIsOutputModalOpen(true)}
                           className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-indigo-400 transition-colors"
                           title="全屏查看 / Markdown 渲染"
                        >
                           <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                        </button>
                    </div>
                 </div>
                 <div className={`bg-black rounded border ${lastRun.error ? 'border-red-900/50 text-red-400' : 'border-slate-800 text-slate-300'} p-3 text-xs font-mono whitespace-pre-wrap max-h-80 overflow-y-auto custom-scrollbar selection:bg-emerald-900/50`}>
                    {lastRun.output}
                 </div>
             </div>
        )}

        {/* History Log */}
        <div className="border-t border-slate-800 pt-4">
           <div className="flex justify-between items-center mb-3">
             <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">测试历史 (History)</h3>
             <button onClick={onClearHistory} className="text-[10px] text-slate-600 hover:text-red-400 transition-colors">清空</button>
           </div>
           <div className="space-y-2">
             {history.slice().reverse().map(run => (
               <div key={run.id} className="bg-slate-950 rounded border border-slate-800 overflow-hidden hover:border-slate-700 transition-all">
                  <div 
                    className="flex items-center justify-between p-2 cursor-pointer hover:bg-slate-900 transition-colors group"
                    onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                  >
                     <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${run.error ? 'bg-red-500' : 'bg-emerald-500'} shadow-sm`}></div>
                        <span className="text-[10px] text-slate-400 font-mono">{new Date(run.timestamp).toLocaleTimeString()}</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <span className="text-[9px] text-slate-600">{run.modelUsed}</span>
                        <svg className={`w-3 h-3 text-slate-600 transition-transform ${expandedRunId === run.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                     </div>
                  </div>
                  {expandedRunId === run.id && (
                    <div className="p-2 border-t border-slate-800 bg-black/30 text-[10px] font-mono">
                       <div className="mb-2 text-slate-500 border-b border-slate-800 pb-1">Inputs: <span className="text-slate-400">{JSON.stringify(run.inputs)}</span></div>
                       <div className="text-slate-300 whitespace-pre-wrap">{run.output}</div>
                    </div>
                  )}
               </div>
             ))}
             {history.length === 0 && <div className="text-[10px] text-slate-700 text-center italic">暂无历史记录</div>}
           </div>
        </div>
      </div>

      {/* Output Detail Modal */}
      {isOutputModalOpen && lastRun && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-fadeIn">
           <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col ring-1 ring-white/10">
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center rounded-t-xl">
                 <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-white">输出详情 (Output Details)</h3>
                    <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                        <button 
                            onClick={() => setIsPreviewMode(true)}
                            className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${isPreviewMode ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            PREVIEW
                        </button>
                        <button 
                            onClick={() => setIsPreviewMode(false)}
                            className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${!isPreviewMode ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            RAW
                        </button>
                    </div>
                 </div>
                 <button onClick={() => setIsOutputModalOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1 rounded hover:bg-slate-800">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                 </button>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-950">
                  {isPreviewMode ? (
                      <div 
                        className="markdown-body" 
                        dangerouslySetInnerHTML={{ __html: getMarkdownHtml(lastRun.output) as string }} 
                      />
                  ) : (
                      <pre className="font-mono text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {lastRun.output}
                      </pre>
                  )}
              </div>
              
              <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex justify-between items-center text-xs rounded-b-xl">
                  <div className="text-slate-500 font-mono">
                      {lastRun.tokenUsage.totalTokens} Tokens • {lastRun.latency}ms
                  </div>
                  <Button size="sm" onClick={() => navigator.clipboard.writeText(lastRun.output)}>
                      复制内容 (Copy)
                  </Button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};
