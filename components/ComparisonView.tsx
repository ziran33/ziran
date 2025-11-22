

import React, { useState, useRef } from 'react';
import { PromptVersion, VariableMap, LLMConfig, Attachment } from '../types';
import { Button } from './Button';
import { generateContent, generateChat } from '../services/geminiService';

interface ComparisonViewProps {
  activeVersion: PromptVersion;
  variables: string[];
  availableAPIs: LLMConfig[];
}

interface ComparisonRunResult {
  apiId: string;
  loading: boolean;
  output: string;
  latency?: number;
  tokens?: number;
  error?: boolean;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({
  activeVersion,
  variables,
  availableAPIs,
}) => {
  const [inputs, setInputs] = useState<VariableMap>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedApiIds, setSelectedApiIds] = useState<string[]>(() => {
      if (availableAPIs.length >= 2) return [availableAPIs[0].id, availableAPIs[1].id];
      return [availableAPIs[0]?.id || 'default'];
  });
  
  const [results, setResults] = useState<Record<string, ComparisonRunResult>>({});

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

  const runSingle = async (apiId: string) => {
    const config = availableAPIs.find(a => a.id === apiId);
    if (!config) return;

    setResults(prev => ({ ...prev, [apiId]: { ...prev[apiId], apiId, loading: true, output: '' } }));
    const start = Date.now();

    try {
        let res;

        if (activeVersion.type === 'chat' && activeVersion.messages) {
            // For Chat, we need to replace variables in ALL messages
            const processedMessages = activeVersion.messages.map(msg => {
                let content = msg.content;
                Object.entries(inputs).forEach(([k, v]) => {
                    content = content.replace(new RegExp(`{{${k}}}`, 'g'), v);
                });
                return { ...msg, content };
            });

            res = await generateChat(config, processedMessages, activeVersion.systemInstruction, activeVersion.config);

        } else {
            // Standard Text Prompt
            let prompt = activeVersion.content;
            Object.entries(inputs).forEach(([k, v]) => {
              prompt = prompt.replace(new RegExp(`{{${k}}}`, 'g'), v);
            });
            res = await generateContent(config, prompt, activeVersion.systemInstruction, activeVersion.config, attachments);
        }

      setResults(prev => ({
        ...prev,
        [apiId]: {
            apiId,
            loading: false,
            output: res.text,
            latency: Date.now() - start,
            tokens: res.tokenUsage.totalTokens
        }
      }));
    } catch (err: any) {
        setResults(prev => ({
            ...prev,
            [apiId]: { apiId, loading: false, output: err.message, error: true }
        }));
    }
  };

  const runAll = () => {
    selectedApiIds.forEach(id => runSingle(id));
  };

  const addColumn = () => {
    const defaultId = availableAPIs[0]?.id;
    if (defaultId) {
        setSelectedApiIds([...selectedApiIds, defaultId]);
    }
  };

  const removeColumn = (index: number) => {
    if (selectedApiIds.length > 1) {
        const newIds = [...selectedApiIds];
        newIds.splice(index, 1);
        setSelectedApiIds(newIds);
    }
  };

  const updateColumnModel = (index: number, newId: string) => {
    const newIds = [...selectedApiIds];
    newIds[index] = newId;
    setSelectedApiIds(newIds);
  };

  const isOverflowing = selectedApiIds.length > 3;

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">
       
       {/* LEFT PANEL: Control Center (Inputs) */}
       <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-slate-800 bg-slate-900 z-10 shadow-xl">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                 <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                 <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">测试控制台</h2>
              </div>
              <div className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-mono truncate max-w-[100px]" title={activeVersion.name}>
                 {activeVersion.name}
              </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
             {/* Variables Input Section */}
             <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">Variables (变量)</label>
                    <span className="text-[10px] text-slate-600 font-mono">{variables.length}</span>
                </div>
                
                {variables.length === 0 && (
                    <div className="p-4 border border-dashed border-slate-800 rounded text-center text-slate-600 text-xs">
                        当前提示词无变量
                    </div>
                )}

                {variables.map(v => (
                    <div key={v} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-900/30">{`{{${v}}}`}</span>
                        </div>
                        <textarea 
                            placeholder={`请输入 ${v} 的测试内容...`}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-y min-h-[80px] custom-scrollbar placeholder-slate-700 leading-relaxed"
                            value={inputs[v] || ''}
                            onChange={(e) => setInputs({...inputs, [v]: e.target.value})}
                        />
                    </div>
                ))}
             </div>

             {/* Attachments Section */}
             <div className="space-y-3 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">Attachments (附件)</label>
                    <button onClick={() => fileInputRef.current?.click()} className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                        + 添加文件
                    </button>
                    <input type="file" ref={fileInputRef} multiple className="hidden" onChange={handleFileSelect} />
                </div>
                
