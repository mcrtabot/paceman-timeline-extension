import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export const fixture = <T = unknown>(rel: string): T =>
  JSON.parse(readFileSync(`${root}fixtures/${rel}`, 'utf8')) as T;
