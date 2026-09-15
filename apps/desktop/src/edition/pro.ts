import type { DesktopProComposition } from './types.js';
import { isLocalTestBuildBaked } from '@kansoku/core/license/licenseGate';
import { communityDetectors } from '@kansoku/core/analysis/intraday/communityDetectors';

export async function loadProComposition(): Promise<DesktopProComposition | null> {
  // 社区形态检测器（原创实现，仅 auto-patterns 档）只在本地测试构建里顶上 pro 槽位：
  // license 闸门已烧开的包配合 proPresent=true 让 featureState 走到 active。
  // 开源/正式构建保持 null —— absent 语义不变；pro overlay 在位时会投影替换本文件，
  // 真实 pro 组合天然优先。别把本改动推到上游，是否开源这些是项目维护者的决定。
  if (!isLocalTestBuildBaked()) return null;
  const [{ LocalTrainerIpc }, { localTrainingFillChannel }, { disposeLocalTrainer }] =
    await Promise.all([
      import('../training/ipc.js'),
      import('../training/channel.js'),
      import('../training/instance.js'),
    ]);
  return {
    ipcServices: [LocalTrainerIpc],
    realtimeChannels: [localTrainingFillChannel],
    detectors: communityDetectors(),
    dispose: disposeLocalTrainer,
  };
}
