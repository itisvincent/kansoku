import { Navigate, useParams } from 'react-router';
import { researchCanvasPath } from '@kansoku/core/contract/research';

export function Component() {
  // react-router already decodes params; decoding again threw on a literal %.
  const slug = useParams().slug ?? '';
  const path = slug ? researchCanvasPath(slug) : '';
  const search = new URLSearchParams({ view: 'canvases' });
  if (path) search.set('path', path);
  return <Navigate to={`/research?${search.toString()}`} replace />;
}
