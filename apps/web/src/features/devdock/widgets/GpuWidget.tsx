import { useLocale } from '@web/lib/i18n';
import { useAppProcessMetrics } from './appProcessMetrics';
import { readoutClass } from './readoutStyles';

export function GpuWidget() {
  const { t: tr } = useLocale();
  const gpu = useAppProcessMetrics()?.gpu;
  if (!gpu) return null;
  return (
    <span
      className={readoutClass(gpu.cpuPercent >= 100 ? 'high' : gpu.cpuPercent >= 50 ? 'mid' : 'ok')}
      title={tr('devGpuHelp')}
    >
      GPU {gpu.cpuPercent.toFixed(1)}% · {Math.round(gpu.memoryMB)} MB
    </span>
  );
}
