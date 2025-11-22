
import React, { useState, useEffect, useRef } from 'react';
import { PromptVersion, ChatMessage, LLMConfig, GenerationConfig } from '../types';
import { Button } from './Button';
import { generateChat } from '../services/geminiService';

interface ChatBuilderViewProps {
  activeVersion: PromptVersion;
  availableAPIs: LLMConfig[];
  onUpdate: (updates: Partial<PromptVersion>) => void;
  onCommit: (content: string, system: string, config: GenerationConfig, messages: ChatMessage[], modelId: string) => void;
}

export const ChatBuilderView: React.FC<ChatBuilderViewProps> = ({
  activeVersion,
  availableAPIs,
  onUpdate,
  onCommit
}) => {
  const [systemInstruction, setSystemInstruction] = useState(activeVersion.systemInstruction || '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedModelId, setSelectedModelId] = useState(activeVersion.model);
  const [isLoading, setIsLoading] = useState(false);
  
  // Config State
  const [config, setConfig] = useState<GenerationConfig>(activeVersion.config || {
    temperature: 0.7, topP: 0.95, topK: 40, responseMimeType: 'text/plain'
  });
  const [showConfig, setShowConfig] = useState(true);
  const [showSystem, setShowSystem] = useState(true);

  // For auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Init logic
  useEffect(() => {
    // If version has messages (chat type), use them.
    if (activeVersion.messages && activeVersion.messages.length > 0) {
        setMessages(activeVersion.messages);
    } else if (messages.length === 0 && activeVersion.content) {
        // If text version, convert content to user message
        setMessages([{ id: 'msg-init', role: 'user', content: activeVersion.content }]);
    }

    setSystemInstruction(activeVersion.systemInstruction || '');
    setConfig(activeVersion.config || config);
    // Only set model if valid
    if (activeVersion.model && availableAPIs.find(a => a.id === activeVersion.model)) {
        setSelectedModelId(activeVersion.model);
    }
  }, [activeVersion.id]);

  useEffect(() => {
     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAddMessage = (role: 'user' | 'model') => {
    setMessages(prev => [...prev, {
        id: `msg-${Date.now()}`,
        role,
        content: ''
    }]);
  };

  const handleUpdateMessage = (id: string, content: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content } : m));
  };

  const handleDeleteMessage = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  const handleConfigChange = (key: keyof GenerationConfig, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
  };

  const handleGenerate = async () => {
    if (isLoading) return;
    
    const modelConfig = availableAPIs.find(a => a.id === selectedModelId) || availableAPIs[0];
    if (!modelConfig) return;

    setIsLoading(true);
    
    try {
        // Call API with current history
        const response = await generateChat(
            modelConfig, 
            messages, 
            systemInstruction, 
            config
        );

        // Append model response
        const newMsg: ChatMessage = {
            id: `msg-${Date.now()}`,
            role: 'model',
            content: response.text
        };
        setMessages(prev => [...prev, newMsg]);

    } catch (e: any) {
        setMessages(prev => [...prev, {
            id: `err-${Date.now()}`,
            role: 'model',
            content: `Error: ${e.message}`,
            isError: true
        }]);
    } finally {
        setIsLoading(false);
    }
  };

  const handleSave = () => {
    // When saving from Chat View, we treat it as a chat version
    // Content fallback is the first user message or system prompt
    const fallbackContent = messages.length > 0 ? messages[0].content : '';
    onCommit(fallbackContent, systemInstruction, config, messages, selectedModelId);
  };
  
  const LineNumbers = ({ text }: { text: string }) => {
     const lineCount = text.split('\n').length;
     const lines = Array.from({ length: lineCount }, (_, i) => i + 1);
     return (
        <div className="bg-slate-900/50 text-slate-600 text-right pr-3 py-3 select-none font-mono flex flex-col pointer-events-none min-w-[2.5rem] text-xs leading-relaxed">
            {lines.map(l => <div key={l}>{l}</div>)}
        </div>
     );
  };

  return (
    <div className="flex h-full w-full bg-slate-950 relative overflow-hidden">
        
        {/* LEFT: Main Chat Area */}
        <div className="flex-1 flex flex-col bg-[#0B1120] relative bg-grid-slate-900/[0.04] min-w-0">
            
            {/* Toolbar */}
            <div className="h-12 flex-shrink-0 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-950 z-10">
                <div className="flex items-center gap-4">
                     <div className="flex items-center gap-2">
                        <span className="text-purple-500 font-bold text-xs">CHAT</span>
                        <span className="text-slate-700">/</span>
                        <span className="text-slate-200 font-bold text-xs truncate max-w-[150px]">{activeVersion.name}</span>
                     </div>
                     <div className="h-4 w-px bg-slate-800"></div>
                     <select 
                        value={selectedModelId} 
                        onChange={(e) => setSelectedModelId(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-indigo-500 outline-none max-w-[150px]"
                    >
                        {availableAPIs.map(api => (
                            <option key={api.id} value={api.id}>{api.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowSystem(!showSystem)}
                        className={`p-1.5 rounded text-[10px] font-medium transition-colors ${showSystem ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        System
                    </button>
                    <button 
                        onClick={() => setShowConfig(!showConfig)}
                        className={`p-1.5 rounded text-[10px] font-medium transition-colors ${showConfig ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Config
                    </button>
                    <Button size="sm" onClick={handleSave} className="ml-2 shadow-lg shadow-indigo-900/20">
                        提交版本 (Commit)
                    </Button>
                </div>
            </div>

            {/* System Prompt Drawer */}
            {showSystem && (
                <div className="border-b border-slate-800 bg-slate-900 animate-fadeIn flex flex-col">
                    <div className="flex justify-between items-center p-2 px-4 bg-slate-950/50 border-b border-slate-800/50">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">系统指令 (System Instruction)</label>
                        <button onClick={() => setSystemInstruction('')} className="text-[10px] text-slate-600 hover:text-slate-400">Clear</button>
                    </div>
                    <div className="flex h-32">
                        <LineNumbers text={systemInstruction} />
                        <textarea 
                            className="flex-1 bg-slate-950 border-none p-3 text-xs text-slate-300 focus:ring-0 outline-none resize-none custom-scrollbar leading-relaxed font-mono"
                            value={systemInstruction}
                            onChange={(e) => setSystemInstruction(e.target.value)}
                            placeholder="// 定义 AI 的角色、任务和限制..."
                        />
                    </div>
                </div>
            )}

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-6">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-50">
                        <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                        <span className="text-sm font-bold">开始构建您的对话流</span>
                    </div>
                )}

                {messages.map((msg, index) => (
                    <div key={msg.id} className={`group flex gap-4 animate-fadeIn ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center shadow-lg border border-white/10 ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'}`}>
                             {msg.role === 'user' ? (
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                             ) : (
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                             )}
                        </div>

                        {/* Content Box */}
                        <div className={`relative flex-1 max-w-3xl`}>
                            <div className={`absolute -top-5 ${msg.role === 'user' ? 'right-0' : 'left-0'} flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity`}>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">{msg.role}</span>
                                <button onClick={() => handleDeleteMessage(msg.id)} className="text-slate-600 hover:text-red-400" title="删除消息">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                            </div>

                            <div className={`rounded-2xl p-4 border shadow-md transition-all ${msg.role === 'user' ? 'bg-slate-900 border-indigo-900/50' : 'bg-slate-900 border-slate-800'} ${msg.isError ? 'border-red-500/50 bg-red-900/10' : ''}`}>
                                <textarea 
                                    className="w-full bg-transparent border-none focus:ring-0 focus:outline-none p-0 text-sm text-slate-200 resize-none overflow-hidden leading-relaxed font-sans placeholder-slate-600"
                                    value={msg.content}
                                    onChange={(e) => {
                                        e.target.style.height = 'auto';
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                        handleUpdateMessage(msg.id, e.target.value);
                                    }}
                                    onFocus={(e) => {
                                        e.target.style.height = 'auto';
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                    }}
                                    placeholder={msg.role === 'user' ? "输入 User 消息..." : "输入期望的 AI 回复..."}
                                    rows={1}
                                    style={{ minHeight: '1.5em' }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
                
                {isLoading && (
                    <div className="flex gap-4 animate-pulse">
                        <div className="w-8 h-8 rounded-full bg-emerald-600/20 flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 w-32 h-10"></div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Action Bar */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-center gap-4">
                <div className="flex gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800 shadow-lg">
                    <button 
                        onClick={() => handleAddMessage('user')} 
                        className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold text-indigo-300 hover:bg-indigo-900/30 hover:text-indigo-200 transition-colors"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                        User 消息
                    </button>
                    <div className="w-px bg-slate-800 my-1"></div>
                    <button 
                        onClick={() => handleAddMessage('model')} 
                        className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold text-emerald-300 hover:bg-emerald-900/30 hover:text-emerald-200 transition-colors"
                        title="Pre-fill assistant response (Few-shot)"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                        Model 消息
                    </button>
                </div>

                <Button 
                    onClick={handleGenerate} 
                    isLoading={isLoading}
                    disabled={messages.length === 0}
                    className="shadow-lg shadow-indigo-600/20 px-6"
                >
                    生成回复 / 继续 (Generate) &rarr;
                </Button>
            </div>
        </div>

        {/* RIGHT: Config Panel */}
        {showConfig && (
        <div className="w-64 flex-shrink-0 bg-slate-950 border-l border-slate-800 flex flex-col transition-all duration-300 z-20">
           <div className="h-12 flex-shrink-0 flex items-center px-4 border-b border-slate-800 bg-slate-950">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">参数配置 (Configuration)</span>
           </div>
           
           <div className="p-4 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
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
    </div>
  );
};
