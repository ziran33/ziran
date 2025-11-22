
import { WorkflowNode, WorkflowEdge, LLMConfig, WorkflowRunLog, PromptVersion, Attachment } from '../types';
import { generateContent } from './geminiService';

// Helper: Extract variables from a string
const getVariables = (text: string): string[] => {
  return (text.match(/{{([^}]+)}}/g) || []).map(s => s.replace(/{{|}}/g, ''));
};

export const executeWorkflowEngine = async (
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  startInputs: Record<string, string>,
  attachments: Attachment[] = [],
  versions: PromptVersion[],
  availableAPIs: LLMConfig[],
  onNodeStatusUpdate?: (nodeId: string, status: 'running' | 'success' | 'error', output?: string) => void
): Promise<WorkflowRunLog> => {
  
  const logId = `log-${Date.now()}`;
  const runLog: WorkflowRunLog = {
      id: logId,
      timestamp: Date.now(),
      status: 'success',
      inputs: startInputs,
      outputs: {},
      steps: []
  };

  // Execution Context (Variables)
  const executionContext: Record<string, string> = { ...startInputs };
  const processedNodes = new Set<string>();
  
  // 1. Process Start Node
  const startNode = nodes.find(n => n.type === 'start');
  if (startNode) {
      if (onNodeStatusUpdate) onNodeStatusUpdate(startNode.id, 'success', JSON.stringify(startInputs));
      runLog.steps.push({ nodeId: startNode.id, nodeName: startNode.name, status: 'success', output: JSON.stringify(startInputs), latency: 0 });
      processedNodes.add(startNode.id);
  }

  // 2. Execution Loop
  const remainingNodes = nodes.filter(n => n.type !== 'start');
  let iterationLimit = 100; // Safety break

  while (remainingNodes.length > 0 && iterationLimit > 0) {
      iterationLimit--;
      
      // Find a node where all inputs are satisfied
      const readyNodeIndex = remainingNodes.findIndex(node => {
          let requiredVars: string[] = [];
          
          if (node.type === 'llm') {
              if (node.data.userPromptOverride) {
                  requiredVars = getVariables(node.data.userPromptOverride);
              } else {
                  const v = versions.find(ver => ver.id === node.data.versionId);
                  if (v) {
                       requiredVars = getVariables(v.content);
                       if (v.messages) {
                           v.messages.forEach(m => getVariables(m.content).forEach(rv => requiredVars.push(rv)));
                       }
                  }
              }
          } else if (node.type === 'end') {
              requiredVars = getVariables(node.data.outputTemplate || '');
          }
          
          if (requiredVars.length === 0) return true; // No inputs needed
          
          // Check if all required variables are present in execution context or available from an upstream node via edge
          return requiredVars.every(v => {
              if (executionContext[v] !== undefined) return true;
              
              const edge = edges.find(e => e.target === node.id && e.targetHandle === v);
              if (!edge) return false; // Missing connection
              return processedNodes.has(edge.source);
          });
      });

      if (readyNodeIndex === -1) {
          // No ready nodes found. Stop.
          break;
      }

      const node = remainingNodes[readyNodeIndex];
      remainingNodes.splice(readyNodeIndex, 1);

      // Execute Node
      if (onNodeStatusUpdate) onNodeStatusUpdate(node.id, 'running');
      
      const startTime = Date.now();
      let output = "";
      
      try {
          if (node.type === 'llm') {
              const nodeInputs: Record<string, string> = {};
              
              // Determine required variables
              let vars: string[] = [];
              if (node.data.userPromptOverride) {
                  vars = getVariables(node.data.userPromptOverride);
              } else {
                  const v = versions.find(ver => ver.id === node.data.versionId);
                  if (v) {
                       vars = getVariables(v.content);
                       if (v.messages) v.messages.forEach(m => getVariables(m.content).forEach(rv => vars.push(rv)));
                  }
              }

              // Fetch values
              vars.forEach(v => {
                  if (executionContext[v] !== undefined) {
                      nodeInputs[v] = executionContext[v];
                  } else {
                      const edge = edges.find(e => e.target === node.id && e.targetHandle === v);
                      if (edge) {
                          const sourceNode = nodes.find(n => n.id === edge.source);
                          if (sourceNode) {
                              if (sourceNode.type === 'start') {
                                  nodeInputs[v] = executionContext[v] || ''; 
                              } else if (sourceNode.type === 'llm') {
                                  const outVar = sourceNode.data.outputVariableName;
                                  if (outVar && executionContext[outVar]) {
                                      nodeInputs[v] = executionContext[outVar];
                                  } else {
                                      nodeInputs[v] = executionContext[`_raw_output_${sourceNode.id}`] || '';
                                  }
                              }
                          }
                      }
                  }
              });

              // Construct Prompt
              const version = versions.find(v => v.id === node.data.versionId);
              if (!version) throw new Error("Ref version not found");
              
              let promptContent = node.data.userPromptOverride || version.content;
              Object.entries(nodeInputs).forEach(([k, val]) => {
                  promptContent = promptContent.replace(new RegExp(`{{${k}}}`, 'g'), val);
              });

              const modelConfig = availableAPIs.find(a => a.id === version.model) || availableAPIs[0];
              const systemInstr = node.data.includeSystemPrompt !== false ? version.systemInstruction : "";

              // Execute
              // Note: We pass the global attachments to every node for now, 
              // or ideally we only pass attachments if this node is configured to accept them.
              // For now, we assume inputs are text, but we pass attachments just in case the model needs them.
              const res = await generateContent(modelConfig, promptContent, systemInstr, version.config, attachments);
              output = res.text;
              
              // Update Context
              if (node.data.outputVariableName) {
                  executionContext[node.data.outputVariableName] = output;
              }
              executionContext[`_raw_output_${node.id}`] = output;

          } else if (node.type === 'end') {
              let template = node.data.outputTemplate || '';
              const vars = getVariables(template);
              
              vars.forEach(v => {
                 if (executionContext[v] !== undefined) {
                     template = template.replace(new RegExp(`{{${v}}}`, 'g'), executionContext[v]);
                 } else {
                     const edge = edges.find(e => e.target === node.id && e.targetHandle === v);
                     if (edge) {
                         const sourceNode = nodes.find(n => n.id === edge.source);
                         if (sourceNode) {
                             const val = executionContext[`_raw_output_${sourceNode.id}`] || '';
                             template = template.replace(new RegExp(`{{${v}}}`, 'g'), val);
                         }
                     }
                 }
              });
              output = template;
              runLog.outputs['final'] = output;
          }

          if (onNodeStatusUpdate) onNodeStatusUpdate(node.id, 'success', output);
          processedNodes.add(node.id);
          runLog.steps.push({
              nodeId: node.id, nodeName: node.name, status: 'success', output, latency: Date.now() - startTime
          });

      } catch (err: any) {
          if (onNodeStatusUpdate) onNodeStatusUpdate(node.id, 'error');
          runLog.status = 'error';
          runLog.steps.push({
              nodeId: node.id, nodeName: node.name, status: 'error', output: err.message, latency: Date.now() - startTime
          });
          break; // Stop on error
      }
  }
  
  return runLog;
};