                <div className="grid grid-cols-1 gap-2">
                    {attachments.map(att => (
                        <div key={att.id} className="flex items-center justify-between bg-slate-950 p-2.5 rounded border border-slate-800 text-xs group">
                            <div className="flex items-center gap-2 truncate">
                                <span className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-[10px] text-slate-500 font-bold uppercase">{att.type === 'image' ? 'IMG' : 'TXT'}</span>
                                <span className="text-slate-300 truncate max-w-[180px]">{att.name}</span>
                            </div>
                            <button onClick={() => setAttachments(prev => prev.filter(x => x.id !== att.id))} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                    ))}
                    {attachments.length === 0 && (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="h-16 border border-dashed border-slate-800 rounded hover:border-slate-600 hover:bg-slate-800/30 transition-all cursor-pointer flex items-center justify-center text-slate-600 gap-2"
                        >
                            <span className="text-[10px]">点击上传测试图片/文件</span>
                        </div>
                    )}
                </div>
             </div>
          </div>

          <div className="p-5 border-t border-slate-800 bg-slate-900">
             <Button onClick={runAll} size="lg" className="w-full shadow-lg shadow-indigo-900/20 h-11 flex items-center justify-center gap-2 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                全部运行 (Run All)
             </Button>
          </div>
       </div>

       {/* RIGHT PANEL: Infinite Canvas */}
       <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
          {/* Tools Header */}
          <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-950 z-20 flex-shrink-0">
              <div className="flex items-center gap-2">
                 <span className="text-xs text-slate-500">当前版本:</span>
                 <span className="text-xs font-bold text-white bg-indigo-600 px-2 py-0.5 rounded">{activeVersion.name}</span>
              </div>
              <button 
                onClick={addColumn} 
                className="flex items-center gap-2 px-3 py-1.5 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-900/20"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                添加对比模型
              </button>
          </div>

          {/* Grid Area */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#0B1120]">
             <div className={`h-full flex ${isOverflowing ? '' : 'w-full'}`}>
                {selectedApiIds.map((apiId, index) => {
                    const result = results[apiId];
                    const apiConfig = availableAPIs.find(a => a.id === apiId);
                    
                    return (
                      <div 
                        key={`${apiId}-${index}`} 
                        className={`flex-shrink-0 flex flex-col border-r border-slate-800 bg-slate-950/50 transition-all ${isOverflowing ? 'w-[400px]' : 'flex-1 min-w-[350px]'}`}
                      >
                          {/* Column Header */}
                          <div className="p-3 border-b border-slate-800 bg-slate-900/50 flex flex-col gap-2 sticky top-0 z-10">
                              <div className="flex justify-between items-center">
                                  <select 
                                      value={apiId}
                                      onChange={(e) => updateColumnModel(index, e.target.value)}
                                      className="bg-transparent text-sm font-bold text-slate-200 outline-none cursor-pointer hover:text-indigo-400 truncate max-w-[200px]"
                                  >
                                      {availableAPIs.map(a => <option key={a.id} value={a.id} className="bg-slate-900 text-slate-300">{a.name}</option>)}
                                  </select>
                                  
                                  <div className="flex items-center gap-1">
                                      <button onClick={() => runSingle(apiId)} className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-900/20 rounded transition-all" title="Run this">
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path></svg>
                                      </button>
                                      {selectedApiIds.length > 1 && (
                                          <button onClick={() => removeColumn(index)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-all" title="Remove">
                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                          </button>
                                      )}
                                  </div>
                              </div>
                              
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                                  <span className={`px-1 rounded border ${apiConfig?.provider === 'gemini' ? 'border-blue-500/20 text-blue-400' : 'border-emerald-500/20 text-emerald-400'}`}>
                                      {apiConfig?.provider === 'gemini' ? 'GEMINI' : 'OPENAI'}
                                  </span>
                                  <span className="truncate">{apiConfig?.modelId}</span>
                              </div>
                          </div>

                          {/* Output Area */}
                          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative bg-slate-950/30 group">
                              {result?.loading ? (
                                  <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3">
                                      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                      <span className="text-xs animate-pulse">Generating...</span>
                                  </div>
                              ) : result?.output ? (
                                  <div className={`whitespace-pre-wrap font-mono text-xs leading-relaxed ${result.error ? 'text-red-400 bg-red-900/10 p-2 rounded border border-red-900/30' : 'text-slate-300'}`}>
                                      {result.output}
                                  </div>
                              ) : (
                                  <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-50">
                                      <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                      <span className="text-[10px]">Ready to run</span>
                                  </div>
                              )}
                          </div>

                          {/* Stats Footer */}
                          {result && !result.loading && !result.error && (
                             <div className="px-3 py-2 border-t border-slate-800 bg-slate-900/30 flex justify-between items-center text-[10px] font-mono text-slate-500">
                                <div>
                                   <span className="text-slate-600 mr-1">Lat:</span>
                                   <span className="text-emerald-500">{result.latency}ms</span>
                                </div>
                                <div>
                                   <span className="text-slate-600 mr-1">Tok:</span>
                                   <span className="text-indigo-400">{result.tokens}</span>
                                </div>
                             </div>
                          )}
                      </div>
                    );
                })}
                
                {/* Add Button (Visible only when scrolling or few items) */}
                <div className="w-[80px] flex-shrink-0 flex flex-col items-center justify-center border-r border-slate-800/50 bg-slate-950/20 hover:bg-slate-900/50 transition-colors cursor-pointer" onClick={addColumn}>
                     <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 group-hover:text-indigo-400 group-hover:border-indigo-500 transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                     </div>
                     <span className="text-[10px] text-slate-600 mt-2 font-medium">ADD</span>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
};