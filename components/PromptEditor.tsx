



import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PromptVersion, GenerationConfig, LLMConfig } from '../types';
import { Button } from './Button';
import { optimizePrompt } from '../services/geminiService';

interface PromptEditorProps {
  activeVersion: PromptVersion;
  onUpdate: (updates: Partial<PromptVersion>) => void;
  onCommit: (content: string, system: string, config: GenerationConfig) => void;
  variables: string[];
  onOpenDeploy: () => void;
  availableAPIs: LLMConfig[];
}

export const PromptEditor: React.FC<PromptEditorProps> = ({
  activeVersion,
  onUpdate,
  onCommit,
  variables,
  onOpenDeploy,
  availableAPIs
}) => {
  const [content, setContent] = useState(activeVersion.content);
  const [systemInstruction, setSystemInstruction] = useState(activeVersion.systemInstruction || '');
  const [config, setConfig] = useState<GenerationConfig>(activeVersion.config || {
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    responseMimeType: 'text/plain'
  });
  
  // UI States
  const [showSystem, setShowSystem] = useState<boolean>(!!activeVersion.systemInstruction || true);
  const [showConfig, setShowConfig] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<number>(14);
  
  // Resizable Pane State
  const [systemPaneHeight, setSystemPaneHeight] = useState(400); 
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const systemRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [optimizeGoal, setOptimizeGoal] = useState('');
  const [optimizeModelId, setOptimizeModelId] = useState<string>(activeVersion.model);

  // Sync state when version changes
  useEffect(() => {
    setContent(activeVersion.content);
    setSystemInstruction(activeVersion.systemInstruction || '');
    setConfig(activeVersion.config || { temperature: 0.7, topP: 0.95, topK: 40, responseMimeType: 'text/plain' });
    if (activeVersion.systemInstruction && activeVersion.systemInstruction.length > 0) {
        setShowSystem(true);
    }
  }, [activeVersion.id]);

  // Handle Dragging for Resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'row-resize';
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    
    setSystemPaneHeight(prev => {
        const newHeight = prev + e.movementY;
        return Math.max(150, Math.min(newHeight, window.innerHeight - 200));
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    document.body.style.cursor = 'default';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);


  const handleUpdate = (field: 'content' | 'system', value: string) => {
    if (field === 'content') {
      setContent(value);
      onUpdate({ content: value });
    } else {
      setSystemInstruction(value);
      onUpdate({ systemInstruction: value });
    }
  };
  
  // Auto-indent Logic
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, field: 'content' | 'system') => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;
        
        // Find the start of the current line
        const lastNewLine = value.lastIndexOf('\n', start - 1);
        const currentLineStart = lastNewLine + 1;
        
        // Get the indentation of the current line
        const currentLine = value.substring(currentLineStart, start);
        const match = currentLine.match(/^(\s*)/);
        const indentation = match ? match[1] : '';
        
        // Insert newline + indentation
        const newValue = value.substring(0, start) + '\n' + indentation + value.substring(end);
        
        // Update state
        handleUpdate(field, newValue);
        
        // Restore cursor position (needs a timeout to wait for state update/render)
        setTimeout(() => {
            if (field === 'content' && contentRef.current) {
                contentRef.current.selectionStart = start + indentation.length + 1;
                contentRef.current.selectionEnd = start + indentation.length + 1;
            } else if (field === 'system' && systemRef.current) {
                systemRef.current.selectionStart = start + indentation.length + 1;
                systemRef.current.selectionEnd = start + indentation.length + 1;
            }
        }, 0);
    }
  };

  const handleConfigChange = (key: keyof GenerationConfig, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    onUpdate({ config: newConfig });
  };

  const handleOptimize = async () => {
    if (!optimizeGoal.trim()) return;
    const modelConfig = availableAPIs.find(a => a.id === optimizeModelId) || availableAPIs[0];
    if (!modelConfig) return;

    setIsOptimizing(true);
    try {
      const improved = await optimizePrompt(content, optimizeGoal, modelConfig);
      handleUpdate('content', improved);
      setShowOptimizeModal(false);
      setOptimizeGoal('');
    } catch (err) {
      alert("优化失败，请检查网络或 API Key");
    } finally {
      setIsOptimizing(false);
    }
  };

  // Helper to render line numbers
  const LineNumbers = ({ text, fontSize }: { text: string, fontSize: number }) => {
     const lineCount = text.split('\n').length;
     const lines = Array.from({ length: lineCount }, (_, i) => i + 1);
     return (
        <div className="bg-slate-900/50 text-slate-600 text-right pr-3 py-4 select-none font-mono flex flex-col pointer-events-none min-w-[2.5rem]" style={{ fontSize: `${fontSize}px`, lineHeight: '1.625' }}>
            {lines.map(l => <div key={l}>{l}</div>)}
        </div>
     );
  };

  return (
    <div className="flex h-full w-full bg-slate-950 relative overflow-hidden" ref={containerRef}>
      
      {/* Main Editor Area (Flex Grow) */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        
        {/* Toolbar */}
        <div className="h-12 flex-shrink-0 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-950 z-10">
          <div className="flex items-center gap-4 overflow-hidden">
             <div className="flex items-center gap-2 text-slate-500 text-xs whitespace-nowrap">
                <span className="text-indigo-500 font-bold">EDIT</span>
                <span className="text-slate-700">/</span>
                <span className="text-slate-200 font-bold truncate max-w-[150px]">{activeVersion.name}</span>
             </div>
             <div className="h-4 w-px bg-slate-800"></div>
             <div className="flex gap-1">
                <button 
                    onClick={() => setShowSystem(!showSystem)}
                    className={`p-1.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1 ${showSystem ? 'bg-slate-800 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
                    title="切换系统提示词显示"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7"></path></svg>
                    System
                </button>
                <button 
                    onClick={() => setShowConfig(!showConfig)}
                    className={`p-1.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1 ${showConfig ? 'bg-slate-800 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
                    title="切换配置面板显示"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Config
                </button>
             </div>
             <div className="h-4 w-px bg-slate-800 ml-1"></div>
             <div className="flex items-center gap-1 bg-slate-900 rounded p-0.5 border border-slate-800">
                <button onClick={() => setFontSize(s => Math.max(10, s - 1))} className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded" title="Smaller Font">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"></path></svg>
                </button>
                <span className="text-[10px] font-mono text-slate-500 w-4 text-center">{fontSize}</span>
                <button onClick={() => setFontSize(s => Math.min(24, s + 1))} className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded" title="Larger Font">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                </button>
             </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button 
                onClick={() => setShowOptimizeModal(true)} 
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800 text-indigo-400 hover:bg-indigo-900/20 hover:text-indigo-300 text-xs font-medium transition-colors border border-slate-700 hover:border-indigo-500/50"
            >
               <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
               AI 优化
            </button>
            
            <button 
                onClick={onOpenDeploy}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 hover:text-emerald-300 text-xs font-medium transition-colors border border-emerald-500/20 hover:border-emerald-500/50"
            >
               <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
               发布 API
            </button>

            <button 
                onClick={() => onCommit(content, systemInstruction, config)} 
                className="flex items-center gap-2 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-lg shadow-indigo-900/20 whitespace-nowrap"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
              提交版本
            </button>
          </div>
        </div>
        
        {/* Scrollable Editor Area */}
        <div className="flex-1 flex flex-col min-h-0 relative bg-slate-950">
          
          {/* System Instruction Pane (Resizable) */}
          {showSystem && (
            <div 
                className="flex-shrink-0 border-b border-slate-800 bg-slate-900/30 flex flex-col"
                style={{ height: systemPaneHeight }}
            >
                <div className="px-4 py-1.5 bg-slate-950 border-b border-slate-800 flex justify-between items-center select-none">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-sm bg-indigo-500"></span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">System Instructions</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setSystemInstruction(activeVersion.systemInstruction || '')} className="text-[9px] text-slate-600 hover:text-slate-400" title="重置">Reset</button>
                    </div>
                </div>
                <div className="flex-1 relative flex overflow-hidden">
                    <div className="h-full overflow-hidden flex-shrink-0">
                         <LineNumbers text={systemInstruction} fontSize={fontSize} />
                    </div>
                    <textarea
                        ref={systemRef}
                        className="flex-1 w-full p-4 bg-transparent text-slate-300 font-mono resize-none focus:outline-none focus:bg-slate-900/50 transition-colors custom-scrollbar leading-relaxed"
                        style={{ fontSize: `${fontSize}px`, lineHeight: '1.625' }}
                        value={systemInstruction}
                        onChange={(e) => handleUpdate('system', e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, 'system')}
                        placeholder="// 定义 AI 角色、风格与核心约束..."
                        spellCheck={false}
                    />
                </div>
            </div>
          )}

          {/* Resizable Handle (Splitter) */}
          {showSystem && (
             <div 
                className="h-1.5 bg-slate-950 hover:bg-indigo-500/20 cursor-row-resize flex items-center justify-center group transition-colors z-20 border-b border-slate-800/50 -mt-px select-none"
                onMouseDown={handleMouseDown}
             >
                <div className="w-10 h-1 rounded-full bg-slate-800 group-hover:bg-indigo-400/50 transition-colors flex items-center justify-center gap-0.5">
                    <span className="w-0.5 h-0.5 bg-black/50 rounded-full"></span>
                    <span className="w-0.5 h-0.5 bg-black/50 rounded-full"></span>
                    <span className="w-0.5 h-0.5 bg-black/50 rounded-full"></span>
                </div>
             </div>
          )}

          {/* User Prompt Pane (Fill remaining) */}
          <div className="flex-1 flex flex-col bg-slate-950 min-h-0 relative">
             <div className="px-4 py-1.5 bg-slate-950 border-b border-slate-800 flex justify-between items-center select-none">
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-sm bg-emerald-500"></span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">User Prompt</span>
                </div>
                <div className="flex gap-2 overflow-x-auto max-w-[300px] no-scrollbar">
                    {variables.map(v => <span key={v} className="text-[9px] font-mono bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded border border-slate-700 whitespace-nowrap">{`{{${v}}}`}</span>)}
                </div>
             </div>
             <div className="flex-1 relative flex overflow-hidden">
                 <div className="h-full overflow-hidden flex-shrink-0">
                      <LineNumbers text={content} fontSize={fontSize} />
                 </div>
                 <textarea
                  ref={contentRef}
                  className="flex-1 w-full p-4 bg-transparent text-slate-200 font-mono resize-none focus:outline-none custom-scrollbar leading-relaxed selection:bg-indigo-500/30"
                  style={{ fontSize: `${fontSize}px`, lineHeight: '1.625' }}
                  value={content}
                  onChange={(e) => handleUpdate('content', e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, 'content')}
                  spellCheck={false}
                  placeholder="输入提示词模板。使用 {{variable}} 定义变量..."
                />
             </div>
          </div>
        </div>
      </div>

      {/* Configuration Panel (Collapsible Right Rail) */}
      {showConfig && (
        <div className="w-64 flex-shrink-0 bg-slate-950 border-l border-slate-800 flex flex-col transition-all duration-300 z-20">
           <div className="h-12 flex-shrink-0 flex items-center px-4 border-b border-slate-800 bg-slate-950">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Configuration</span>
           </div>
           
           <div className="p-4 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
              {/* Model Config Group */}
              <div className="space-y-4">
                 <h3 className="text-[10px] font-bold text-indigo-500 uppercase border-b border-slate-800 pb-1">Parameters</h3>
                 
                 <div className="space-y-3">
                   <div className="space-y-1">
                      <div className="flex justify-between items-center">
                          <label className="text-[10px] text-slate-400">Temperature</label>
                          <span className="text-[10px] font-mono text-indigo-300">{config.temperature}</span>
                      </div>
                      <input type="range" min="0" max="2" step="0.1" value={config.temperature} onChange={e => handleConfigChange('temperature', parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                   </div>

                   <div className="space-y-1">
                      <div className="flex justify-between items-center">
                          <label className="text-[10px] text-slate-400">Top P</label>
                          <span className="text-[10px] font-mono text-indigo-300">{config.topP}</span>
                      </div>
                      <input type="range" min="0" max="1" step="0.05" value={config.topP} onChange={e => handleConfigChange('topP', parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                   </div>

                   <div className="space-y-1">
                      <div className="flex justify-between items-center">
                          <label className="text-[10px] text-slate-400">Top K</label>
                          <span className="text-[10px] font-mono text-indigo-300">{config.topK}</span>
                      </div>
                      <input type="range" min="1" max="100" step="1" value={config.topK} onChange={e => handleConfigChange('topK', parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                   </div>
                 </div>
              </div>

              {/* Output Format Group */}
              <div className="space-y-3">
                 <h3 className="text-[10px] font-bold text-indigo-500 uppercase border-b border-slate-800 pb-1">Response Format</h3>
                 
                 <div className="flex items-center justify-between p-2.5 rounded bg-slate-900 border border-slate-800">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-slate-300 font-medium">JSON Mode</span>
                        <span className="text-[9px] text-slate-600">强制 JSON 结构输出</span>
                    </div>
                    <button onClick={() => handleConfigChange('responseMimeType', config.responseMimeType === 'application/json' ? 'text/plain' : 'application/json')} className={`w-8 h-4 rounded-full relative transition-colors ${config.responseMimeType === 'application/json' ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                       <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${config.responseMimeType === 'application/json' ? 'translate-x-4' : ''}`}></span>
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Optimize Modal */}
       {showOptimizeModal && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl ring-1 ring-white/10 animate-fadeIn">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg></span>
                AI 智能优化助手
            </h3>
            <p className="text-[10px] text-slate-400 mb-3">告诉 AI 你希望如何改进当前的提示词。例如：“使其更具说服力”、“增加思维链推理步骤”或“简化语言”。</p>
            
            <div className="mb-3">
                <select 
                    value={optimizeModelId}
                    onChange={(e) => setOptimizeModelId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 outline-none"
                >
                    {availableAPIs.map(api => <option key={api.id} value={api.id}>{api.name}</option>)}
                </select>
                <div className="text-[9px] text-slate-600 mt-1">选择执行优化任务的模型</div>
            </div>

            <textarea
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none mb-4 resize-none font-mono"
              rows={4}
              value={optimizeGoal}
              onChange={(e) => setOptimizeGoal(e.target.value)}
              placeholder="输入优化目标..."
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowOptimizeModal(false)}>取消</Button>
              <Button variant="primary" size="sm" onClick={handleOptimize} isLoading={isOptimizing}>开始优化</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};