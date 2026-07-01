/**
 * Atlas CLI entry point — invoked by Tempest for two purposes:
 *
 *   node server-entry.js --init --path <project>
 *     Initialise the .atlas/ directory and build the first full code-graph index.
 *     Runs once when the user first accepts Token Intelligence for a project.
 *     Exits 0 when done (or if the project was already indexed).
 *
 *   node server-entry.js --path <project>
 *     Start an MCP server session (proxy or daemon). Used at agent spawn time
 *     to inject the atlas tools into the agent's context.
 *     The daemon re-invokes this script with ATLAS_DAEMON_INTERNAL=1 set,
 *     so it also handles the "I am the shared daemon" path transparently.
 */

import * as path from 'path';

void main();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let projectPath: string | undefined;
  let initMode = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--path') {
      const next = args[i + 1];
      if (next !== undefined) {
        projectPath = next;
        i++;
      }
    } else if (arg === '--init') {
      initMode = true;
    }
    // Ignore 'serve', '--mcp', and other flags the daemon spawner may pass
    // when re-invoking this script with ATLAS_DAEMON_INTERNAL=1.
  }

  if (!projectPath) {
    process.stderr.write('[Atlas] --path <project> is required\n');
    process.exit(1);
  }

  const resolvedPath = path.resolve(projectPath);

  if (initMode) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../index') as typeof import('../index');
    try {
      if (!mod.isInitialized(resolvedPath)) {
        await mod.default.init(resolvedPath, { index: true });
      }
    } catch (err) {
      process.stderr.write(`[Atlas] init failed: ${err}\n`);
    }
    process.exit(0);
  }

  // MCP server mode: proxy to (or become) the shared daemon.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mcp = require('./index') as typeof import('./index');
  const server = new mcp.MCPServer(resolvedPath);
  await server.start();
}
