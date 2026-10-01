import { checkCanvasSource } from './check.js';
import { compileCanvasSource } from './compile.js';
import { reviewCanvasBindings, reviewCanvasStructure } from './review.js';

export async function validateCanvasSource(source: string): Promise<string[]> {
  const issues = [
    ...checkCanvasSource(source),
    ...reviewCanvasStructure(source),
    ...reviewCanvasBindings(source),
  ];
  if (issues.length) return issues;
  // Compile only. Running the module here would execute AI-written code in the kernel
  // (the Electron main process on desktop); it only ever runs inside the sandboxed frame,
  // which reports runtime errors back on its own.
  const compiled = await compileCanvasSource(source);
  if (!compiled.ok) return compiled.issues;
  return [];
}
