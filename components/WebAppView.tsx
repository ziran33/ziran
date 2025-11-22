
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { PromptVersion, PromptProject, LLMConfig, ServiceDeployment, Attachment, ServiceApiKey, ServiceLog } from '../types';
import { generateContent, generateChat } from '../services/geminiService';
import { executeWorkflowEngine } from '../services/workflowExecution';
import { Button } from './Button';
import { useAuth } from '../contexts/AuthContext';

interface WebAppViewProps {
  projects: PromptProject[];
  versions: PromptVersion[];
  availableAPIs: LLMConfig[];
  services: ServiceDeployment[];
  onUpdateServices: (services: ServiceDeployment[]) => void;
}

export const WebAppView: React.FC<WebAppViewProps> = ({
  projects,
  versions,
  availableAPIs,
  services,
  onUpdateServices
}) => {
  const { user } = useAuth();
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'keys' | 'logs' | 'integration' | 'playground'>('overview');

  // Form State for Creating/Editing
  const [formId, setFormId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formProjectId, setFormProjectId] = useState('');
  const [formVersionId, setFormVersionId] = useState('');
  
  // Client Code State
  const [clientLang, setClientLang] = useState<'python' | 'js' | 'curl'>('python');

  // Playground State
  const [playInputs, setPlayInputs] = useState<Record<string, string>>({});
  const [playQuery, setPlayQuery] = useState(''); // Dedicated Query Input
  const [playAttachments, setPlayAttachments] = useState<Attachment[]>([]);
  const [playOutput, setPlayOutput] = useState('');
  const [isPlayRunning, setIsPlayRunning] = useState(false);
  const [playSelectedKeyId, setPlaySelectedKeyId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Logs State
  const [selectedLog, setSelectedLog] = useState<ServiceLog | null>(null);
  const [logPage, setLogPage] = useState(1);
  const LOGS_PER_PAGE = 10;

  const selectedService = useMemo(() => services.find(s => s.id === selectedServiceId), [services, selectedServiceId]);
  const activeProject = useMemo(() => projects.find(p => p.id === selectedService?.projectId), [projects, selectedService]);
  const activeVersion = useMemo(() => versions.find(v => v.id === selectedService?.versionId), [versions, selectedService]);
  // Model is derived from the Version now
  const activeModel = useMemo(() => availableAPIs.find(a => a.id === selectedService?.modelConfigId), [availableAPIs, selectedService]);

  // Calculated stats from logs
  const stats = useMemo(() => {
    if (!selectedService) return { totalCalls: 0, totalTokens: 0, avgLatency: 0, errorRate: '0.0' };
    
    const totalCalls = selectedService.logs.length;
    if (totalCalls === 0) return { totalCalls: 0, totalTokens: 0, avgLatency: 0, errorRate: '0.0' };

    const totalTokens = selectedService.logs.reduce((acc, log) => acc + log.tokens, 0);
    const totalLatency = selectedService.logs.reduce((acc, log) => acc + log.latency, 0);
    const errors = selectedService.logs.filter(log => log.status >= 400).length;

    return {
        totalCalls,
        totalTokens,
        avgLatency: Math.round(totalLatency / totalCalls),
        errorRate: ((errors / totalCalls) * 100).toFixed(1)
    };
  }, [selectedService]);

  // Set default playground key when service changes
  useEffect(() => {
    if (selectedService && selectedService.apiKeys.length > 0) {
        setPlaySelectedKeyId(selectedService.apiKeys[0].id);
    }
    setLogPage(1); // Reset log page
    setPlayQuery('');
    setPlayInputs({});
    setPlayOutput('');
    setPlayAttachments([]);
  }, [selectedServiceId]);

  const handleCreate = () => {
    setIsEditing(true);
    setFormId(null);
    setFormName('');
    setFormDesc('');
    setFormProjectId(projects[0]?.id || '');
    setFormVersionId('');
    setSelectedServiceId(null);
  };

  const handleEditService = (e: React.MouseEvent, service: ServiceDeployment) => {
    e.stopPropagation();
    setFormId(service.id);
    setFormName(service.name);
    setFormDesc(service.description || '');
    setFormProjectId(service.projectId);
    setFormVersionId(service.versionId);
    setIsEditing(true);
    setSelectedServiceId(service.id);
  };

  const handleSubmitForm = () => {
    if (!formName || !formProjectId || !formVersionId) return;
    
    // Auto-detect model from the selected version
    const selectedVerObj = versions.find(v => v.id === formVersionId);
    const autoModelId = selectedVerObj ? selectedVerObj.model : (availableAPIs[0]?.id || '');

    if (formId) {
        // Update Existing
        const updatedServices = services.map(s => s.id === formId ? {
            ...s,
            name: formName,
            description: formDesc,
            projectId: formProjectId,
            versionId: formVersionId,
            modelConfigId: autoModelId // Sync model with version
        } : s);
        onUpdateServices(updatedServices);
    } else {
        // Create New
        const newService: ServiceDeployment = {
            id: `srv-${Date.now()}`,
            userId: user?.id || 'anonymous',
            name: formName,
            description: formDesc,
            projectId: formProjectId,
            versionId: formVersionId,
            modelConfigId: autoModelId, // Sync model with version
            isActive: true,
            createdAt: Date.now(),
            apiKeys: [],
            logs: []
        };
        onUpdateServices([...services, newService]);
        setSelectedServiceId(newService.id);
    }
    setIsEditing(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('确定要删除此服务吗？此操作不可撤销。')) {
        onUpdateServices(services.filter(s => s.id !== id));
        if (selectedServiceId === id) setSelectedServiceId(null);
    }
  };

  const handleToggleServiceStatus = () => {
    if (!selectedService) return;
    const updatedService = { ...selectedService, isActive: !selectedService.isActive };
    onUpdateServices(services.map(s => s.id === selectedService.id ? updatedService : s));
  };

  // --- Key Management ---
  const handleCreateKey = () => {
    if (!selectedService) return;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomString = '';
    for (let i = 0; i < 48; i++) { randomString += chars.charAt(Math.floor(Math.random() * chars.length)); }
    const newKey: ServiceApiKey = {
        id: `key-${Date.now()}`,
        name: `Secret Key - ${new Date().toISOString().split('T')[0]}`,
        key: `sk-${randomString}`,
        createdAt: Date.now(),
        isActive: true
    };
    const updatedService = { ...selectedService, apiKeys: [...selectedService.apiKeys, newKey] };
    onUpdateServices(services.map(s => s.id === selectedService.id ? updatedService : s));
  };

  const handleToggleKey = (keyId: string) => {
    if (!selectedService) return;
    const updatedKeys = selectedService.apiKeys.map(k => k.id === keyId ? { ...k, isActive: !k.isActive } : k);
    onUpdateServices(services.map(s => s.id === selectedService.id ? { ...selectedService, apiKeys: updatedKeys } : s));
  };

  const handleDeleteKey = (keyId: string) => {
    if (!selectedService) return;
    if (!window.confirm("确定删除此 API Key？")) return;
    const newKeys = selectedService.apiKeys.filter(k => k.id !== keyId);
    const updatedService = { ...selectedService, apiKeys: newKeys };
    onUpdateServices(services.map(s => s.id === selectedService.id ? updatedService : s));
  };

  // --- Logs Management ---
  const handleClearLogs = () => {
    if (!selectedService) return;
    if (!window.confirm("确定清空所有调用日志吗？")) return;
    onUpdateServices(services.map(s => s.id === selectedService.id ? { ...s, logs: [] } : s));
    setLogPage(1);
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
            setPlayAttachments(prev => [...prev, newAtt]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const pagedLogs = useMemo(() => {
    if (!selectedService) return [];
    const sorted = [...selectedService.logs].sort((a, b) => b.timestamp - a.timestamp);
    const start = (logPage - 1) * LOGS_PER_PAGE;
    return sorted.slice(start, start + LOGS_PER_PAGE);
  }, [selectedService, logPage]);

  const totalLogPages = selectedService ? Math.ceil(selectedService.logs.length / LOGS_PER_PAGE) : 0;

  // --- Playground Execution ---
  const handlePlaygroundRun = async () => {
    if (!activeVersion || !selectedService) return;
    
    setIsPlayRunning(true);
    setPlayOutput('');
    const start = Date.now();

    // Prepare final inputs
    const finalInputs = { ...playInputs };
    if (playQuery) {
        finalInputs['query'] = playQuery;
    }

    const requestSnapshot = {
        deployment: selectedService.name,
        type: activeVersion.type || 'text',
        query: playQuery,
        variables: finalInputs,
        attachmentCount: playAttachments.length,
        timestamp: new Date().toISOString()
    };

    const requestUrl = `/api/gateway/${selectedService.id}/run`;

    // Service/Key Checks
    if (!selectedService.isActive) {
        setPlayOutput("Error: Service is currently disabled.");
        setIsPlayRunning(false);
        return;
    }
    const apiKey = selectedService.apiKeys.find(k => k.id === playSelectedKeyId);
    if (!apiKey || !apiKey.isActive) {
        setPlayOutput("Error: 403 Forbidden (Invalid API Key)");
        setIsPlayRunning(false);
        return;
    }

    try {
        let resText = "";
        let totalTokens = 0;

        // --- EXECUTION LOGIC ---
        
        if (activeVersion.type === 'workflow') {
             // WORKFLOW EXECUTION
             let graph;
             try { graph = JSON.parse(activeVersion.content); } catch { throw new Error("Invalid workflow graph"); }
             
             if (graph && graph.nodes) {
                 // Workflow logic: Passes inputs + attachments to engine
                 const log = await executeWorkflowEngine(
                    graph.nodes, 
                    graph.edges, 
                    finalInputs, 
                    playAttachments, 
                    versions, 
                    availableAPIs
                 );
                 
                 if (log.status === 'error') {
                     throw new Error(log.steps.find(s => s.status === 'error')?.output || 'Unknown Workflow Error');
                 }
                 
                 // For workflow, we show the final output if defined, or a JSON of all outputs
                 resText = log.outputs['final'] || JSON.stringify(log.outputs, null, 2);
                 // Calculate mock tokens or sum from logs
                 totalTokens = 0; 
             }

        } else if (activeVersion.type === 'chat') {
             // CHAT EXECUTION
             if (!activeModel) throw new Error("Model config missing");

             const processedMessages = (activeVersion.messages || []).map(msg => {
                let content = msg.content;
                // Regex replacement for variables in chat history
                Object.entries(finalInputs).forEach(([k, v]) => {
                    const regex = new RegExp(`{{${k}}}`, 'g');
                    // Only replace if it's a valid string (simple replacement)
                    if (typeof v === 'string') {
                         content = content.replace(regex, v);
                    }
                });
                return { ...msg, content };
             });

             // If user provided a query and it wasn't used as a variable, append it
             const isQueryUsed = activeVersion.messages?.some(m => m.content.includes('{{query}}'));
             if (playQuery && !isQueryUsed) {
                 processedMessages.push({ id: 'temp-user', role: 'user', content: playQuery });
             }

             const res = await generateChat(activeModel, processedMessages, activeVersion.systemInstruction, activeVersion.config, playAttachments);
             resText = res.text;
             totalTokens = res.tokenUsage.totalTokens;

        } else {
             // SINGLE PROMPT (TEXT) EXECUTION
             if (!activeModel) throw new Error("Model config missing");

             let prompt = activeVersion.content;
             Object.entries(finalInputs).forEach(([k, v]) => {
                prompt = prompt.replace(new RegExp(`{{${k}}}`, 'g'), v);
             });

             // If query provided but not in template, append it
             if (playQuery && !activeVersion.content.includes('{{query}}')) {
                 prompt += `\n\n${playQuery}`;
             }

             const res = await generateContent(activeModel, prompt, activeVersion.systemInstruction, activeVersion.config, playAttachments);
             resText = res.text;
             totalTokens = res.tokenUsage.totalTokens;
        }
        
        setPlayOutput(resText);
        
        // Log Success
        const successLog: ServiceLog = {
            id: `log-${Date.now()}`,
            timestamp: Date.now(),
            keyName: apiKey.name,
            status: 200,
            latency: Date.now() - start,
            tokens: totalTokens,
            requestBody: JSON.stringify(requestSnapshot, null, 2),
            responseBody: resText,
            requestUrl
        };
        
        const newLogs = [successLog, ...selectedService.logs];
        onUpdateServices(services.map(s => s.id === selectedService.id ? { ...s, logs: newLogs } : s));

    } catch (e: any) {
        setPlayOutput(`Error: ${e.message}`);
        const failLog: ServiceLog = {
            id: `log-${Date.now()}`,
            timestamp: Date.now(),
            keyName: apiKey.name,
            status: 500,
            latency: Date.now() - start,
            tokens: 0,
            error: e.message,
            requestBody: JSON.stringify(requestSnapshot, null, 2),
            responseBody: JSON.stringify({ error: e.message }),
            requestUrl
        };
        onUpdateServices(services.map(s => s.id === selectedService.id ? { ...s, logs: [failLog, ...selectedService.logs] } : s));
    } finally {
        setIsPlayRunning(false);
    }
  };

  // Form Data
  const formVersions = useMemo(() => versions.filter(v => v.projectId === formProjectId).sort((a,b) => b.createdAt - a.createdAt), [versions, formProjectId]);

  // Variable Detection for Playground
  const detectedVariables = useMemo(() => {
      if (!activeVersion) return [];
      
      // WORKFLOW: Parse JSON to find Start Node inputs
      if (activeVersion.type === 'workflow') {
          try {
              const graph = JSON.parse(activeVersion.content);
              const startNode = graph.nodes?.find((n: any) => n.type === 'start');
              return startNode?.data?.globalInputs?.map((i: any) => i.name) || [];
          } catch {
              return [];
          }
      }
      
      // TEXT / CHAT: Regex parse
      const vars = new Set<string>();
      const contentMatches = activeVersion.content.match(/{{([^}]+)}}/g);
      if (contentMatches) {
          contentMatches.forEach(m => vars.add(m.replace(/{{|}}/g, '')));
      }
      
      if (activeVersion.messages) {
          activeVersion.messages.forEach(msg => {
              const msgMatches = msg.content.match(/{{([^}]+)}}/g);
              if (msgMatches) {
                  msgMatches.forEach(m => vars.add(m.replace(/{{|}}/g, '')));
              }
          });
      }
      // Remove 'query' as it has a dedicated input field
      vars.delete('query');
      return Array.from(vars);
  }, [activeVersion]);

  // Client Code Generation
  const getClientCode = (lang: 'python' | 'js' | 'curl') => {
    if (!selectedService) return '';
    const endpoint = `https://api.promptlab.com/api/gateway/${selectedService.id}/run`;
    const demoKey = selectedService.apiKeys[0]?.key || 'sk-YOUR_API_KEY';
    
    const payloadObj = {
        query: "User Query",
        variables: detectedVariables.reduce((acc: Record<string, string>, curr: string) => {
            acc[curr] = "value";
            return acc;
        }, {})
    };

    if (lang === 'python') {
        return `import requests
import json

url = "${endpoint}"

headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ${demoKey}'
}

payload = ${JSON.stringify(payloadObj, null, 2)}

response = requests.post(url, headers=headers, data=json.dumps(payload))

print(response.status_code)
print(response.json())`;
    }

    if (lang === 'js') {
        return `const url = "${endpoint}";

const payload = ${JSON.stringify(payloadObj, null, 2)};

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ${demoKey}'
  },
  body: JSON.stringify(payload)
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));`;
    }

    if (lang === 'curl') {
        return `curl --location '${endpoint}' \\
--header 'Content-Type: application/json' \\
--header 'Authorization: Bearer ${demoKey}' \\
--data '${JSON.stringify(payloadObj)}'`;
    }
    return '';
  };

  return (
    <div className="h-full w-full flex bg-slate-950 text-slate-200 font-sans overflow-hidden">
      
      {/* LEFT SIDEBAR: Service List */}
      <div className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col z-20">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">服务列表 (Services)</span>
            <button onClick={handleCreate} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded transition-colors">
                + 新建
            </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {services.map(s => (
                <div 
                    key={s.id} 
                    onClick={() => { setSelectedServiceId(s.id); setIsEditing(false); }}
                    className={`p-3 rounded-lg cursor-pointer border transition-all group relative ${selectedServiceId === s.id ? 'bg-indigo-600/10 border-indigo-500/50 ring-1 ring-indigo-500/20' : 'bg-slate-800/30 border-transparent hover:bg-slate-800 hover:border-slate-700'}`}
                >
                    <div className="flex justify-between items-start mb-1 pr-4">
                        <span className={`text-sm font-medium truncate ${selectedServiceId === s.id ? 'text-indigo-300' : 'text-slate-300'}`}>{s.name}</span>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.isActive ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`}></span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                         <span className="font-mono">Calls: {s.logs.length}</span>
                    </div>
                    <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 bg-slate-900 rounded border border-slate-700 p-0.5 shadow-xl z-10">
                         <button onClick={(e) => handleEditService(e, s)} className="p-1 hover:bg-indigo-900/50 hover:text-indigo-400 rounded" title="编辑">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                         </button>
                         <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="p-1 hover:bg-red-900/50 hover:text-red-400 rounded" title="删除">
                             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                         </button>
                    </div>
                </div>
            ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
         {isEditing ? (
             // CREATE / EDIT FORM
             <div className="flex-1 flex items-center justify-center p-6 animate-fadeIn">
                 <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl">
                    <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <span className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg></span>
                        {formId ? '编辑服务 (Edit Service)' : '创建新服务 (Create Service)'}
                    </h2>
                    <div className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">服务名称 (Service Name)</label>
                            <input className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none" value={formName} onChange={e => setFormName(e.target.value)} placeholder="例如: 客户支持机器人 API" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">描述 (Description)</label>
                            <textarea className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none resize-none h-20" value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="用于接入移动端 App 的智能对话接口..." />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">关联项目 (Project)</label>
                                <select className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none" value={formProjectId} onChange={e => { setFormProjectId(e.target.value); setFormVersionId(''); }}>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">提示词版本 (Prompt Ver)</label>
                                <select className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-indigo-500 outline-none" value={formVersionId} onChange={e => setFormVersionId(e.target.value)} disabled={!formProjectId}>
                                    <option value="">选择版本...</option>
                                    {formVersions.map(v => {
                                        let typeLabel = "[TEXT]";
                                        if (v.type === 'chat') typeLabel = "[CHAT]";
                                        if (v.type === 'workflow') typeLabel = "[WORKFLOW]";
                                        return (
                                            <option key={v.id} value={v.id}>
                                                {typeLabel} {v.name}
                                            </option>
                                        );
                                    })}
                                </select>
                                <p className="text-[10px] text-slate-500 mt-1">系统将自动识别版本类型（文本/对话/工作流）。</p>
                             </div>
                        </div>
                    </div>
                    <div className="mt-8 flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => { setIsEditing(false); setSelectedServiceId(formId); }}>取消</Button>
                        <Button onClick={handleSubmitForm}>{formId ? '保存更改' : '立即创建'}</Button>
                    </div>
                 </div>
             </div>
         ) : selectedService ? (
             // SERVICE DASHBOARD
             <div className="flex flex-col h-full animate-fadeIn">
                 {/* Header */}
                 <div className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-950 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-900/20">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-lg font-bold text-white leading-none">{selectedService.name}</h1>
                                <button 
                                    onClick={handleToggleServiceStatus}
                                    className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full border transition-all ${selectedService.isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'}`}
                                    title="点击切换服务状态"
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full ${selectedService.isActive ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                                    {selectedService.isActive ? '运行中 (Active)' : '已停用 (Disabled)'}
                                </button>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 font-mono">
                                <span>{activeProject?.name}</span>
                                <span className="text-slate-700">/</span>
                                <span className="text-indigo-400">{activeVersion?.name}</span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[9px] uppercase text-emerald-500">
                                    {activeVersion?.type || 'TEXT'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                        {[
                            {id: 'overview', label: '概览'},
                            {id: 'keys', label: '密钥'},
                            {id: 'logs', label: '日志'},
                            {id: 'integration', label: '客户端集成'},
                            {id: 'playground', label: '在线调试'}
                        ].map(t => (
                            <button 
                                key={t.id}
                                onClick={() => setActiveTab(t.id as any)} 
                                className={`px-4 py-1.5 text-xs font-medium rounded transition-colors ${activeTab === t.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                 </div>

                 <div className="flex-1 overflow-y-auto p-8">
                    
                    {/* TAB: OVERVIEW */}
                    {activeTab === 'overview' && (
                        <div className="space-y-8 max-w-5xl mx-auto">
                             {/* Endpoint Box */}
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
                                <h3 className="text-sm font-bold text-white mb-2">Service Endpoint</h3>
                                <div className="flex items-center gap-2 bg-black rounded-lg border border-slate-800 p-3 font-mono text-sm text-emerald-400">
                                    <span className="text-indigo-400 font-bold">POST</span>
                                    <span className="truncate select-all">https://api.promptlab.com/api/gateway/{selectedService.id}/run</span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-2">
                                    * 生产环境真实端点。请确保已配置 API Key 进行访问。
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                                    <div className="text-slate-500 text-xs font-bold uppercase mb-1">调用总数</div>
                                    <div className="text-3xl font-bold text-white font-mono">{stats.totalCalls.toLocaleString()}</div>
                                </div>
                                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                                    <div className="text-slate-500 text-xs font-bold uppercase mb-1">平均延迟</div>
                                    <div className="text-3xl font-bold text-emerald-400 font-mono">{stats.avgLatency}ms</div>
                                </div>
                                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                                    <div className="text-slate-500 text-xs font-bold uppercase mb-1">Token 消耗</div>
                                    <div className="text-3xl font-bold text-indigo-400 font-mono">{(stats.totalTokens / 1000).toFixed(1)}k</div>
                                </div>
                                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                                    <div className="text-slate-500 text-xs font-bold uppercase mb-1">错误率</div>
                                    <div className={`text-3xl font-bold font-mono ${parseFloat(stats.errorRate) > 5 ? 'text-red-400' : 'text-slate-300'}`}>{stats.errorRate}%</div>
                                </div>
                            </div>
                            
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                                <h3 className="text-sm font-bold text-white mb-4 border-b border-slate-800 pb-2">版本快照 (Snapshot)</h3>
                                <dl className="grid grid-cols-2 gap-x-12 gap-y-6 text-sm">
                                    <div className="flex justify-between border-b border-slate-800/50 pb-2">
                                        <dt className="text-slate-500">版本类型</dt>
                                        <dd className="text-slate-200 font-mono uppercase">{activeVersion?.type || 'TEXT'}</dd>
                                    </div>
                                    {activeVersion?.type !== 'workflow' && (
                                    <div className="flex justify-between border-b border-slate-800/50 pb-2">
                                        <dt className="text-slate-500">绑定模型</dt>
                                        <dd className="text-slate-200 font-mono">{activeModel?.name || selectedService.modelConfigId}</dd>
                                    </div>
                                    )}
                                    <div className="flex justify-between border-b border-slate-800/50 pb-2">
                                        <dt className="text-slate-500">版本号</dt>
                                        <dd className="text-slate-200 font-mono">{activeVersion?.name}</dd>
                                    </div>
                                    {activeVersion?.type !== 'workflow' && (
                                    <>
                                        <div className="col-span-2 space-y-2">
                                            <dt className="text-slate-500 text-xs font-bold uppercase">System Instruction</dt>
                                            <dd className="bg-black/30 p-3 rounded border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
                                                {activeVersion?.systemInstruction || "N/A"}
                                            </dd>
                                        </div>
                                        <div className="flex justify-between border-b border-slate-800/50 pb-2">
                                            <dt className="text-slate-500">Temperature</dt>
                                            <dd className="text-slate-200 font-mono">{activeVersion?.config.temperature}</dd>
                                        </div>
                                    </>
                                    )}
                                </dl>
                            </div>
                        </div>
                    )}

                    {/* TAB: KEYS */}
                     {activeTab === 'keys' && (
                        <div className="max-w-4xl mx-auto">
                             <div className="flex justify-between items-end mb-4">
                                <div>
                                    <h3 className="text-sm font-bold text-white">API Access Keys</h3>
                                </div>
                                <Button size="xs" onClick={handleCreateKey}>生成新 Key</Button>
                            </div>

                            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-950 text-[10px] font-bold uppercase text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3">名称</th>
                                            <th className="px-4 py-3">Key</th>
                                            <th className="px-4 py-3">状态</th>
                                            <th className="px-4 py-3 text-right">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 text-xs">
                                        {selectedService.apiKeys.map(key => (
                                            <tr key={key.id} className="hover:bg-slate-800/50">
                                                <td className="px-4 py-3 text-slate-300">{key.name}</td>
                                                <td className="px-4 py-3 font-mono text-slate-400 select-all">{key.key}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${key.isActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-700 border-slate-600 text-slate-400'}`}>
                                                        {key.isActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right flex justify-end gap-2">
                                                    <Button variant="secondary" size="xs" onClick={() => handleToggleKey(key.id)}>{key.isActive ? '冻结' : '启用'}</Button>
                                                    <Button variant="danger" size="xs" onClick={() => handleDeleteKey(key.id)}>删除</Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB: INTEGRATION (CLIENT SDK) */}
                    {activeTab === 'integration' && (
                        <div className="max-w-4xl mx-auto space-y-6">
                             <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="text-sm font-bold text-white">客户端集成 SDK (Client SDK)</h3>
                                    <p className="text-xs text-slate-500">直接可用的代码片段，集成到您的应用中。</p>
                                </div>
                                <div className="flex bg-slate-900 rounded p-1 border border-slate-800">
                                    {(['python', 'js', 'curl'] as const).map(lang => (
                                        <button
                                            key={lang}
                                            onClick={() => setClientLang(lang)}
                                            className={`px-3 py-1 text-[10px] font-bold uppercase rounded transition-all ${clientLang === lang ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            {lang}
                                        </button>
                                    ))}
                                </div>
                             </div>

                             <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden relative group">
                                 <div className="absolute top-3 right-3">
                                     <button 
                                        onClick={() => navigator.clipboard.writeText(getClientCode(clientLang))}
                                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] px-2 py-1 rounded border border-slate-600 transition-colors"
                                     >
                                         Copy Code
                                     </button>
                                 </div>
                                 <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto custom-scrollbar leading-relaxed">
                                     {getClientCode(clientLang)}
                                 </pre>
                             </div>
                        </div>
                    )}

                    {/* TAB: PLAYGROUND */}
                    {activeTab === 'playground' && (
                        <div className="max-w-4xl mx-auto space-y-6">
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    在线调试 (Live Debug) - {activeVersion?.type?.toUpperCase() || 'TEXT'} MODE
                                </h3>
                                
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">API Key</label>
                                        <select className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-300 outline-none" value={playSelectedKeyId} onChange={e => setPlaySelectedKeyId(e.target.value)}>
                                            {selectedService.apiKeys.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Dedicated Query Input */}
                                <div className="mb-4">
                                    <label className="block text-xs font-bold text-emerald-500 uppercase mb-1.5">{'User Query ({{query}})'}</label>
                                    <textarea 
                                        className="w-full bg-slate-950 border border-emerald-500/30 rounded px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none resize-none h-20 placeholder-emerald-900/50"
                                        placeholder="输入用户问题..."
                                        value={playQuery}
                                        onChange={e => setPlayQuery(e.target.value)}
                                    />
                                </div>

                                {/* Variables */}
                                {detectedVariables.length > 0 && (
                                    <div className="space-y-3 mb-6 p-4 bg-slate-950/50 rounded border border-slate-800">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Template Variables</h4>
                                        {detectedVariables.map(varName => (
                                            <div key={varName}>
                                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">{varName}</label>
                                                <input 
                                                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-white outline-none"
                                                    placeholder={`Value for ${varName}`}
                                                    value={playInputs[varName] || ''}
                                                    onChange={e => setPlayInputs({...playInputs, [varName]: e.target.value})}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                {/* Attachment Upload */}
                                <div className="mb-6">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase">Attachments (附件)</label>
                                        <button onClick={() => fileInputRef.current?.click()} className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                                            + 添加文件
                                        </button>
                                        <input type="file" ref={fileInputRef} multiple className="hidden" onChange={handleFileSelect} />
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {playAttachments.map(att => (
                                            <div key={att.id} className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800 text-xs group">
                                                <span className="truncate max-w-[200px] text-slate-300">{att.name}</span>
                                                <button onClick={() => setPlayAttachments(p => p.filter(x => x.id !== att.id))} className="text-slate-500 hover:text-red-400">×</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Button onClick={handlePlaygroundRun} isLoading={isPlayRunning} className="w-full">发送请求</Button>

                                {playOutput && (
                                    <div className="mt-6 border-t border-slate-800 pt-4">
                                        <div className="bg-black rounded border border-slate-800 p-4 text-xs font-mono text-slate-300 whitespace-pre-wrap max-h-80 overflow-y-auto">
                                            {playOutput}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB: LOGS */}
                    {activeTab === 'logs' && (
                        <div className="max-w-4xl mx-auto">
                             <div className="flex justify-between items-center mb-4">
                                 <h3 className="text-sm font-bold text-white">调用日志 ({selectedService.logs.length})</h3>
                                 <div className="flex gap-2">
                                    {selectedService.logs.length > 0 && (
                                        <Button size="xs" variant="danger" onClick={handleClearLogs}>清空日志</Button>
                                    )}
                                 </div>
                             </div>

                             <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-4">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-950 text-[10px] font-bold uppercase text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3">时间</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Latency</th>
                                            <th className="px-4 py-3 text-right">Tokens</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 text-xs">
                                        {pagedLogs.map(log => (
                                            <tr key={log.id} className="hover:bg-slate-800/50 cursor-pointer" onClick={() => setSelectedLog(log)}>
                                                <td className="px-4 py-3 font-mono text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                                <td className="px-4 py-3"><span className={`px-1 rounded ${log.status === 200 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>{log.status}</span></td>
                                                <td className="px-4 py-3">{log.latency}ms</td>
                                                <td className="px-4 py-3 text-right text-indigo-400">{log.tokens}</td>
                                            </tr>
                                        ))}
                                        {pagedLogs.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-600">无日志</td></tr>}
                                    </tbody>
                                </table>
                             </div>
                             
                             {/* Pagination */}
                             {totalLogPages > 1 && (
                                 <div className="flex justify-center gap-2">
                                     <button disabled={logPage === 1} onClick={() => setLogPage(p => p - 1)} className="px-3 py-1 bg-slate-900 border border-slate-800 rounded text-xs disabled:opacity-50">Previous</button>
                                     <span className="text-xs text-slate-500 flex items-center">{logPage} / {totalLogPages}</span>
                                     <button disabled={logPage === totalLogPages} onClick={() => setLogPage(p => p + 1)} className="px-3 py-1 bg-slate-900 border border-slate-800 rounded text-xs disabled:opacity-50">Next</button>
                                 </div>
                             )}
                        </div>
                    )}
                 </div>
             </div>
         ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                <div className="w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                    <svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                </div>
                <h3 className="text-lg font-bold text-slate-400">选择服务以管理 API</h3>
             </div>
         )}
      </div>

       {/* Log Detail Modal */}
       {selectedLog && (
           <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-fadeIn">
               <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
                   <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                       <h3 className="text-sm font-bold text-white">日志详情</h3>
                       <button onClick={() => setSelectedLog(null)} className="text-slate-500 hover:text-white">✕</button>
                   </div>
                   <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                       <div className="bg-black rounded border border-slate-800 p-4">
                           <pre className="text-xs font-mono text-slate-300 overflow-x-auto">{selectedLog.responseBody}</pre>
                       </div>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
};
