
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Dataset, TestCase, BatchRun, PromptProject, PromptVersion, LLMConfig, 
  Attachment, VariableMap, BatchResult 
} from '../types';
import { Button } from './Button';
import { generateContent, generateChat } from '../services/geminiService';
import { executeWorkflowEngine } from '../services/workflowExecution';

interface BatchTestViewProps {
  projects: PromptProject[];
  versions: PromptVersion[];
  availableAPIs: LLMConfig[];
  datasets: Dataset[];
  onUpdateDatasets: (datasets: Dataset[]) => void;
  batchRuns: BatchRun[];
  onUpdateBatchRuns: (runs: BatchRun[] | ((prev: BatchRun[]) => BatchRun[])) => void;
}

export const BatchTestView: React.FC<BatchTestViewProps> = ({
  projects,
  versions,
  availableAPIs,
  datasets,
  onUpdateDatasets,
  batchRuns,
  onUpdateBatchRuns
}) => {
  const [activeTab, setActiveTab] = useState<'datasets' | 'history'>('datasets');
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  
  // Dataset Editor State
  const [isEditingDataset, setIsEditingDataset] = useState(false);
  const [editDsName, setEditDsName] = useState('');
  const [editDsVars, setEditDsVars] = useState<string[]>(['query']); // Default variable
  const [editDsCases, setEditDsCases] = useState<TestCase[]>([]);
  const [editDsId, setEditDsId] = useState<string | null>(null); // If editing existing

  // Runner State
  const [runProjectId, setRunProjectId] = useState('');
  const [runVersionId, setRunVersionId] = useState('');
  const [runModelId, setRunModelId] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeCaseForAttachment, setActiveCaseForAttachment] = useState<string | null>(null);

  // --- Helpers ---
  const getLatestVersion = (pid: string) => versions.filter(v => v.projectId === pid).sort((a, b) => b.createdAt - a.createdAt)[0];
  
  const getVarsFromVersion = (vid: string): string[] => {
      const v = versions.find(ver => ver.id === vid);
      if (!v) return [];
      const vars = new Set<string>();
      
      const extract = (text: string) => (text.match(/{{([^}]+)}}/g) || []).forEach((m: string) => vars.add(m.replace(/{{|}}/g, '')));
      
      if (v.type === 'text') extract(v.content);
      if (v.type === 'chat' && v.messages) v.messages.forEach(m => extract(m.content));
      if (v.type === 'workflow' && v.content) {
          try {
              const graph = JSON.parse(v.content);
              const startNode = graph.nodes?.find((n: any) => n.type === 'start');
              startNode?.data?.globalInputs?.forEach((i: any) => vars.add(i.name));
          } catch {}
      }
      return Array.from(vars);
  };

  // --- Dataset Actions ---

  const handleCreateDataset = () => {
      setEditDsId(null);
      setEditDsName("New Dataset");
      setEditDsVars(['query']);
      setEditDsCases([{ id: `case-${Date.now()}`, inputs: { query: '' }, attachments: [] }]);
      setIsEditingDataset(true);
      setSelectedDatasetId(null);
  };

  const handleEditDataset = (ds: Dataset) => {
      setEditDsId(ds.id);
      setEditDsName(ds.name);
      setEditDsVars(ds.variables);
      // Deep copy cases to avoid mutating state directly
      setEditDsCases(JSON.parse(JSON.stringify(ds.cases)));
      setIsEditingDataset(true);
      setSelectedDatasetId(ds.id);
  };

  const handleDeleteDataset = (id: string) => {
      if(window.confirm("确定删除此样本集？")) {
          onUpdateDatasets(datasets.filter(d => d.id !== id));
          if (selectedDatasetId === id) setSelectedDatasetId(null);
      }
  };

  const handleSaveDataset = () => {
      if (!editDsName) return;
      const newDataset: Dataset = {
          id: editDsId || `ds-${Date.now()}`,
          userId: 'current-user', // App handles user filtering, so simple string is fine or pass User prop
          name: editDsName,
          variables: editDsVars,
          cases: editDsCases,
          updatedAt: Date.now()
      };

      if (editDsId) {
          onUpdateDatasets(datasets.map(d => d.id === editDsId ? newDataset : d));
      } else {
          onUpdateDatasets([newDataset, ...datasets]);
      }
      setIsEditingDataset(false);
      setSelectedDatasetId(newDataset.id);
  };

  // --- Dataset Editor Logic ---
  
  const addVariableColumn = () => {
      const name = prompt("输入变量名称 (例如: topic):");
      if (name && !editDsVars.includes(name)) {
          setEditDsVars([...editDsVars, name]);
          // Update existing cases
          setEditDsCases(prev => prev.map(c => ({ ...c, inputs: { ...c.inputs, [name]: '' } })));
      }
  };

  const removeVariableColumn = (v: string) => {
      if (editDsVars.length <= 1) return;
      if (confirm(`删除变量列 ${v}?`)) {
          setEditDsVars(prev => prev.filter(x => x !== v));
          setEditDsCases(prev => prev.map(c => {
              const newInputs = { ...c.inputs };
              delete newInputs[v];
              return { ...c, inputs: newInputs };
          }));
      }
  };

  const addTestCase = () => {
      if (editDsCases.length >= 200) {
          alert("每个样本集最多 200 条数据");
          return;
      }
      const emptyInputs: VariableMap = {};
      editDsVars.forEach(v => emptyInputs[v] = '');
      setEditDsCases(prev => [...prev, { id: `case-${Date.now()}`, inputs: emptyInputs, attachments: [] }]);
  };

  const updateTestCase = (caseId: string, key: string, value: string) => {
      setEditDsCases(prev => prev.map(c => c.id === caseId ? { ...c, inputs: { ...c.inputs, [key]: value } } : c));
  };

  const removeTestCase = (caseId: string) => {
      setEditDsCases(prev => prev.filter(c => c.id !== caseId));
  };

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && activeCaseForAttachment) {
          const files = Array.from(e.target.files);
          const pendingAttachments: Attachment[] = [];
          
          let processed = 0;
          files.forEach(file => {
              const reader = new FileReader();
              reader.onload = (evt) => {
                  if (evt.target?.result) {
                      pendingAttachments.push({
                          id: Math.random().toString(36).substr(2, 9),
                          name: file.name,
                          mimeType: file.type,
                          type: file.type.startsWith('image') ? 'image' : 'text',
                          data: evt.target.result as string
                      });
                  }
                  processed++;
                  if (processed === files.length) {
                      setEditDsCases(prev => prev.map(c => {
                          if (c.id === activeCaseForAttachment) {
                              return { ...c, attachments: [...c.attachments, ...pendingAttachments] };
                          }
                          return c;
                      }));
                      setActiveCaseForAttachment(null);
                  }
              };
              reader.readAsDataURL(file);
          });
      }
  };

  // --- Execution Logic ---

  const executeBatch = async () => {
      if (!selectedDatasetId || !runVersionId || !runProjectId) return;
      const dataset = datasets.find(d => d.id === selectedDatasetId);
      const version = versions.find(v => v.id === runVersionId);
      const modelConfig = availableAPIs.find(a => a.id === (runModelId || version?.model));

      if (!dataset || !version || !modelConfig) return;

      setIsRunning(true);
      setRunProgress(0);
      
      const runId = `batch-${Date.now()}`;
      const initialResults: BatchResult[] = dataset.cases.map(c => ({
          caseId: c.id,
          status: 'running' as any, // temp status
          output: '',
          latency: 0,
          tokens: 0
      }));

      const newRun: BatchRun = {
          id: runId,
          userId: 'current',
          datasetId: dataset.id,
          projectId: runProjectId,
          versionId: runVersionId,
          modelConfigId: modelConfig.id,
          timestamp: Date.now(),
          results: [], // will populate as we go
          status: 'running',
          progress: 0,
          totalCases: dataset.cases.length
      };
      
      // Add run to history immediately
      onUpdateBatchRuns([newRun, ...batchRuns]);
      setActiveTab('history');
      setSelectedRunId(runId);

      // Concurrency Queue
      const CONCURRENCY = 3;
      const queue = [...dataset.cases];
      const total = queue.length;
      let completed = 0;
      const finalResults: BatchResult[] = [];

      const worker = async () => {
          while (queue.length > 0) {
              const testCase = queue.shift();
              if (!testCase) break;

              const start = Date.now();
              let output = '';
              let error = undefined;
              let tokens = 0;
              let status: 'success' | 'error' = 'success';

              try {
                  // Prepare Prompt/Messages
                  if (version.type === 'workflow') {
                       // Workflow Execution
                       let graph;
                       try { graph = JSON.parse(version.content); } catch { throw new Error("Invalid Graph JSON"); }
                       if (graph) {
                           const log = await executeWorkflowEngine(
                               graph.nodes || [], 
                               graph.edges || [], 
                               testCase.inputs, 
                               testCase.attachments, 
                               versions, 
                               availableAPIs
                           );
                           if (log.status === 'error') throw new Error("Workflow Failed");
                           output = log.outputs['final'] || JSON.stringify(log.outputs);
                           tokens = 0; // Workflow tokens hard to calc sum perfectly here without deep log inspection
                       }
                  } else if (version.type === 'chat') {
                       // Chat Execution
                       const msgs = (version.messages || []).map(m => {
                           let c = m.content;
                           Object.entries(testCase.inputs).forEach(([k,v]) => {
                               c = c.replace(new RegExp(`{{${k}}}`, 'g'), v);
                           });
                           return { ...m, content: c };
                       });
                       const res = await generateChat(modelConfig, msgs, version.systemInstruction, version.config, testCase.attachments);
                       output = res.text;
                       tokens = res.tokenUsage.totalTokens;
                  } else {
                       // Text Execution
                       let prompt = version.content;
                       Object.entries(testCase.inputs).forEach(([k,v]) => {
                           prompt = prompt.replace(new RegExp(`{{${k}}}`, 'g'), v);
                       });
                       const res = await generateContent(modelConfig, prompt, version.systemInstruction, version.config, testCase.attachments);
                       output = res.text;
                       tokens = res.tokenUsage.totalTokens;
                  }

              } catch (e: any) {
                  status = 'error';
                  error = e.message;
                  output = `Error: ${e.message}`;
              }

              const result: BatchResult = {
                  caseId: testCase.id,
                  status,
                  output,
                  latency: Date.now() - start,
                  tokens,
                  error
              };
              
              finalResults.push(result);
              completed++;
              
              // Update Progress
              setRunProgress(Math.round((completed / total) * 100));
              
              // Incremental update to global state (optional, but good for UX)
              // For performance, maybe update batchRuns every N items or just at end. 
              // Here we'll update at end of worker loop to keep UI responsive.
          }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }).map(() => worker()));

      // Finalize Run
      const finishedRun: BatchRun = {
          ...newRun,
          status: 'completed',
          progress: 100,
          results: finalResults
      };
      
      // Replace the placeholder run with finished one
      onUpdateBatchRuns(prev => prev.map(r => r.id === runId ? finishedRun : r));
      setIsRunning(false);
  };

  // --- Grading Logic ---
  const updateRunRating = (runId: string, caseId: string, rating: number) => {
      onUpdateBatchRuns(batchRuns.map(r => {
          if (r.id !== runId) return r;
          return {
              ...r,
              results: r.results.map(res => res.caseId === caseId ? { ...res, rating } : res)
          };
      }));
  };

  const updateRunNote = (runId: string, caseId: string, note: string) => {
      onUpdateBatchRuns(batchRuns.map(r => {
          if (r.id !== runId) return r;
          return {
              ...r,
              results: r.results.map(res => res.caseId === caseId ? { ...res, notes: note } : res)
          };
      }));
  };

  // --- Export Logic ---
  const exportToCSV = (run: BatchRun) => {
      const dataset = datasets.find(d => d.id === run.datasetId);
      if (!dataset) return;
      
      // Headers
      const inputKeys = dataset.variables;
      const headers = ['Case ID', 'Status', 'Latency(ms)', 'Tokens', 'Rating', 'Notes', 'Output', ...inputKeys];
      
      // Rows
      const rows = run.results.map(res => {
          const caseData = dataset.cases.find(c => c.id === res.caseId);
          const inputs = inputKeys.map(k => `"${(caseData?.inputs[k] || '').replace(/"/g, '""')}"`);
          
          return [
              res.caseId,
              res.status,
              res.latency,
              res.tokens,
              res.rating || 0,
              `"${(res.notes || '').replace(/"/g, '""')}"`,
              `"${(res.output || '').replace(/"/g, '""')}"`,
              ...inputs
          ].join(',');
      });
      
      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `batch_report_${run.id}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // --- Render ---

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">
       {/* Sidebar */}
       <div className="w-64 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col z-10">
          <div className="p-4 border-b border-slate-800 bg-slate-950">
             <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                批量测试 (Batch)
             </h2>
          </div>
          
          <div className="flex border-b border-slate-800">
             <button 
                onClick={() => setActiveTab('datasets')}
                className={`flex-1 py-2 text-xs font-bold transition-colors ${activeTab === 'datasets' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
             >
                样本集
             </button>
             <button 
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-2 text-xs font-bold transition-colors ${activeTab === 'history' ? 'bg-slate-800 text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
             >
                执行记录
             </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
              {activeTab === 'datasets' && (
                  <>
                     <button onClick={handleCreateDataset} className="w-full py-2 mb-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-1">
                        + 新建样本集
                     </button>
                     {datasets.map(ds => (
                         <div 
                            key={ds.id} 
                            onClick={() => {
                                if (isEditingDataset) {
                                    if (confirm("放弃当前编辑？")) handleEditDataset(ds);
                                } else {
                                    handleEditDataset(ds);
                                }
                            }}
                            className={`p-3 rounded-lg cursor-pointer border group relative ${selectedDatasetId === ds.id && isEditingDataset ? 'bg-indigo-600/10 border-indigo-500/50' : 'bg-slate-800/30 border-transparent hover:bg-slate-800'}`}
                         >
                             <div className="font-bold text-xs text-slate-300 truncate pr-6">{ds.name}</div>
                             <div className="text-[10px] text-slate-500 mt-1">{ds.cases.length} cases • {ds.variables.join(', ')}</div>
                             <button onClick={(e) => { e.stopPropagation(); handleDeleteDataset(ds.id); }} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                             </button>
                         </div>
                     ))}
                  </>
              )}

              {activeTab === 'history' && (
                  <>
                    {batchRuns.slice().reverse().map(run => {
                        const datasetName = datasets.find(d => d.id === run.datasetId)?.name || 'Unknown Set';
                        const ver = versions.find(v => v.id === run.versionId);
                        return (
                            <div 
                                key={run.id}
                                onClick={() => { setSelectedRunId(run.id); setIsEditingDataset(false); }}
                                className={`p-3 rounded-lg cursor-pointer border group ${selectedRunId === run.id ? 'bg-emerald-900/10 border-emerald-500/30' : 'bg-slate-800/30 border-transparent hover:bg-slate-800'}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`text-xs font-bold ${run.status === 'running' ? 'text-yellow-400 animate-pulse' : 'text-emerald-400'}`}>{run.status === 'running' ? `Running ${run.progress}%` : 'Completed'}</span>
                                    <span className="text-[9px] text-slate-500">{new Date(run.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div className="text-xs text-slate-300 font-medium truncate">{datasetName}</div>
                                <div className="text-[10px] text-slate-500 mt-1 truncate">vs {ver?.name || 'Deleted Ver'}</div>
                            </div>
                        );
                    })}
                  </>
              )}
          </div>
       </div>

       {/* Main Area */}
       <div className="flex-1 flex flex-col bg-[#0B1120] relative min-w-0">
           
           {/* DATASET EDITOR */}
           {isEditingDataset && (
               <div className="flex flex-col h-full animate-fadeIn">
                   {/* Header */}
                   <div className="h-14 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-950">
                       <div className="flex items-center gap-4">
                           <input 
                              className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 text-sm font-bold text-white outline-none w-48 transition-colors"
                              value={editDsName}
                              onChange={e => setEditDsName(e.target.value)}
                              placeholder="Dataset Name"
                           />
                           <span className="text-xs text-slate-500">{editDsCases.length} Cases</span>
                       </div>
                       <div className="flex items-center gap-3">
                           <button onClick={addVariableColumn} className="text-xs text-indigo-400 hover:text-indigo-300 font-bold">+ 添加变量列</button>
                           <div className="h-4 w-px bg-slate-800"></div>
                           <Button onClick={handleSaveDataset} variant="primary">保存样本集</Button>
                       </div>
                   </div>

                   {/* Runner Config (Top Bar of Editor) */}
                   <div className="px-6 py-3 bg-slate-900 border-b border-slate-800 flex items-center gap-4">
                       <span className="text-xs font-bold text-slate-500 uppercase">执行测试:</span>
                       <select 
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white outline-none w-40"
                          value={runProjectId}
                          onChange={e => { setRunProjectId(e.target.value); setRunVersionId(''); }}
                       >
                           <option value="">选择项目...</option>
                           {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                       </select>
                       <select 
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-white outline-none w-48"
                          value={runVersionId}
                          onChange={e => {
                              setRunVersionId(e.target.value);
                              // Auto check vars
                              const required = getVarsFromVersion(e.target.value);
                              const missing = required.filter(r => !editDsVars.includes(r));
                              if (missing.length > 0 && e.target.value) {
                                  alert(`注意: 所选版本需要变量 [${missing.join(', ')}]，当前数据集缺失这些列。请添加后再运行。`);
                              }
                          }}
                          disabled={!runProjectId}
                       >
                           <option value="">选择版本...</option>
                           {versions.filter(v => v.projectId === runProjectId).map(v => (
                               <option key={v.id} value={v.id}>{v.name} ({v.type})</option>
                           ))}
                       </select>
                       <Button 
                          size="sm" 
                          onClick={executeBatch} 
                          disabled={isRunning || !runVersionId} 
                          isLoading={isRunning}
                          className="ml-auto shadow-lg shadow-emerald-900/20 bg-emerald-600 hover:bg-emerald-500"
                       >
                           {isRunning ? `Running ${runProgress}%` : '开始运行 (Run Batch)'}
                       </Button>
                   </div>

                   {/* Grid Editor */}
                   <div className="flex-1 overflow-auto custom-scrollbar p-6">
                       <table className="w-full border-collapse text-left">
                           <thead>
                               <tr>
                                   <th className="p-2 border border-slate-800 bg-slate-900 text-[10px] text-slate-500 font-bold uppercase w-12 text-center">#</th>
                                   {editDsVars.map(v => (
                                       <th key={v} className="p-2 border border-slate-800 bg-slate-900 text-[10px] text-indigo-400 font-bold uppercase min-w-[150px] group relative">
                                           {`{{${v}}}`}
                                           <button onClick={() => removeVariableColumn(v)} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400">×</button>
                                       </th>
                                   ))}
                                   <th className="p-2 border border-slate-800 bg-slate-900 text-[10px] text-slate-500 font-bold uppercase w-32">附件</th>
                                   <th className="p-2 border border-slate-800 bg-slate-900 text-[10px] text-slate-500 font-bold uppercase w-12"></th>
                               </tr>
                           </thead>
                           <tbody>
                               {editDsCases.map((c, idx) => (
                                   <tr key={c.id} className="hover:bg-slate-800/20 group">
                                       <td className="p-2 border border-slate-800 text-xs text-slate-500 text-center font-mono">{idx + 1}</td>
                                       {editDsVars.map(v => (
                                           <td key={v} className="p-0 border border-slate-800">
                                               <textarea 
                                                  className="w-full h-full bg-transparent p-2 text-xs text-slate-300 outline-none resize-none min-h-[40px]"
                                                  value={c.inputs[v] || ''}
                                                  onChange={e => updateTestCase(c.id, v, e.target.value)}
                                                  rows={1}
                                               />
                                           </td>
                                       ))}
                                       <td className="p-2 border border-slate-800">
                                           <div className="flex flex-wrap gap-1">
                                               {c.attachments.map(att => (
                                                   <span key={att.id} className="text-[9px] bg-slate-800 px-1 rounded border border-slate-700 text-slate-400 truncate max-w-[80px]">{att.name}</span>
                                               ))}
                                               <button 
                                                  onClick={() => { setActiveCaseForAttachment(c.id); fileInputRef.current?.click(); }}
                                                  className="text-[9px] text-indigo-400 hover:text-indigo-300 bg-slate-900 border border-slate-700 px-1 rounded"
                                               >
                                                   +
                                               </button>
                                           </div>
                                       </td>
                                       <td className="p-2 border border-slate-800 text-center">
                                           <button onClick={() => removeTestCase(c.id)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                       <div className="mt-4">
                           <Button variant="secondary" size="sm" onClick={addTestCase}>+ 添加测试行</Button>
                       </div>
                   </div>
               </div>
           )}

           {/* RUN REPORT VIEW */}
           {!isEditingDataset && selectedRunId && (
               <div className="flex flex-col h-full animate-fadeIn">
                  {(() => {
                      const run = batchRuns.find(r => r.id === selectedRunId);
                      if (!run) return <div>Run not found</div>;
                      const avgLatency = Math.round(run.results.reduce((a,b) => a + b.latency, 0) / (run.results.length || 1));
                      const totalTokens = run.results.reduce((a,b) => a + b.tokens, 0);
                      const errors = run.results.filter(r => r.status === 'error').length;
                      const avgRating = (run.results.reduce((a,b) => a + (b.rating || 0), 0) / (run.results.filter(r => r.rating).length || 1)).toFixed(1);
                      
                      // Model Info
                      const runVersion = versions.find(v => v.id === run.versionId);
                      const runModelConfig = availableAPIs.find(a => a.id === run.modelConfigId) || availableAPIs.find(a => a.id === runVersion?.model);

                      return (
                          <>
                             <div className="border-b border-slate-800 px-6 py-4 bg-slate-950">
                                 <div className="flex items-center justify-between mb-4">
                                     <div>
                                         <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                             <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                             测试报告 (Test Report)
                                         </h2>
                                         <div className="text-[10px] text-slate-500 flex gap-2 mt-1">
                                             <span className="font-mono">{run.id}</span>
                                             <span>•</span>
                                             <span>{new Date(run.timestamp).toLocaleString()}</span>
                                         </div>
                                     </div>
                                     <div className="flex gap-4">
                                        <Button size="sm" variant="secondary" onClick={() => exportToCSV(run)} icon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>}>
                                            导出 Excel (CSV)
                                        </Button>
                                     </div>
                                 </div>

                                 {/* Detailed Version Info */}
                                 <div className="grid grid-cols-5 gap-4 text-xs bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                      <div className="col-span-2">
                                          <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Version / Model</div>
                                          <div className="text-indigo-300 font-bold truncate">{runVersion?.name || 'Deleted Version'}</div>
                                          <div className="text-[10px] text-slate-400 font-mono">{runModelConfig?.name || runModelConfig?.modelId || 'Unknown Model'}</div>
                                      </div>
                                      <div>
                                          <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Params</div>
                                          <div className="text-slate-300 text-[10px] font-mono">
                                              Temp: {runVersion?.config.temperature}<br/>
                                              TopP: {runVersion?.config.topP}
                                          </div>
                                      </div>
                                      <div>
                                          <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Performance</div>
                                          <div className="text-slate-300 text-[10px] font-mono">
                                              Lat: <span className="text-emerald-400">{avgLatency}ms</span><br/>
                                              Tok: {totalTokens}
                                          </div>
                                      </div>
                                      <div>
                                          <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Quality</div>
                                          <div className="text-yellow-400 font-bold">★ {avgRating}</div>
                                          <div className={`text-[10px] ${errors > 0 ? 'text-red-400' : 'text-slate-500'}`}>{errors} Errors</div>
                                      </div>
                                 </div>
                             </div>

                             <div className="flex-1 overflow-auto custom-scrollbar p-6 space-y-4">
                                 {run.results.map((res, idx) => {
                                     const inputSnapshot = datasets.find(d => d.id === run.datasetId)?.cases.find(c => c.id === res.caseId)?.inputs || {};
                                     return (
                                         <div key={res.caseId} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex gap-4">
                                             {/* ID & Stats */}
                                             <div className="w-16 flex-shrink-0 flex flex-col items-center border-r border-slate-800 pr-4">
                                                 <span className="text-xs font-bold text-slate-500">#{idx+1}</span>
                                                 <span className={`mt-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${res.status === 'success' ? 'bg-emerald-900/30 text-emerald-500' : 'bg-red-900/30 text-red-500'}`}>{res.status}</span>
                                                 <div className="mt-auto flex flex-col items-center gap-1">
                                                      {/* Star Rating */}
                                                      <div className="flex flex-col gap-0.5">
                                                          {[5,4,3,2,1].map(star => (
                                                              <button 
                                                                key={star}
                                                                onClick={() => updateRunRating(run.id, res.caseId, star)}
                                                                className={`w-3 h-3 ${res.rating && res.rating >= star ? 'text-yellow-400' : 'text-slate-700 hover:text-yellow-600'}`}
                                                              >
                                                                  ★
                                                              </button>
                                                          ))}
                                                      </div>
                                                 </div>
                                             </div>

                                             {/* Inputs */}
                                             <div className="w-1/3 min-w-[200px] border-r border-slate-800 pr-4">
                                                 <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Inputs</div>
                                                 <div className="space-y-2">
                                                     {Object.entries(inputSnapshot).map(([k,v]) => (
                                                         <div key={k}>
                                                             <span className="text-[9px] text-indigo-400 font-mono bg-indigo-900/20 px-1 rounded">{k}</span>
                                                             <div className="text-xs text-slate-300 mt-0.5 font-mono whitespace-pre-wrap break-all">{v}</div>
                                                         </div>
                                                     ))}
                                                 </div>
                                             </div>

                                             {/* Output */}
                                             <div className="flex-1 min-w-0">
                                                 <div className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex justify-between">
                                                     <span>Output</span>
                                                     <span className="text-slate-600">{res.latency}ms</span>
                                                 </div>
                                                 <div className={`text-xs text-slate-200 font-mono whitespace-pre-wrap bg-black/20 p-2 rounded border ${res.error ? 'border-red-500/30 text-red-300' : 'border-slate-800'}`}>
                                                     {res.output}
                                                 </div>
                                                 
                                                 {/* Notes */}
                                                 <div className="mt-3 pt-2 border-t border-slate-800/50">
                                                     <input 
                                                        className="w-full bg-transparent text-xs text-slate-400 placeholder-slate-700 outline-none"
                                                        placeholder="Add notes or comments..."
                                                        value={res.notes || ''}
                                                        onChange={e => updateRunNote(run.id, res.caseId, e.target.value)}
                                                     />
                                                 </div>
                                             </div>
                                         </div>
                                     );
                                 })}
                             </div>
                          </>
                      );
                  })()}
               </div>
           )}

           {/* EMPTY STATE */}
           {!isEditingDataset && !selectedRunId && (
               <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                   <div className="w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                       <svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                   </div>
                   <h3 className="text-lg font-bold text-slate-400">选择样本集或测试记录</h3>
                   <p className="text-sm mt-2">从左侧列表选择以开始管理数据或查看报告</p>
               </div>
           )}

           {/* Hidden File Input */}
           <input type="file" ref={fileInputRef} multiple className="hidden" onChange={handleAttachmentUpload} />
       </div>
    </div>
  );
};
