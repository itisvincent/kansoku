import { useLocale } from '@web/lib/i18n';
import { useAppProcessMetrics } from './appProcessMetrics';
import { readoutClass } from './readoutStyles';

export function CpuWidget() {
  const { t: tr } = useLocale();
  const metrics = useAppProcessMetrics();
  if (!metrics) return null;
  const percent = metrics.cpuPercent;
  return (
    <span
      className={readoutClass(percent >= 200 ? 'high' : percent >= 100 ? 'mid' : 'ok')}
      title={tr('devCpuHelp')}
    >
      CPU {percent.toFixed(1)}%
    </span>
  );
}
