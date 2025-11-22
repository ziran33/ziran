
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PromptVersion, PromptProject, WorkflowGraph, WorkflowNode, WorkflowEdge, LLMConfig, WorkflowRunLog } from '../types';
import { Button } from './Button';
import { generateContent } from '../services/geminiService';
import { executeWorkflowEngine } from '../services/workflowExecution';

interface WorkflowBuilderViewProps {
  activeVersion: PromptVersion;
  projects: PromptProject[];
  versions: PromptVersion[]; // All versions
  onCommit: (graphStr: string, name: string) => void;
  availableAPIs: LLMConfig[];
}

export const WorkflowBuilderView: React.FC<WorkflowBuilderViewProps> = ({
  activeVersion,
  projects,
  versions,
  onCommit,
  availableAPIs
}) => {
  // --- Graph State ---
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  
  // --- Interaction State ---
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [linkingSource, setLinkingSource] = useState<{ nodeId: string, handle: string } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // --- RAF Refs for Smooth Drag ---
  const rafRef = useRef<number | null>(null);
  const mousePosRef = useRef<{x: number, y: number} | null>(null);

  // --- Execution / Debug State ---
  const [debugModalNodeId, setDebugModalNodeId] = useState<string | null>(null);
  const [debugInputs, setDebugInputs] = useState<Record<string, string>>({});
  const [debugOutput, setDebugOutput] = useState<string>('');
  const [isDebugRunning, setIsDebugRunning] = useState(false);
  
  // --- Full Workflow Execution State ---
  const [showRunModal, setShowRunModal] = useState(false);
  const [runStartInputs, setRunStartInputs] = useState<Record<string, string>>({});
  const [isWorkflowRunning, setIsWorkflowRunning] = useState(false);
  const [workflowLogs, setWorkflowLogs] = useState<WorkflowRunLog[]>([]);
  const [showLogsPanel, setShowLogsPanel] = useState(false);
  
  const canvasRef = useRef<HTMLDivElement>(null);

  // Initialize Graph
  useEffect(() => {
    if (activeVersion.type === 'workflow' && activeVersion.workflowGraph) {
      setNodes(activeVersion.workflowGraph.nodes || []);
      setEdges(activeVersion.workflowGraph.edges || []);
      setViewport({ 
          x: activeVersion.workflowGraph.pan.x, 
          y: activeVersion.workflowGraph.pan.y, 
          zoom: activeVersion.workflowGraph.zoom 
      });
    } else {
      // Init Default (Start + End)
      if (nodes.length === 0) {
        setNodes([
          {
            id: 'start-node',
            type: 'start',
            x: 100,
            y: 250,
            name: '开始 (Start)',
            status: 'idle',
            data: { globalInputs: [{ name: 'query', type: 'string' }] }
          },
          {
            id: 'end-node',
            type: 'end',
            x: 600,
            y: 250,
            name: '结束 (End)',
            status: 'idle',
            data: { outputTemplate: 'Result: {{node_1_result}}' }
          }
        ]);
      }
    }
    
    if (activeVersion.workflowLogs) {
        setWorkflowLogs(activeVersion.workflowLogs);
    }
  }, [activeVersion.id]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
          
          if (e.key === 'Delete' || e.key === 'Backspace') {
              if (selectedNodeId) {
                  deleteNode(selectedNodeId);
              }
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId]);

  // --- Helper: Get Variables ---
  const getVariablesForVersion = (versionId?: string): string[] => {
    if (!versionId) return [];
    const v = versions.find(ver => ver.id === versionId);
    if (!v) return [];
    const textVars: string[] = (v.content.match(/{{([^}]+)}}/g) || []).map(s => s.replace(/{{|}}/g, ''));
    if (v.messages) {
        v.messages.forEach(m => {
            const matches = m.content.match(/{{([^}]+)}}/g) || [];
            matches.forEach((s: string) => textVars.push(s.replace(/{{|}}/g, '')));
        });
    }
    return Array.from(new Set(textVars)).sort();
  };
  
  const getVariablesForNode = (node: WorkflowNode): string[] => {
      if (node.type === 'llm') {
          if (node.data.userPromptOverride) {
              return (node.data.userPromptOverride.match(/{{([^}]+)}}/g) || []).map(s => s.replace(/{{|}}/g, ''));
          }
          return getVariablesForVersion(node.data.versionId);
      }
      if (node.type === 'end') {
          return (node.data.outputTemplate?.match(/{{([^}]+)}}/g) || []).map(s => s.replace(/{{|}}/g, ''));
      }
      return [];
  };

  // --- Helper: Get Version Detail ---
  const getVersionById = (vid?: string) => versions.find(v => v.id === vid);

  // --- Graph Actions ---
  const addNode = () => {
    const id = `node-${Date.now()}`;
    const newNode: WorkflowNode = {
      id: id,
      type: 'llm',
      x: -viewport.x / viewport.zoom + 300,
      y: -viewport.y / viewport.zoom + 300,
      name: `LLM Node ${nodes.filter(n => n.type === 'llm').length + 1}`,
      status: 'idle',
      data: { 
          projectId: '', 
          versionId: '', 
          includeSystemPrompt: true,
          outputVariableName: `node_${nodes.length}_result`
      }
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
  };
  
  const addEndNode = () => {
      if (nodes.some(n => n.type === 'end')) {
          alert("暂只支持一个 End 节点 (Only one End node supported)");
          return;
      }
      const newNode: WorkflowNode = {
          id: `end-node-${Date.now()}`,
          type: 'end',
          x: -viewport.x / viewport.zoom + 500,
          y: -viewport.y / viewport.zoom + 300,
          name: '结束 (End)',
          status: 'idle',
          data: { outputTemplate: '{{result}}' }
      };
      setNodes(prev => [...prev, newNode]);
  };

  const deleteNode = (id: string) => {
      if (id === 'start-node') {
          alert("Start 节点不可删除");
          return;
      }
      if (window.confirm("确定删除此节点吗？(Confirm Delete)")) {
          setNodes(prev => prev.filter(n => n.id !== id));
          setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
          if (selectedNodeId === id) setSelectedNodeId(null);
      }
  };

  const deleteEdge = (edgeId: string) => {
      if (window.confirm("删除此连接线？(Delete Connection)")) {
          setEdges(prev => prev.filter(e => e.id !== edgeId));
      }
  };

  const handleUpdateNode = (id: string, updates: Partial<WorkflowNode>) => {
      setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  };
  
  const handleUpdateNodeData = (id: string, dataUpdates: any) => {
      setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, ...dataUpdates } } : n));
  };

  // --- Mouse / Canvas Logic (Optimized with RAF) ---

  const handleWheel = (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const scale = e.deltaY > 0 ? 0.9 : 1.1;
          const newZoom = Math.min(Math.max(0.2, viewport.zoom * scale), 3);
          setViewport(prev => ({ ...prev, zoom: newZoom }));
      } else {
          setViewport(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
  };

  const handleMouseDownCanvas = (e: React.MouseEvent) => {
      // Only pan if left/middle click on background
      if (e.button === 0 || e.button === 1) { 
          if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === 'svg') {
            setIsPanning(true);
            setPanStart({ x: e.clientX - viewport.x, y: e.clientY - viewport.y });
            setSelectedNodeId(null);
          }
      }
  };

  const handleMouseDownNode = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setDraggingNodeId(id);
      setSelectedNodeId(id);
      const node = nodes.find(n => n.id === id);
      if (node) {
          setDragOffset({
              x: (e.clientX - viewport.x) / viewport.zoom - node.x,
              y: (e.clientY - viewport.y) / viewport.zoom - node.y
          });
      }
  };

  // RAF Loop
  const performDrag = () => {
      if (!mousePosRef.current) return;
      const { x: mx, y: my } = mousePosRef.current;

      if (isPanning) {
          setViewport(prev => ({
              ...prev,
              x: mx - panStart.x,
              y: my - panStart.y
          }));
      } else if (draggingNodeId) {
           setNodes(prevNodes => {
               const node = prevNodes.find(n => n.id === draggingNodeId);
               if (!node) return prevNodes;
               const nx = (mx - viewport.x) / viewport.zoom - dragOffset.x;
               const ny = (my - viewport.y) / viewport.zoom - dragOffset.y;
               return prevNodes.map(n => n.id === draggingNodeId ? { ...n, x: nx, y: ny } : n);
           });
      } else if (linkingSource && canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          setMousePos({
              x: (mx - rect.left - viewport.x) / viewport.zoom,
              y: (my - rect.top - viewport.y) / viewport.zoom
          });
      }
      
      rafRef.current = null;
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY };
    
    if (isPanning || draggingNodeId || linkingSource) {
        if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(performDrag);
        }
    }
  }, [isPanning, draggingNodeId, dragOffset, viewport, linkingSource, panStart]);

  const handleMouseUp = useCallback(() => {
    if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
    }
    setIsPanning(false);
    setDraggingNodeId(null);
    setLinkingSource(null);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // --- Edge Linking ---
  const handleLinkStart = (e: React.MouseEvent, nodeId: string, handle: string) => {
      e.stopPropagation();
      e.preventDefault();
      setLinkingSource({ nodeId, handle });
  };

  const handleLinkEnd = (e: React.MouseEvent, nodeId: string, handle: string) => {
      e.stopPropagation();
      e.preventDefault();
      
      if (linkingSource) {
          if (linkingSource.nodeId === nodeId) return; // No self-loop
          
          // Remove existing edge if target handle already has one
          const cleanEdges = edges.filter(ed => !(ed.target === nodeId && ed.targetHandle === handle));
          
          const newEdge: WorkflowEdge = {
              id: `edge-${Date.now()}`,
              source: linkingSource.nodeId,
              sourceHandle: linkingSource.handle,
              target: nodeId,
              targetHandle: handle
          };
          setEdges(prev => [...cleanEdges, newEdge]);
          setLinkingSource(null);
      }
  };

  // --- Execution Logic ---

  const triggerRunWorkflow = () => {
      // Prepare Inputs
      const startNode = nodes.find(n => n.type === 'start');
      if (!startNode) { alert("No Start Node found"); return; }
      
      const inputs: Record<string, string> = {};
      startNode.data.globalInputs?.forEach(i => inputs[i.name] = '');
      setRunStartInputs(inputs);
      setShowRunModal(true);
  };

  const executeWorkflow = async () => {
      setShowRunModal(false);
      setIsWorkflowRunning(true);
      setShowLogsPanel(true);

      // Reset Nodes Status locally
      setNodes(prev => prev.map(n => ({ ...n, status: 'idle', lastOutput: undefined })));

      try {
          const log = await executeWorkflowEngine(
              nodes, 
              edges, 
              runStartInputs, 
              [], // Attachments (empty for now in builder)
              versions, 
              availableAPIs, 
              // Callback for real-time status updates on the graph
              (nodeId, status, output) => {
                  setNodes(prev => prev.map(n => 
                      n.id === nodeId 
                      ? { ...n, status, lastOutput: output || n.lastOutput } 
                      : n
                  ));
              }
          );

          setWorkflowLogs(prev => [log, ...prev]);

      } catch (e) {
          console.error(e);
      } finally {
          setIsWorkflowRunning(false);
      }
  };

  const openDebugModal = (nodeId: string) => {
      const node = nodes.find(n => n.id === nodeId);
      setDebugModalNodeId(nodeId);
      setDebugInputs({});
      // Pre-fill with last output if available for easier viewing
      setDebugOutput(node?.lastOutput || '');
      setIsDebugRunning(false);
  };
  
  const handleRunSingleNode = async () => {
      if (!debugModalNodeId) return;
      const node = nodes.find(n => n.id === debugModalNodeId);
      if (!node || node.type !== 'llm') return;
      
      const version = getVersionById(node.data.versionId);
      const modelConfig = availableAPIs.find(a => a.id === version?.model) || availableAPIs[0];
      
      if (!version || !modelConfig) {
          setDebugOutput("Error: Version or Model not found.");
          return;
      }
      
      setIsDebugRunning(true);
      setDebugOutput('');
      
      try {
          let promptContent = node.data.userPromptOverride || version.content;
          Object.entries(debugInputs).forEach(([k, val]) => {
              promptContent = promptContent.replace(new RegExp(`{{${k}}}`, 'g'), val);
          });
          
          const systemInstr = node.data.includeSystemPrompt !== false ? version.systemInstruction : "";
          const res = await generateContent(modelConfig, promptContent, systemInstr, version.config);
          
          setDebugOutput(res.text);
          // Update node's last output for consistency
          handleUpdateNode(node.id, { lastOutput: res.text });
      } catch (e: any) {
          setDebugOutput(`Error: ${e.message}`);
      } finally {
          setIsDebugRunning(false);
      }
  };

  // --- Rendering Helpers ---
  const renderBezier = (x1: number, y1: number, x2: number, y2: number) => {
      const dist = Math.abs(x2 - x1);
      const c1x = x1 + Math.max(dist * 0.5, 50);
      const c2x = x2 - Math.max(dist * 0.5, 50);
      return `M ${x1} ${y1} C ${c1x} ${y1} ${c2x} ${y2} ${x2} ${y2}`;
  };

  const handleSave = () => {
      const graph: WorkflowGraph = { nodes, edges, zoom: viewport.zoom, pan: {x: viewport.x, y: viewport.y} };
      onCommit(JSON.stringify(graph), String(activeVersion.name));
  };

  // --- Render ---
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="flex h-full w-full bg-[#111827] relative overflow-hidden">
       
       {/* Toolbar */}
       <div className="absolute top-4 left-4 z-20 flex gap-2">
           <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 shadow-xl flex">
               <Button size="xs" variant="ghost" onClick={() => setViewport(prev => ({ ...prev, zoom: prev.zoom + 0.1 }))}>+</Button>
               <span className="px-2 py-1 text-xs text-slate-400 font-mono flex items-center">{Math.round(viewport.zoom * 100)}%</span>
               <Button size="xs" variant="ghost" onClick={() => setViewport(prev => ({ ...prev, zoom: prev.zoom - 0.1 }))}>-</Button>
           </div>
           <Button size="sm" onClick={handleSave} className="shadow-xl">保存工作流</Button>
           <Button size="sm" variant="primary" className="bg-emerald-600 hover:bg-emerald-500 shadow-xl shadow-emerald-900/20" onClick={triggerRunWorkflow} isLoading={isWorkflowRunning}>
               运行 (Run)
           </Button>
       </div>
       
       {/* Logs Toggle */}
       <div className="absolute top-4 right-80 mr-4 z-20">
            <button 
                onClick={() => setShowLogsPanel(!showLogsPanel)}
                className={`px-3 py-1.5 rounded border text-xs font-bold transition-all ${showLogsPanel ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
            >
                执行记录 (Logs)
            </button>
       </div>

       {/* Config Sidebar (Right) */}
       <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-900 border-l border-slate-800 z-20 flex flex-col shadow-2xl">
           <div className="h-12 border-b border-slate-800 flex items-center px-4 bg-slate-950">
               <h3 className="text-xs font-bold text-slate-400 uppercase">节点配置 (Properties)</h3>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
               <div className="mb-4 grid grid-cols-2 gap-2">
                  <Button className="border-dashed border-2 border-slate-700 bg-transparent hover:bg-slate-800 text-[10px]" variant="secondary" onClick={addNode}>+ LLM 节点</Button>
                  <Button className="border-dashed border-2 border-slate-700 bg-transparent hover:bg-slate-800 text-[10px]" variant="secondary" onClick={addEndNode}>+ End 节点</Button>
               </div>
               
               {selectedNode ? (
                   <div className="space-y-5 animate-fadeIn">
                       <div className="pb-4 border-b border-slate-800">
                           <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">节点名称</label>
                           <input 
                              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-indigo-500 outline-none"
                              value={selectedNode.name}
                              onChange={(e) => handleUpdateNode(selectedNode.id, { name: e.target.value })}
                           />
                           <div className="text-[10px] text-slate-600 mt-1 capitalize">{selectedNode.type} Node</div>
                       </div>

                       {/* Last Run Output Section */}
                       {selectedNode.lastOutput && (
                           <div className="p-3 bg-black/30 rounded border border-emerald-900/30">
                               <div className="flex justify-between items-center mb-1">
                                   <label className="text-[10px] font-bold text-emerald-500 uppercase">Last Run Output</label>
                                   <button 
                                      onClick={() => openDebugModal(selectedNode.id)}
                                      className="text-[9px] text-slate-500 hover:text-white"
                                   >
                                      Expand
                                   </button>
                               </div>
                               <div className="text-[10px] font-mono text-slate-300 max-h-32 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                                   {selectedNode.lastOutput}
                               </div>
                           </div>
                       )}

                       {/* START NODE CONFIG */}
                       {selectedNode.type === 'start' && (
                           <div>
                               <div className="flex justify-between items-center mb-2">
                                   <label className="block text-[10px] font-bold text-emerald-500 uppercase">全局输入 (Start Inputs)</label>
                                   <button 
                                      onClick={() => {
                                          const inputs = selectedNode.data.globalInputs || [];
                                          handleUpdateNodeData(selectedNode.id, { globalInputs: [...inputs, { name: `var_${inputs.length}`, type: 'string' }] });
                                      }}
                                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold"
                                   >
                                       + 添加参数
                                   </button>
                               </div>
                               <div className="space-y-2">
                                   {selectedNode.data.globalInputs?.map((inp, idx) => (
                                       <div key={idx} className="flex gap-2 items-center bg-slate-950 p-1.5 rounded border border-slate-800">
                                           <input 
                                              className="flex-1 bg-transparent border-none text-xs text-white focus:ring-0 p-0"
                                              value={inp.name}
                                              onChange={(e) => {
                                                  const newInputs = [...(selectedNode.data.globalInputs || [])];
                                                  newInputs[idx].name = e.target.value;
                                                  handleUpdateNodeData(selectedNode.id, { globalInputs: newInputs });
                                              }}
                                           />
                                            <button 
                                              onClick={() => {
                                                  const newInputs = [...(selectedNode.data.globalInputs || [])];
                                                  newInputs.splice(idx, 1);
                                                  handleUpdateNodeData(selectedNode.id, { globalInputs: newInputs });
                                              }}
                                              className="text-slate-600 hover:text-red-400 px-1"
                                           >×</button>
                                       </div>
                                   ))}
                               </div>
                           </div>
                       )}

                       {/* LLM NODE CONFIG */}
                       {selectedNode.type === 'llm' && (
                           <>
                               <div className="space-y-4">
                                   <div>
                                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">输出变量名 (Output Variable)</label>
                                       <input 
                                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-indigo-400 font-mono focus:border-indigo-500 outline-none"
                                          value={selectedNode.data.outputVariableName || ''}
                                          onChange={(e) => handleUpdateNodeData(selectedNode.id, { outputVariableName: e.target.value })}
                                          placeholder="e.g. summary_result"
                                       />
                                       <p className="text-[9px] text-slate-600 mt-1">供后续节点使用: <code>{`{{${selectedNode.data.outputVariableName || 'name'}}}`}</code></p>
                                   </div>

                                   <div>
                                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">引用项目</label>
                                       <select 
                                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-indigo-500 outline-none"
                                          value={selectedNode.data.projectId || ''}
                                          onChange={(e) => handleUpdateNodeData(selectedNode.id, { projectId: e.target.value, versionId: '' })}
                                       >
                                          <option value="">选择项目...</option>
                                          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                       </select>
                                   </div>

                                   <div>
                                       <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">引用版本</label>
                                       <select 
                                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-indigo-500 outline-none"
                                          value={selectedNode.data.versionId || ''}
                                          onChange={(e) => handleUpdateNodeData(selectedNode.id, { versionId: e.target.value })}
                                          disabled={!selectedNode.data.projectId}
                                       >
                                          <option value="">选择 Prompt 版本...</option>
                                          {versions.filter(v => v.projectId === selectedNode.data.projectId).map(v => (
                                              <option key={v.id} value={v.id}>{v.name} ({v.type || 'text'})</option>
                                          ))}
                                       </select>
                                   </div>
                                   
                                   {/* System Prompt Toggle */}
                                   <div className="flex items-center gap-2">
                                      <input 
                                        type="checkbox" 
                                        id="sysPrompt"
                                        checked={selectedNode.data.includeSystemPrompt !== false}
                                        onChange={(e) => handleUpdateNodeData(selectedNode.id, { includeSystemPrompt: e.target.checked })}
                                        className="rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-0"
                                      />
                                      <label htmlFor="sysPrompt" className="text-xs text-slate-300 select-none cursor-pointer">包含版本 System Prompt</label>
                                   </div>

                                   {/* User Prompt Override */}
                                   <div>
                                       <div className="flex justify-between items-end mb-1">
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase">User Prompt (Override)</label>
                                            <span className="text-[9px] text-slate-600">支持变量 {`{{var}}`}</span>
                                       </div>
                                       <textarea 
                                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-indigo-500 outline-none h-24 font-mono custom-scrollbar"
                                          value={selectedNode.data.userPromptOverride || ''}
                                          onChange={(e) => handleUpdateNodeData(selectedNode.id, { userPromptOverride: e.target.value })}
                                          placeholder={getVersionById(selectedNode.data.versionId)?.content || "在此重写提示词..."}
                                       />
                                   </div>
                               </div>
                           </>
                       )}
                       
                       {/* END NODE CONFIG */}
                       {selectedNode.type === 'end' && (
                          <div>
                              <label className="block text-[10px] font-bold text-orange-500 uppercase mb-1">输出模板 (Output Template)</label>
                              <div className="text-[10px] text-slate-500 mb-2">使用 <code>{`{{variable}}`}</code> 聚合上游节点输出。</div>
                              <textarea 
                                  className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-xs text-white focus:border-indigo-500 outline-none h-40 font-mono custom-scrollbar"
                                  value={selectedNode.data.outputTemplate}
                                  onChange={(e) => handleUpdateNodeData(selectedNode.id, { outputTemplate: e.target.value })}
                                  placeholder='Final Result: {{node_1_output}}'
                              />
                          </div>
                       )}

                       <div className="pt-4 border-t border-slate-800">
                           <Button variant="danger" size="sm" onClick={() => deleteNode(selectedNode.id)} disabled={selectedNode.type === 'start'}>删除节点</Button>
                       </div>
                   </div>
               ) : (
                   <div className="flex flex-col items-center justify-center h-40 text-slate-600">
                       <svg className="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path></svg>
                       <span className="text-xs">选中节点以编辑配置</span>
                   </div>
               )}
           </div>
       </div>

       {/* Logs Panel (Conditional) */}
       {showLogsPanel && (
           <div className="absolute right-80 top-0 bottom-0 w-64 bg-slate-950 border-l border-slate-800 z-10 flex flex-col shadow-xl animate-slideLeft">
               <div className="h-12 border-b border-slate-800 flex items-center px-4 bg-slate-950 justify-between">
                   <h3 className="text-xs font-bold text-slate-400 uppercase">执行历史</h3>
                   <button onClick={() => setShowLogsPanel(false)} className="text-slate-500 hover:text-white">✕</button>
               </div>
               <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-2">
                   {workflowLogs.length === 0 && <div className="text-xs text-slate-600 p-4 text-center">暂无执行记录</div>}
                   {workflowLogs.map(log => (
                       <div key={log.id} className={`p-3 rounded border text-xs ${log.status === 'error' ? 'bg-red-900/10 border-red-900/30' : 'bg-slate-900 border-slate-800'}`}>
                           <div className="flex justify-between mb-2">
                               <span className={`font-bold ${log.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{log.status.toUpperCase()}</span>
                               <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                           </div>
                           <div className="space-y-1">
                               {log.steps.map((step, i) => (
                                   <div key={i} className="flex justify-between text-[10px]">
                                       <span className="text-slate-400 truncate max-w-[100px]">{step.nodeName}</span>
                                       <span className={step.status === 'success' ? 'text-emerald-500' : 'text-red-500'}>{step.latency}ms</span>
                                   </div>
                               ))}
                           </div>
                           {log.outputs?.final && (
                               <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-300 line-clamp-3 font-mono">
                                   {log.outputs.final}
                               </div>
                           )}
                       </div>
                   ))}
               </div>
           </div>
       )}

       {/* Canvas Area */}
       <div 
          ref={canvasRef}
          className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing bg-slate-900"
          onWheel={handleWheel}
          onMouseDown={handleMouseDownCanvas}
       >
          <div 
            className="w-full h-full transform-gpu"
            style={{ 
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                transformOrigin: '0 0' 
            }}
          >
             <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{ width: '10000px', height: '10000px' }}>
                 <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="1"/>
                    </pattern>
                 </defs>
                 <rect width="100%" height="100%" fill="url(#grid)" />

                 {/* Edges */}
                 {edges.map(edge => {
                      const source = nodes.find(n => n.id === edge.source);
                      const target = nodes.find(n => n.id === edge.target);
                      if (!source || !target) return null;

                      const x1 = source.x + 240;
                      const y1 = source.y + 45; 

                      // Target Input Index
                      let vars: string[] = getVariablesForNode(target);
                      const varIdx = vars.indexOf(edge.targetHandle);
                      const y2 = target.y + 50 + (Math.max(0, varIdx) * 28) + 14; 
                      const x2 = target.x;

                      return (
                          <g key={edge.id} className="pointer-events-auto group">
                              <path 
                                d={renderBezier(x1, y1, x2, y2)} 
                                stroke="#6366f1" 
                                strokeWidth="3" 
                                fill="none" 
                                className="opacity-60 group-hover:opacity-100 group-hover:stroke-red-400 transition-all cursor-pointer"
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    deleteEdge(edge.id);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                              />
                              <path 
                                d={renderBezier(x1, y1, x2, y2)} 
                                stroke="transparent" 
                                strokeWidth="15" 
                                fill="none" 
                                className="cursor-pointer"
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    deleteEdge(edge.id);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                              />
                          </g>
                      );
                 })}

                 {/* Temp Drag Line */}
                 {linkingSource && (
                      <path 
                        d={renderBezier(
                            nodes.find(n => n.id === linkingSource!.nodeId)!.x + 240, 
                            nodes.find(n => n.id === linkingSource!.nodeId)!.y + 45, 
                            mousePos.x, mousePos.y
                        )} 
                        stroke="#94a3b8" 
                        strokeWidth="2" 
                        strokeDasharray="5,5" 
                        fill="none" 
                      />
                 )}
             </svg>
             
             {/* Nodes */}
             {nodes.map(node => {
                 const inputVars = getVariablesForNode(node);
                 const isStart = node.type === 'start';
                 const isEnd = node.type === 'end';
                 const isSelected = selectedNodeId === node.id;
                 
                 let statusColor = 'border-slate-700';
                 if (node.status === 'success') statusColor = 'border-emerald-500';
                 if (node.status === 'error') statusColor = 'border-red-500';
                 if (node.status === 'running') statusColor = 'border-indigo-500 animate-pulse';

                 return (
                     <div
                        key={node.id}
                        className={`absolute w-[240px] rounded-xl bg-slate-900 border-2 shadow-xl flex flex-col transition-transform group ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/20 z-10' : statusColor}`}
                        style={{ left: node.x, top: node.y }}
                        onMouseDown={(e) => handleMouseDownNode(e, node.id)}
                     >
                        {/* Header */}
                        <div className={`h-12 px-3 flex items-center justify-between rounded-t-lg bg-slate-950 border-b border-slate-800 ${isStart ? 'bg-gradient-to-r from-emerald-900/40 to-slate-900' : isEnd ? 'bg-gradient-to-r from-orange-900/40 to-slate-900' : ''}`}>
                            <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold ${isStart ? 'bg-emerald-600' : isEnd ? 'bg-orange-600' : 'bg-indigo-600'}`}>
                                    {isStart ? 'ST' : isEnd ? 'END' : 'LLM'}
                                </div>
                                <span className="text-xs font-bold text-slate-200 truncate max-w-[120px]" title={node.name}>{node.name}</span>
                            </div>
                            <div className="flex gap-1">
                                <button 
                                    className="p-1 text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20 rounded transition-colors"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => openDebugModal(node.id)}
                                    title="Run Node"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path></svg>
                                </button>
                                {!isStart && (
                                    <button 
                                        className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={() => deleteNode(node.id)}
                                        title="Delete Node"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-3 space-y-2 bg-slate-900/90 rounded-b-lg min-h-[60px]">
                            
                            {/* Start Node Inputs Display */}
                            {isStart && (
                                <div className="space-y-1">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase">Outputs / Global Vars</div>
                                    {node.data.globalInputs?.map(v => (
                                        <div key={v.name} className="flex items-center justify-between bg-slate-950 px-2 py-1 rounded border border-slate-800">
                                            <span className="text-[10px] font-mono text-emerald-400">{v.name}</span>
                                            <span className="text-[8px] text-slate-600 uppercase">{v.type}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* LLM/End Node Inputs (Left Handles) */}
                            {!isStart && (
                                <div className="space-y-1">
                                    <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">Inputs</div>
                                    {inputVars.map((v, i) => (
                                        <div key={v} className="relative flex items-center h-7 bg-slate-950 rounded border border-slate-800 mb-1 px-2">
                                            {/* Input Handle */}
                                            <div 
                                                className={`absolute -left-4 w-4 h-4 rounded-full border-2 border-slate-700 bg-slate-900 hover:scale-110 hover:border-indigo-500 transition-all cursor-crosshair z-20 ${edges.some(e => e.target === node.id && e.targetHandle === v) ? 'bg-indigo-500 border-indigo-500' : ''}`}
                                                onMouseUp={(e) => handleLinkEnd(e, node.id, v)}
                                                title={`Connect to ${v}`}
                                            ></div>
                                            <span className="text-[10px] font-mono text-indigo-300 truncate w-full pl-1">{`{{${v}}}`}</span>
                                        </div>
                                    ))}
                                    {inputVars.length === 0 && (
                                        <div className="text-[10px] text-slate-600 italic py-1">No variables detected</div>
                                    )}
                                </div>
                            )}

                            {/* Output Variable Display for LLM */}
                            {node.type === 'llm' && (
                                <div className="mt-2 pt-2 border-t border-slate-800">
                                    <div className="text-[9px] text-slate-500 uppercase">Output Var</div>
                                    <div className="text-[10px] font-mono text-purple-400 truncate">{`{{${node.data.outputVariableName || '?'}}}`}</div>
                                </div>
                            )}

                            {/* Result Preview (Added Feature) */}
                            {node.lastOutput && (
                                <div className="mt-2 pt-2 border-t border-slate-800 group/output">
                                    <div className="flex items-center justify-between text-[9px] text-emerald-500 mb-1">
                                        <span className="flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                            Success
                                        </span>
                                        <button 
                                            className="text-[10px] text-slate-500 hover:text-white bg-slate-800 px-1 rounded border border-slate-700"
                                            onClick={(e) => { e.stopPropagation(); openDebugModal(node.id); }}
                                            title="View Full Output"
                                        >
                                            View
                                        </button>
                                    </div>
                                    <div className="text-[9px] text-slate-400 font-mono line-clamp-3 break-all bg-black/20 rounded p-1 border border-white/5">
                                        {node.lastOutput.substring(0, 150)}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Output Handle (Right) - Not for End Nodes */}
                        {!isEnd && (
                            <div 
                                className="absolute -right-3 top-[18px] w-5 h-5 rounded-full border-2 border-slate-900 bg-slate-500 hover:bg-indigo-500 hover:scale-110 transition-all cursor-crosshair z-20 shadow-md flex items-center justify-center"
                                onMouseDown={(e) => handleLinkStart(e, node.id, 'output')}
                                title="Output"
                            >
                                <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                            </div>
                        )}
                     </div>
                 );
             })}
          </div>
       </div>
       
       {/* Run Workflow Modal */}
       {showRunModal && (
           <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fadeIn">
               <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                   <div className="px-5 py-4 border-b border-slate-800 bg-slate-950">
                       <h3 className="text-sm font-bold text-white">运行工作流 (Run Workflow)</h3>
                       <p className="text-xs text-slate-500">请输入 Start 节点的初始参数</p>
                   </div>
                   <div className="p-5 space-y-4">
                       {Object.keys(runStartInputs).map(key => (
                           <div key={key}>
                               <label className="block text-[10px] font-bold text-emerald-500 uppercase mb-1">{key}</label>
                               <input 
                                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-indigo-500 outline-none"
                                  value={runStartInputs[key]}
                                  onChange={(e) => setRunStartInputs(prev => ({ ...prev, [key]: e.target.value }))}
                               />
                           </div>
                       ))}
                       {Object.keys(runStartInputs).length === 0 && <div className="text-xs text-slate-500 italic">此工作流无全局输入参数，可直接运行。</div>}
                   </div>
                   <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
                       <Button variant="secondary" onClick={() => setShowRunModal(false)}>取消</Button>
                       <Button onClick={executeWorkflow}>开始运行</Button>
                   </div>
               </div>
           </div>
       )}

       {/* Debug / Test Modal (Single Node) */}
       {debugModalNodeId && (
           <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fadeIn">
               <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                   <div className="px-5 py-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                       <h3 className="text-sm font-bold text-white flex items-center gap-2">
                           <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path></svg>
                           节点调试 / 输出查看 (Debug)
                       </h3>
                       <button onClick={() => setDebugModalNodeId(null)} className="text-slate-500 hover:text-white">✕</button>
                   </div>
                   
                   <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                       {debugOutput && (
                           <div className="bg-black rounded border border-slate-800 p-3">
                               <div className="text-[10px] text-emerald-500 mb-1 uppercase font-bold">Last Output</div>
                               <div className="text-xs font-mono text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar">
                                   {debugOutput}
                               </div>
                           </div>
                       )}

                       <div className="bg-slate-800/50 p-3 rounded border border-slate-700/50 text-xs text-slate-400">
                           输入上游数据以重新测试此节点。
                       </div>

                       <div className="space-y-4">
                           {(() => {
                               const node = nodes.find(n => n.id === debugModalNodeId);
                               if (!node) return null;
                               
                               let vars: string[] = [];
                               if (node.type === 'start') vars = node.data.globalInputs?.map(i => i.name) || [];
                               else vars = getVariablesForNode(node);
                               
                               if (vars.length === 0) return <div className="text-slate-500 italic text-xs">此节点无输入变量，可直接运行。</div>;

                               return vars.map(v => (
                                   <div key={v}>
                                       <label className="block text-[10px] font-bold text-indigo-400 uppercase mb-1">{`{{${v}}}`}</label>
                                       <textarea 
                                          className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-indigo-500 outline-none resize-none h-16"
                                          value={debugInputs[v] || ''}
                                          onChange={(e) => setDebugInputs(prev => ({ ...prev, [v]: e.target.value }))}
                                          placeholder={`输入 ${v} 的测试值...`}
                                       />
                                   </div>
                               ));
                           })()}
                       </div>
                       
                       <div className="pt-4 border-t border-slate-800">
                           <Button onClick={handleRunSingleNode} isLoading={isDebugRunning} className="w-full">
                               运行测试 (Run Node)
                           </Button>
                       </div>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
};
