// Tool registry. Import path '@/lib/ai/tools' resolves here.
// - editorTools + articleTools are always available (allTools)
// - sourceTools are spread in separately by the chat route
import { editorTools } from './editor-tools';
import { articleTools } from './articles';

export { sourceTools } from './sources';

export const allTools = {
  ...editorTools,
  ...articleTools,
};
