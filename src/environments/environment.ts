/**
 * Runtime config is produced from the project root `.env` file at install/build/serve time.
 * Copy `.env.example` to `.env` and adjust values. On the server, set variables in `.env` before `npm run build`.
 * @see scripts/sync-env.cjs
 */
export { environment } from './environment.app';
