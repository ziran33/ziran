
import React, { useState, useEffect, useMemo } from 'react';
import { PromptVersion, PromptProject, AppView, DEFAULT_PROMPT_CONTENT, DEFAULT_SYSTEM_INSTRUCTION, VariableMap, GenerationConfig, TestRun, Attachment, LLMConfig, ServiceDeployment, ChatMessage, Dataset, BatchRun } from './types';
import { DEFAULT_MODELS, DEFAULT_MODEL_ID } from './constants';
import { generateContent } from './services/geminiService'; 
import { PromptEditor } from './components/PromptEditor';
import { TestPanel } from './components/TestPanel';
import { Sidebar } from './components/Sidebar';
import { ComparisonView } from './components/ComparisonView';
import { SettingsModal } from './components/SettingsModal';
import { WebAppView } from './components/WebAppView';
import { BatchTestView } from './components/BatchTestView';
import { DeployModal } from './components/DeployModal';
import { DiffModal } from './components/DiffModal';
import { CommitModal } from './components/CommitModal';
import { CrossCompareView } from './components/CrossCompareView';
import { ChatBuilderView } from './components/ChatBuilderView';
import { WorkflowBuilderView } from './components/WorkflowBuilderView';
import { useAuth } from './contexts/AuthContext';
import { LoginView } from './components/LoginView';

