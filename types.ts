

export type LLMProvider = 'gemini' | 'openai-compatible';

export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  createdAt: number;
}

export interface LLMConfig {
  id: string; // UUID for the config entry
  userId: string; // Owner
  name: string; // User friendly name (e.g. "My GPT-4", "Local LLM")
  provider: LLMProvider;
  apiKey?: string; // User override
  baseUrl?: string; // For OpenAI compatible
  modelId: string; // The actual model string to send to API
  isDefault?: boolean; // New: Mark as default selection
}

export interface GenerationConfig {
  temperature: number;
  topP: number;
  topK: number;
  maxOutputTokens?: number;
  responseMimeType: 'text/plain' | 'application/json';
}

export interface PromptProject {
  id: string;
  userId: string; // Owner
  name: string;
  description?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  isError?: boolean;
}

// --- Workflow Types (Visual) ---

export type WorkflowNodeStatus = 'idle' | 'running' | 'success' | 'error';

export interface WorkflowNode {
  id: string;
  type: 'start' | 'llm' | 'end'; // 'start' is the global input trigger
  x: number;
  y: number;
  name: string;
  status?: WorkflowNodeStatus;
  lastOutput?: string; // Cache last run output
  data: {
    projectId?: string;
    versionId?: string;
    includeSystemPrompt?: boolean; // Toggle for LLM nodes
    userPromptOverride?: string; // New: Override the prompt content in the node
    outputVariableName?: string; // New: Define the output variable name (e.g., 'summary')
    globalInputs?: { name: string; type: 'string' | 'file' }[]; 
    outputTemplate?: string; // For 'end' node: define final output format
  };
}

export interface WorkflowEdge {
  id: string;
  source: string; // Node ID
  sourceHandle: string; // "output" or specific output name
  target: string; // Node ID
  targetHandle: string; // Input variable name (e.g., "query", "context")
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  zoom: number;
  pan: { x: number; y: number };
}

export interface WorkflowRunLog {
  id: string;
  timestamp: number;
  status: 'success' | 'error';
  inputs: VariableMap;
  outputs: Record<string, any>; // Final outputs
  steps: {
    nodeId: string;
    nodeName: string;
    status: 'success' | 'error';
    output: string;
    latency: number;
  }[];
}

// ------------------------------

export interface PromptVersion {
  id: string;
  userId: string; // Owner
  projectId: string;
  parentId?: string; // For tracking lineage/branching
  name: string;
  
  // Core Content
  type?: 'text' | 'chat' | 'workflow';
  systemInstruction: string;
  content: string; // Used for Text mode. For Workflow, this stores the JSON graph.
  messages?: ChatMessage[]; // Used for Chat mode
  workflowGraph?: WorkflowGraph; // Used for Workflow mode
  workflowLogs?: WorkflowRunLog[]; // New: Store logs for workflow versions
  
  createdAt: number;
  notes?: string;
  model: string; // This now stores the llmConfig.id
  config: GenerationConfig;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'text' | 'audio' | 'video';
  mimeType: string;
  data: string; // Base64 string
}

export interface VariableMap {
  [key: string]: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  text: string;
  tokenUsage: TokenUsage;
}

export interface SimulationResult {
  id: string;
  inputs: VariableMap;
  outputs: Record<string, { output: LLMResponse; latency: number }>;
}

export interface TestRun {
  id: string;
  versionId: string;
  userId?: string;
  timestamp: number;
  inputs: VariableMap;
  attachmentsCount: number;
  output: string;
  latency: number;
  tokenUsage: TokenUsage;
  error?: boolean;
  modelUsed: string;
}

export interface ServiceStats {
  totalCalls: number;
  totalTokens: number;
  totalErrors: number;
  avgLatency: number;
  lastCalledAt?: number;
}

export interface ServiceApiKey {
  id: string;
  name: string; // e.g., "Mobile App", "Client A"
  key: string; // "sk-pl-..."
  createdAt: number;
  isActive: boolean;
}

export interface ServiceLog {
  id: string;
  timestamp: number;
  keyName: string; // Which key was used
  status: 200 | 400 | 401 | 403 | 500 | 503;
  latency: number;
  tokens: number;
  error?: string;
  requestBody?: string; // JSON string of the request
  responseBody?: string; // JSON string of the response/output
  requestUrl?: string; // The actual URL called
}

export interface ServiceDeployment {
  id: string;
  userId: string; // Owner
  name: string;
  description?: string;
  projectId: string;
  versionId: string;
  modelConfigId: string;
  isActive: boolean;
  createdAt: number;
  
  // New fields for Gateway features
  apiKeys: ServiceApiKey[];
  logs: ServiceLog[];
}

// --- Batch Testing Types ---

export interface TestCase {
  id: string;
  inputs: VariableMap;
  attachments: Attachment[];
}

export interface Dataset {
  id: string;
  userId: string;
  name: string;
  description?: string;
  variables: string[]; // The variable keys used in this dataset
  cases: TestCase[];
  updatedAt: number;
}

export interface BatchResult {
  caseId: string;
  status: 'success' | 'error';
  output: string;
  latency: number;
  tokens: number;
  error?: string;
  rating?: number; // 1-5 stars
  notes?: string;
}

export interface BatchRun {
  id: string;
  userId: string;
  datasetId: string;
  projectId: string;
  versionId: string;
  modelConfigId: string;
  timestamp: number;
  results: BatchResult[];
  status: 'running' | 'completed';
  progress: number; // 0-100
  totalCases: number;
}

// ---------------------------

export enum AppView {
  EDITOR = 'EDITOR',
  CHAT = 'CHAT',
  WORKFLOW = 'WORKFLOW',
  COMPARE = 'COMPARE',
  CROSS_CHECK = 'CROSS_CHECK', 
  BATCH_TEST = 'BATCH_TEST', // New View
  WEBAPP = 'WEBAPP',
}

export const DEFAULT_SYSTEM_INSTRUCTION = `你是一个专业的 AI 助手。请以简洁、准确的风格回答用户问题。`;
export const DEFAULT_PROMPT_CONTENT = `用户问题: {{query}}

请根据上述问题提供详细的分析。`;