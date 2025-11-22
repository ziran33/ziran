

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PromptVersion, PromptProject, LLMConfig, VariableMap, Attachment } from '../types';
import { Button } from './Button';
import { generateContent, generateChat } from '../services/geminiService';

interface CrossCompareViewProps {
  projects: PromptProject[];
  versions: PromptVersion[];
  availableAPIs: LLMConfig[];
}

interface CompareSlot {
  id: string;
  projectId: string;
  versionId: string;
  // Result state
  output?: string;
  loading: boolean;
  latency?: number;
  tokens?: number;
  error?: boolean;
}

export const CrossCompareView: React.FC<CrossCompareViewProps> = ({
  projects,
  versions,
  availableAPIs
}) => {
  // --- State ---
  const [inputs, setInputs] = useState<VariableMap>({});
  const [slots, setSlots] = useState<CompareSlot[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize with 2 slots if empty
  useEffect(() => {
    if (slots.length === 0 && projects.length > 0) {
      const initialSlots: CompareSlot[] = [];
      
      // Helper to get latest version of a project
      const getLatestVer = (pid: string) => versions.filter(v => v.projectId === pid).sort((a, b) => b.createdAt - a.createdAt)[0];
      
      // Slot 1: First Project
      const p1 = projects[0];
      const v1 = getLatestVer(p1.id);
      if (v1) {
        initialSlots.push({
            id: 'slot-1',
            projectId: p1.id,
            versionId: v1.id,
            loading: false
        });
      }

      // Slot 2: Same Project (Prev Version) OR Second Project
      if (projects.length > 1) {
          const p2 = projects[1];
          const v2 = getLatestVer(p2.id);
          if (v2) {
              initialSlots.push({
                  id: 'slot-2',
                  projectId: p2.id,
                  versionId: v2.id,
                  loading: false
              });
          }
      } else {
          // If only 1 project, try to find 2nd version
          const p1Vers = versions.filter(v => v.projectId === p1.id).sort((a, b) => b.createdAt - a.createdAt);
          if (p1Vers.length > 1) {
               initialSlots.push({
                  id: 'slot-2',
                  projectId: p1.id,
                  versionId: p1Vers[1].id,
                  loading: false
              });
          } else if (v1) {
               // Duplicate active
               initialSlots.push({
                  id: 'slot-2',
                  projectId: p1.id,
                  versionId: v1.id,
                  loading: false
              });
          }
      }
      setSlots(initialSlots);
    }
  }, [projects, versions, availableAPIs]);

  // --- Computed ---
  
  // Merge variables from ALL selected versions
  const mergedVariables = useMemo(() => {
    const varSet = new Set<string>();
    slots.forEach(slot => {
        const ver = versions.find(v => v.id === slot.versionId);
        if (ver) {
            // Extract from Text Content
            const contentMatches = ver.content.match(/{{([^}]+)}}/g);
            if (contentMatches) {
                contentMatches.forEach(m => varSet.add(m.replace(/{{|}}/g, '')));
            }
            
            // Extract from Chat Messages
            if (ver.type === 'chat' && ver.messages) {
                ver.messages.forEach(msg => {
                    const msgMatches = msg.content.match(/{{([^}]+)}}/g);
                    if (msgMatches) {
                        msgMatches.forEach(m => varSet.add(m.replace(/{{|}}/g, '')));
                    }
                });
            }
        }
    });
    return Array.from(varSet).sort();
  }, [slots, versions]);

  // --- Actions ---

  const handleAddSlot = () => {
    if (slots.length >= 5) return;
    const lastSlot = slots[slots.length - 1];
    const newSlot: CompareSlot = {
        id: `slot-${Date.now()}`,
        projectId: lastSlot?.projectId || projects[0]?.id || '',
        versionId: lastSlot?.versionId || '',
        loading: false
    };
    setSlots([...slots, newSlot]);
  };

  const handleRemoveSlot = (index: number) => {
    const newSlots = [...slots];
    newSlots.splice(index, 1);
    setSlots(newSlots);
  };

  const updateSlot = (index: number, updates: Partial<CompareSlot>) => {
    const newSlots = [...slots];
    
    // Logic: If Project changes, auto-select latest version
    if (updates.projectId && updates.projectId !== newSlots[index].projectId) {
        const projVers = versions.filter(v => v.projectId === updates.projectId).sort((a, b) => b.createdAt - a.createdAt);
        updates.versionId = projVers[0]?.id || '';
    }

    newSlots[index] = { ...newSlots[index], ...updates };
    setSlots(newSlots);
  };

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

  // --- Execution ---

  const runSlot = async (index: number) => {
    const slot = slots[index];
    const version = versions.find(v => v.id === slot.versionId);
    // Find the model config associated with this version
    const modelConfig = availableAPIs.find(a => a.id === version?.model);

    if (!version || !modelConfig) return;

    // Set loading
    const newSlots = [...slots];
    newSlots[index] = { ...slot, loading: true, output: '', error: false };
    setSlots(newSlots);

    const start = Date.now();
    try {
        let res;
        
        if (version.type === 'chat' && version.messages) {
            // Handle Chat Generation
            const processedMessages = version.messages.map(msg => {
                let content = msg.content;
                Object.entries(inputs).forEach(([k, v]) => {
                    content = content.replace(new RegExp(`{{${k}}}`, 'g'), v);
                });
                return { ...msg, content };
            });
            
            res = await generateChat(modelConfig, processedMessages, version.systemInstruction, version.config);

        } else {
            // Handle Text Generation
            let prompt = version.content;
            Object.entries(inputs).forEach(([k, v]) => {
                prompt = prompt.replace(new RegExp(`{{${k}}}`, 'g'), v);
            });
            
            res = await generateContent(modelConfig, prompt, version.systemInstruction, version.config, attachments);
        }
        
        setSlots(prev => {
            const updated = [...prev];
            updated[index] = {
                ...updated[index],
                loading: false,
                output: res.text,
                latency: Date.now() - start,
                tokens: res.tokenUsage.totalTokens
            };
            return updated;
        });
    } catch (e: any) {
        setSlots(prev => {
            const updated = [...prev];
            updated[index] = {
                ...updated[index],
                loading: false,
                output: e.message || 'Error generating content',
                error: true
            };
            return updated;
        });
    }
  };

  const runAll = () => {
    slots.forEach((_, idx) => runSlot(idx));
  };

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">
      {/* LEFT SIDEBAR: Input & Controls */}
      <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-slate-800 bg-slate-900 z-10 shadow-xl">
         <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2 bg-slate-950">
            <div className="w-8 h-8 rounded bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            </div>
            <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">高阶对比 (Cross-Check)</h2>
                <p className="text-slate-400 text-[10px]">跨项目/版本/模型对比</p>
            </div>
         </div>

         <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
             {/* Merged Variables */}
             <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">Merged Variables</label>
                    <span className="text-[10px] text-slate-600 font-mono">{mergedVariables.length} vars</span>
                </div>

                {mergedVariables.length === 0 && (
                    <div className="p-4 border border-dashed border-slate-800 rounded text-center text-slate-600 text-xs">
                        所选版本无变量，或未解析到变量。
                    </div>
                )}

                {mergedVariables.map(v => (
                    <div key={v} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-purple-400 bg-purple-950/30 px-1.5 py-0.5 rounded border border-purple-900/30">{`{{${v}}}`}</span>
                        </div>
                        <textarea 
                            placeholder={`输入 ${v} 的测试值...`}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-y min-h-[80px] custom-scrollbar placeholder-slate-700 leading-relaxed"
                            value={inputs[v] || ''}
                            onChange={(e) => setInputs({...inputs, [v]: e.target.value})}
                        />
                    </div>
                ))}
             </div>
             
             {/* Attachments */}
             <div className="space-y-3 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-500 uppercase">Attachments</label>
                    <button onClick={() => fileInputRef.current?.click()} className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                        + 添加文件
                    </button>
                    <input type="file" ref={fileInputRef} multiple className="hidden" onChange={handleFileSelect} />
                </div>
                <div className="grid grid-cols-1 gap-2">
                    {attachments.map(att => (
                        <div key={att.id} className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800 text-xs group">
                            <span className="truncate max-w-[200px] text-slate-300">{att.name}</span>
                            <button onClick={() => setAttachments(p => p.filter(x => x.id !== att.id))} className="text-slate-500 hover:text-red-400">×</button>
                        </div>
                    ))}
                </div>
             </div>
         </div>

         <div className="p-5 border-t border-slate-800 bg-slate-900">
             <Button onClick={runAll} size="lg" className="w-full shadow-lg shadow-indigo-900/20 h-11 flex items-center justify-center gap-2 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                批量运行 ({slots.length})
             </Button>
         </div>
      </div>

      {/* RIGHT: Comparison Grid */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
         {/* Toolbar */}
         <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-950 z-20 flex-shrink-0">
             <div className="flex items-center gap-4 text-xs text-slate-500">
                 <span>Comparison Slots: <span className="text-white font-bold">{slots.length} / 5</span></span>
             </div>
             <button 
                onClick={handleAddSlot}
                disabled={slots.length >= 5}
                className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 hover:text-white transition-all border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
             >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                添加对比槽位
             </button>
         </div>

         {/* Grid Area */}
         <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#0B1120]">
             <div className="h-full flex w-full">
                 {slots.map((slot, idx) => {
                     const projectVersions = versions.filter(v => v.projectId === slot.projectId).sort((a, b) => b.createdAt - a.createdAt);
                     const selectedVersion = versions.find(v => v.id === slot.versionId);
                     const isChat = selectedVersion?.type === 'chat';
                     const modelConfig = availableAPIs.find(a => a.id === selectedVersion?.model);
                     
                     return (
                         <div key={slot.id} className="flex-shrink-0 flex flex-col border-r border-slate-800 bg-slate-950/50 transition-all min-w-[380px] max-w-[500px] flex-1">
                             {/* Slot Header (Selectors) */}
                             <div className="p-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10 flex flex-col gap-2">
                                 <div className="flex items-center justify-between">
                                     <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Slot {idx + 1}</span>
                                     {slots.length > 1 && (
                                         <button onClick={() => handleRemoveSlot(idx)} className="text-slate-600 hover:text-red-400"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                                     )}
                                 </div>
                                 
                                 {/* Selectors */}
                                 <div className="space-y-2">
                                     <select 
                                         className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 focus:border-indigo-500 outline-none"
                                         value={slot.projectId}
                                         onChange={e => updateSlot(idx, { projectId: e.target.value })}
                                     >
                                         {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                     </select>
                                     
                                     <select 
                                         className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs font-bold text-white focus:border-indigo-500 outline-none"
                                         value={slot.versionId}
                                         onChange={e => updateSlot(idx, { versionId: e.target.value })}
                                     >
                                         {projectVersions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                     </select>
                                     
                                     {/* Model Display (Read-only) */}
                                     {selectedVersion && (
                                        <div className="flex items-center justify-between px-2 py-1.5 bg-slate-900 rounded border border-slate-800">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`w-1.5 h-1.5 rounded-full ${modelConfig?.provider === 'gemini' ? 'bg-blue-500' : 'bg-emerald-500'}`}></span>
                                                <span className="text-[10px] text-slate-300 font-mono">{modelConfig?.name || selectedVersion.model}</span>
                                            </div>
                                            <div className="text-[9px] text-slate-500 font-mono">
                                                T:{selectedVersion.config.temperature}
                                            </div>
                                        </div>
                                     )}

                                     {isChat && (
                                         <div className="text-[9px] text-purple-400 bg-purple-900/20 px-2 py-0.5 rounded border border-purple-500/20 text-center">
                                            Chat Mode
                                         </div>
                                     )}
                                 </div>
                             </div>

                             {/* Output Area */}
                             <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative bg-slate-950/30 group border-b border-slate-900">
                                 {slot.loading ? (
                                     <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3">
                                         <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                         <span className="text-xs animate-pulse">Thinking...</span>
                                     </div>
                                 ) : slot.output ? (
                                     <div className={`whitespace-pre-wrap font-mono text-xs leading-relaxed ${slot.error ? 'text-red-400' : 'text-slate-300'}`}>
                                         {slot.output}
                                     </div>
                                 ) : (
                                     <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-50">
                                          <span className="text-[10px]">Waiting to run</span>
                                     </div>
                                 )}
                             </div>

                             {/* Footer Stats */}
                             <div className="px-3 py-2 bg-slate-900/50 flex justify-between items-center text-[10px] font-mono text-slate-500">
                                <div className="flex gap-3">
                                   {slot.latency !== undefined && <span>Lat: <span className="text-emerald-500">{slot.latency}ms</span></span>}
                                   {slot.tokens !== undefined && <span>Tok: <span className="text-indigo-400">{slot.tokens}</span></span>}
                                </div>
                                <button onClick={() => runSlot(idx)} className="hover:text-white flex items-center gap-1">
                                    Run <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path></svg>
                                </button>
                             </div>
                         </div>
                     );
                 })}
             </div>
         </div>
      </div>
    </div>
  );
};