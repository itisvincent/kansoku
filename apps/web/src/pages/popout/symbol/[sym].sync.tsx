import { useParams } from 'react-router';
import { PopoutChartWindow } from '@web/features/charts/PopoutChartWindow';

export function Component() {
  const { sym } = useParams();
  // react-router already decodes params; decoding again threw on a literal %.
  return <PopoutChartWindow sym={sym ?? ''} />;
}