const App: React.FC = () => {
  const { user, isLoading: isAuthLoading, logout } = useAuth();

  // --- Data State ---
  const [projects, setProjects] = useState<PromptProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string>('');
  const [testLogs, setTestLogs] = useState<Record<string, TestRun[]>>({}); 
  
  // --- New Batch Test Data State ---
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [batchRuns, setBatchRuns] = useState<BatchRun[]>([]);

  // --- UI State ---
  const [currentView, setCurrentView] = useState<AppView>(AppView.EDITOR);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeployOpen, setIsDeployOpen] = useState(false);
  
  // --- Diff & Commit State ---
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  const [diffVersionA, setDiffVersionA] = useState<PromptVersion | null>(null);
  const [diffVersionB, setDiffVersionB] = useState<PromptVersion | null>(null);
  
  const [isCommitOpen, setIsCommitOpen] = useState(false);
  const [pendingCommitData, setPendingCommitData] = useState<{
    content: string;
    system: string;
    config: GenerationConfig;
    messages?: ChatMessage[];
    type: 'text' | 'chat' | 'workflow';
    modelId?: string;
  } | null>(null);

  // --- Test Runner State ---
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [lastTestRun, setLastTestRun] = useState<TestRun | null>(null);
  const [selectedTestModelId, setSelectedTestModelId] = useState(DEFAULT_MODEL_ID);
  
  // --- Configuration State ---
  const [savedAPIs, setSavedAPIs] = useState<LLMConfig[]>(DEFAULT_MODELS);
  const [services, setServices] = useState<ServiceDeployment[]>([]);

  // Flag to prevent saving during initial load
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // --- Load Data on Auth Change ---
  useEffect(() => {
    if (!user) return;
    setIsDataLoaded(false);

    const loadUserSpecificData = () => {
      // 1. Load all from LS
      const allProjects = JSON.parse(localStorage.getItem('promptlab_projects') || '[]');
      const allVersions = JSON.parse(localStorage.getItem('promptlab_versions_v3') || '[]');
      const allLogs = JSON.parse(localStorage.getItem('promptlab_test_logs') || '{}');
      const allServices = JSON.parse(localStorage.getItem('promptlab_services') || '[]');
      const allAPIs = JSON.parse(localStorage.getItem('promptlab_apis') || '[]');
      // Batch Data
      const allDatasets = JSON.parse(localStorage.getItem('promptlab_datasets') || '[]');
      const allBatchRuns = JSON.parse(localStorage.getItem('promptlab_batch_runs') || '[]');

      // 2. Filter by User ID
      const userProjects = allProjects.filter((p: any) => p.userId === user.id);
      const userVersions = allVersions.filter((v: any) => v.userId === user.id);
      const userServices = allServices.filter((s: any) => s.userId === user.id);
      // Datasets and runs filter (Assuming datasets have userId)
      // If legacy data doesn't have userId, we might need migration, but here we assume fresh start or handled in migration
      const userDatasets = allDatasets.filter((d: any) => d.userId === user.id || !d.userId); // !d.userId for legacy compatibility if needed
      const userBatchRuns = allBatchRuns.filter((r: any) => r.userId === user.id || !r.userId);

      let userAPIs = allAPIs.filter((a: any) => a.userId === user.id);
      if (userAPIs.length === 0) {
         userAPIs = DEFAULT_MODELS.map(m => ({ ...m, userId: user.id }));
      }

      setProjects(userProjects);
      setVersions(userVersions);
      setServices(userServices);
      setSavedAPIs(userAPIs);
      setTestLogs(allLogs); 
      setDatasets(userDatasets);
      setBatchRuns(userBatchRuns);

      // Initialize default model based on user preference
      const defaultApi = userAPIs.find((a: LLMConfig) => a.isDefault);
      if (defaultApi) setSelectedTestModelId(defaultApi.id);

      // 3. Init Default Project if empty
      if (userProjects.length === 0) {
        const pid = `proj-${Date.now()}`;
        const p: PromptProject = { id: pid, userId: user.id, name: '示例项目 (Demo)', tags: ['通用'], createdAt: Date.now(), updatedAt: Date.now() };
        const v: PromptVersion = {
            id: `v-${Date.now()}`, userId: user.id, projectId: pid, name: 'v1.0 初始版本', 
            type: 'text',
            systemInstruction: DEFAULT_SYSTEM_INSTRUCTION, content: DEFAULT_PROMPT_CONTENT,
            createdAt: Date.now(), model: DEFAULT_MODEL_ID,
            config: { temperature: 0.7, topP: 0.95, topK: 40, responseMimeType: 'text/plain' }
        };
        setProjects([p]);
        setVersions([v]);
        setActiveProjectId(pid);
      } else {
        setActiveProjectId(userProjects[0].id);
      }
      
      setIsDataLoaded(true);
    };

    loadUserSpecificData();
  }, [user]);

  // --- Persistence ---
  useEffect(() => {
    if (!user || !isDataLoaded) return;
    const saveKey = 'promptlab_projects';
    const all = JSON.parse(localStorage.getItem(saveKey) || '[]');
    const others = all.filter((x: any) => x.userId !== user.id);
    const current = projects.map(p => ({...p, userId: user.id}));
    localStorage.setItem(saveKey, JSON.stringify([...others, ...current]));
  }, [projects, user, isDataLoaded]);

  useEffect(() => {
    if (!user || !isDataLoaded) return;
    const saveKey = 'promptlab_versions_v3';
    const all = JSON.parse(localStorage.getItem(saveKey) || '[]');
    const others = all.filter((x: any) => x.userId !== user.id);
    const current = versions.map(v => ({...v, userId: user.id}));
    localStorage.setItem(saveKey, JSON.stringify([...others, ...current]));
  }, [versions, user, isDataLoaded]);

  useEffect(() => {
    if (!user || !isDataLoaded) return;
    const saveKey = 'promptlab_apis';
    const all = JSON.parse(localStorage.getItem(saveKey) || '[]');
    const others = all.filter((x: any) => x.userId !== user.id);
    const current = savedAPIs.map(a => ({...a, userId: user.id}));
    localStorage.setItem(saveKey, JSON.stringify([...others, ...current]));
  }, [savedAPIs, user, isDataLoaded]);

  useEffect(() => {
    if (!user || !isDataLoaded) return;
    const saveKey = 'promptlab_services';
    const all = JSON.parse(localStorage.getItem(saveKey) || '[]');
    const others = all.filter((x: any) => x.userId !== user.id);
    const current = services.map(s => ({...s, userId: user.id}));
    localStorage.setItem(saveKey, JSON.stringify([...others, ...current]));
  }, [services, user, isDataLoaded]);
  
  useEffect(() => {
      if (!user || !isDataLoaded) return;
      localStorage.setItem('promptlab_test_logs', JSON.stringify(testLogs));
  }, [testLogs, user, isDataLoaded]);

  // Batch Persistence
  useEffect(() => {
      if (!user || !isDataLoaded) return;
      const saveKey = 'promptlab_datasets';
      const all = JSON.parse(localStorage.getItem(saveKey) || '[]');
      const others = all.filter((x: any) => x.userId !== user.id);
      const current = datasets.map(d => ({...d, userId: user.id}));
      localStorage.setItem(saveKey, JSON.stringify([...others, ...current]));
  }, [datasets, user, isDataLoaded]);

  useEffect(() => {
      if (!user || !isDataLoaded) return;
      const saveKey = 'promptlab_batch_runs';
      const all = JSON.parse(localStorage.getItem(saveKey) || '[]');
      const others = all.filter((x: any) => x.userId !== user.id);
      const current = batchRuns.map(r => ({...r, userId: user.id}));
      localStorage.setItem(saveKey, JSON.stringify([...others, ...current]));
  }, [batchRuns, user, isDataLoaded]);


  // --- Selection Logic ---

  useEffect(() => {
    if (activeProjectId && isDataLoaded) {
        const projVersions = versions.filter(v => v.projectId === activeProjectId);
        if (projVersions.length > 0) {
            if (!projVersions.find(v => v.id === activeVersionId)) {
                // Auto Select first
                const target = projVersions[0];
                setActiveVersionId(target.id);
                // Trigger view switch logic manually here if needed, 
                // but handleSelectVersion does it on user click
            }
        } else if (projects.find(p => p.id === activeProjectId)) {
             // Auto-create first version if missing for project
             handleSaveNewVersion(DEFAULT_PROMPT_CONTENT, DEFAULT_SYSTEM_INSTRUCTION, 'v1.0 Init', { temperature: 0.7, topP: 0.95, topK: 40, responseMimeType: 'text/plain' }, 'Initial commit');
        }
    }
  }, [activeProjectId, versions, isDataLoaded]);

  const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId), [projects, activeProjectId]);
  const currentProjectVersions = useMemo(() => versions.filter(v => v.projectId === activeProjectId).sort((a, b) => b.createdAt - a.createdAt), [versions, activeProjectId]);
  const activeVersion = useMemo(() => versions.find(v => v.id === activeVersionId) || currentProjectVersions[0], [versions, activeVersionId]);

  const variables = useMemo(() => {
    if (!activeVersion) return [];
    const varSet = new Set<string>();
    
    // Extract from Text content
    if (activeVersion.type !== 'chat') {
        const matches = activeVersion.content.match(/{{([^}]+)}}/g);
        if (matches) matches.forEach(m => varSet.add(m.replace(/{{|}}/g, '')));
    }
    
    // Extract from Chat messages
    if (activeVersion.messages) {
        activeVersion.messages.forEach(msg => {
            const matches = msg.content.match(/{{([^}]+)}}/g);
            if (matches) matches.forEach(m => varSet.add(m.replace(/{{|}}/g, '')));
        });
    }

    return Array.from(varSet);
  }, [activeVersion]);

  // --- Handlers ---

  const handleSelectVersion = (v: PromptVersion) => {
    setActiveVersionId(v.id);
    
    // Auto-switch View based on Type
    if (v.type === 'chat') {
      setCurrentView(AppView.CHAT);
    } else if (v.type === 'workflow') {
      setCurrentView(AppView.WORKFLOW);
    } else {
      setCurrentView(AppView.EDITOR); // Default to Text Editor
    }
  };

  const handleCreateProject = (name: string, tags: string[]) => {
    if (!user) return;
    const newProject: PromptProject = { id: `proj-${Date.now()}`, userId: user.id, name, tags, createdAt: Date.now(), updatedAt: Date.now() };
    setProjects(prev => [newProject, ...prev]);
    setActiveProjectId(newProject.id);
    setVersions(prev => [{
      id: `v-${Date.now()}`, userId: user.id, projectId: newProject.id, name: 'v1.0 Init',
      type: 'text',
      content: DEFAULT_PROMPT_CONTENT, systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
      createdAt: Date.now(), model: DEFAULT_MODEL_ID, config: { temperature: 0.7, topP: 0.95, topK: 40, responseMimeType: 'text/plain' }
    }, ...prev]);
  };

  const handleUpdateProject = (id: string, updates: Partial<PromptProject>) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p));
  };

  const handleRequestCommit = (content: string, system: string, config: GenerationConfig, messages?: ChatMessage[], modelId?: string) => {
    const isChat = !!messages && messages.length > 0;
    setPendingCommitData({ 
        content, 
        system, 
        config, 
        messages, 
        type: isChat ? 'chat' : 'text',
        modelId 
    });
    setIsCommitOpen(true);
  };
  
  const handleWorkflowCommit = (content: string, name: string) => {
      // Content is the JSON string of the graph
      let graph = undefined;
      try { graph = JSON.parse(content); } catch {}
      
      const newVersion: PromptVersion = {
          id: `v-${Date.now()}`,
          userId: user!.id,
          projectId: activeProjectId,
          name: name,
          type: 'workflow',
          content: content,
          systemInstruction: '', 
          workflowGraph: graph,
          createdAt: Date.now(),
          model: '', 
          config: { temperature: 0, topP: 0, topK: 0, responseMimeType: 'text/plain' }
      };
      setVersions(prev => [newVersion, ...prev]);
      setActiveVersionId(newVersion.id);
  };

  const handleCommit = (name: string, notes: string) => {
    if (!pendingCommitData) return;
    handleSaveNewVersion(
        pendingCommitData.content, 
        pendingCommitData.system, 
        name, 
        pendingCommitData.config, 
        notes, 
        activeVersionId,
        pendingCommitData.type,
        pendingCommitData.messages,
        pendingCommitData.modelId
    );
    setIsCommitOpen(false);
    setPendingCommitData(null);
  };

  const handleSaveNewVersion = (
      content: string, 
      system: string, 
      name: string, 
      config: GenerationConfig, 
      notes: string = '', 
      parentId?: string,
      type: 'text' | 'chat' | 'workflow' = 'text',
      messages: ChatMessage[] = [],
      specificModelId?: string
    ) => {
    if (!activeProjectId || !user) return;
    const newVersion: PromptVersion = {
      id: `v-${Date.now()}`, 
      userId: user.id,
      projectId: activeProjectId, 
      parentId: parentId, 
      name, 
      type,
      content, 
      messages: type === 'chat' ? messages : undefined,
      systemInstruction: system,
      createdAt: Date.now(), 
      // Use specific model ID if provided (e.g., from Chat Builder), otherwise fallback to global selection
      model: specificModelId || selectedTestModelId, 
      config,
      notes 
    };
    setVersions(prev => [newVersion, ...prev]);
    setActiveVersionId(newVersion.id);
  };

  const handleForkVersion = (v: PromptVersion) => {
      const forkName = `Fork of ${v.name}`;
      handleSaveNewVersion(
          v.content, 
          v.systemInstruction, 
          forkName, 
          v.config, 
          `Forked from ${v.name}`, 
          v.id,
          v.type,
          v.messages
      );
  };

  const handleRunTest = async (inputs: VariableMap, attachments: Attachment[], configOverride: LLMConfig) => {
    if (!activeVersion) return;
    setIsRunningTest(true);
    
    // TODO: Handle Chat Test Run
    let prompt = activeVersion.content;
    Object.entries(inputs).forEach(([key, val]) => {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), val);
    });

    const startTime = Date.now();
    try {
      const result = await generateContent(configOverride, prompt, activeVersion.systemInstruction, activeVersion.config, attachments);
      
      const run: TestRun = {
        id: `run-${Date.now()}`,
        versionId: activeVersion.id,
        timestamp: Date.now(),
        inputs,
        attachmentsCount: attachments.length,
        output: result.text,
        latency: Date.now() - startTime,
        tokenUsage: result.tokenUsage,
        modelUsed: configOverride.name || configOverride.modelId
      };

      setLastTestRun(run);
      setTestLogs(prev => ({
        ...prev,
        [activeVersion.id]: [...(prev[activeVersion.id] || []), run]
      }));
    } catch (error: any) {
      const errorRun: TestRun = {
        id: `run-${Date.now()}`,
        versionId: activeVersion.id,
        timestamp: Date.now(),
        inputs,
        attachmentsCount: attachments.length,
        output: `执行错误: ${error.message}`,
        latency: Date.now() - startTime,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        error: true,
        modelUsed: configOverride.name || configOverride.modelId
      };
      setLastTestRun(errorRun);
      setTestLogs(prev => ({ ...prev, [activeVersion.id]: [...(prev[activeVersion.id] || []), errorRun] }));
    } finally {
      setIsRunningTest(false);
    }
  };

  const activeLLMConfig = useMemo(() => {
    return savedAPIs.find(api => api.id === selectedTestModelId) || savedAPIs[0];
  }, [savedAPIs, selectedTestModelId]);

  const handleOpenDiff = (current: PromptVersion, previous: PromptVersion) => {
    setDiffVersionA(previous); 
    setDiffVersionB(current);  
    setIsDiffOpen(true);
  };

  // --- Render ---

  if (isAuthLoading) return <div className="bg-slate-950 h-screen flex items-center justify-center text-slate-500">Loading...</div>;
  if (!user) return <LoginView />;
  if (!isDataLoaded) return <div className="bg-slate-950 h-screen flex items-center justify-center text-slate-500">正在同步工作区...</div>;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden selection:bg-indigo-500/30">
      
      {/* LEFT SIDEBAR (Navigation) */}
      <div className="flex-shrink-0 z-20 flex">
        <Sidebar 
          projects={projects}
          activeProjectId={activeProjectId}
          versions={currentProjectVersions}
          activeVersionId={activeVersionId}
          user={user}
          onSelectProject={setActiveProjectId}
          onCreateProject={handleCreateProject}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={(id) => setProjects(p => p.filter(x => x.id !== id))}
          onSelectVersion={handleSelectVersion}
          onDeleteVersion={(id) => setVersions(v => v.filter(x => x.id !== id))}
          onCompareVersion={handleOpenDiff}
          onForkVersion={handleForkVersion}
          onLogout={logout}
          availableAPIs={savedAPIs}
        />
      </div>

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative z-10">
        
        {/* Header */}
        <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950">
           <div className="flex items-center gap-6">
             <h1 className="font-bold text-xl text-white tracking-tight flex items-center gap-2">
                PromptLab <span className="text-indigo-500 text-xs bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">PRO</span>
             </h1>
             <div className="h-6 w-px bg-slate-800"></div>
             <nav className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                {[
                  { id: AppView.EDITOR, label: '单提示词' },
                  { id: AppView.CHAT, label: '对话构建' },
                  { id: AppView.WORKFLOW, label: '工作流' },
                  { id: AppView.COMPARE, label: '对比' },
                  { id: AppView.CROSS_CHECK, label: '高阶对比' },
                  { id: AppView.BATCH_TEST, label: '批量测试' },
                  { id: AppView.WEBAPP, label: '发布 API' },
                ].map(v => (
                  <button key={v.id} onClick={() => setCurrentView(v.id)} className={`text-xs font-medium px-4 py-1.5 rounded-md transition-all ${currentView === v.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}>
                    {v.label}
                  </button>
                ))}
             </nav>
           </div>
           <button onClick={() => setIsSettingsOpen(true)} className="text-slate-500 hover:text-white transition-colors flex items-center gap-2 text-xs font-medium bg-slate-900 px-3 py-1.5 rounded border border-slate-800 hover:border-slate-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              API 管理 ({savedAPIs.length})
           </button>
        </header>

        <main className="flex-1 flex overflow-hidden">
           {currentView === AppView.EDITOR && activeProject && activeVersion ? (
             <>
               <div className="flex-1 min-w-0 border-r border-slate-800 flex">
                 <PromptEditor 
                   activeVersion={activeVersion}
                   onUpdate={(u) => setVersions(prev => prev.map(v => v.id === activeVersionId ? { ...v, ...u } : v))}
                   onCommit={(content, system, config) => handleRequestCommit(content, system, config)}
                   variables={variables}
                   onOpenDeploy={() => setIsDeployOpen(true)}
                   availableAPIs={savedAPIs}
                 />
               </div>
               <div className="w-[360px] flex-shrink-0 bg-slate-900 border-l border-slate-800">
                 <TestPanel 
                   variables={variables}
                   onRun={(inputs, atts, _) => handleRunTest(inputs, atts, activeLLMConfig)}
                   isLoading={isRunningTest}
                   lastRun={lastTestRun}
                   history={testLogs[activeVersionId] || []}
                   selectedModelId={selectedTestModelId}
                   onModelChange={setSelectedTestModelId}
                   availableAPIs={savedAPIs}
                   onClearHistory={() => setTestLogs(prev => ({ ...prev, [activeVersionId]: [] }))}
                 />
               </div>
             </>
           ) : currentView === AppView.EDITOR ? (
             <div className="flex-1 flex items-center justify-center text-slate-500">请选择或创建一个项目</div>
           ) : null}

           {currentView === AppView.CHAT && activeVersion && (
             <div className="flex-1 h-full bg-slate-950">
               <ChatBuilderView 
                 activeVersion={activeVersion}
                 availableAPIs={savedAPIs}
                 onCommit={(content, system, config, messages, modelId) => handleRequestCommit(content, system, config, messages, modelId)}
                 onUpdate={(u) => setVersions(prev => prev.map(v => v.id === activeVersionId ? { ...v, ...u } : v))}
               />
             </div>
           )}
           
           {currentView === AppView.WORKFLOW && activeVersion && (
             <div className="flex-1 h-full bg-slate-950">
                <WorkflowBuilderView 
                  activeVersion={activeVersion}
                  projects={projects}
                  versions={versions}
                  availableAPIs={savedAPIs}
                  onCommit={handleWorkflowCommit}
                />
             </div>
           )}

           {currentView === AppView.COMPARE && activeVersion && (
             <div className="flex-1 h-full bg-slate-950">
               <ComparisonView 
                 activeVersion={activeVersion} 
                 variables={variables} 
                 availableAPIs={savedAPIs}
               />
             </div>
           )}
           
           {currentView === AppView.CROSS_CHECK && (
             <div className="flex-1 h-full bg-slate-950">
               <CrossCompareView
                 projects={projects}
                 versions={versions}
                 availableAPIs={savedAPIs}
               />
             </div>
           )}

           {currentView === AppView.BATCH_TEST && (
             <div className="flex-1 h-full bg-slate-950">
               <BatchTestView
                 projects={projects}
                 versions={versions}
                 availableAPIs={savedAPIs}
                 datasets={datasets}
                 onUpdateDatasets={setDatasets}
                 batchRuns={batchRuns}
                 onUpdateBatchRuns={setBatchRuns}
               />
             </div>
           )}

           {currentView === AppView.WEBAPP && (
             <div className="flex-1 h-full bg-slate-950">
                <WebAppView 
                  projects={projects}
                  versions={versions}
                  availableAPIs={savedAPIs}
                  services={services}
                  onUpdateServices={setServices}
                />
             </div>
           )}
        </main>
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        savedAPIs={savedAPIs}
        onUpdateAPIs={setSavedAPIs}
      />
      
      {activeVersion && (
      <DeployModal 
        isOpen={isDeployOpen}
        onClose={() => setIsDeployOpen(false)}
        activeVersion={activeVersion}
        activeModel={activeLLMConfig}
      />
      )}

      <DiffModal
        isOpen={isDiffOpen}
        onClose={() => setIsDiffOpen(false)}
        oldVersion={diffVersionA}
        newVersion={diffVersionB}
      />

      <CommitModal 
        isOpen={isCommitOpen}
        onClose={() => setIsCommitOpen(false)}
        onCommit={handleCommit}
        suggestedName={`v${Date.now().toString().slice(-4)}`}
      />
    </div>
  );
};

export default App;
