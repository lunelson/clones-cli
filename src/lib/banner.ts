import pc from 'picocolors';

declare const __DEV__: boolean;
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

// Pre-generated banner (cfonts tiny/candy)
const BANNER =
  '\n\u001b[35m \u001b[39m\u001b[95m█▀▀\u001b[39m\u001b[96m \u001b[39m\u001b[32m█  \u001b[39m\u001b[92m \u001b[39m\u001b[91m█▀█\u001b[39m\u001b[92m \u001b[39m\u001b[95m█▄ █\u001b[39m\u001b[32m \u001b[39m\u001b[32m█▀▀\u001b[39m\u001b[96m \u001b[39m\u001b[31m█▀▀\u001b[39m\n\u001b[31m \u001b[39m\u001b[31m█▄▄\u001b[39m\u001b[36m \u001b[39m\u001b[33m█▄▄\u001b[39m\u001b[31m \u001b[39m\u001b[96m█▄█\u001b[39m\u001b[32m \u001b[39m\u001b[32m█ ▀█\u001b[39m\u001b[95m \u001b[39m\u001b[96m██▄\u001b[39m\u001b[33m \u001b[39m\u001b[94m▄▄█\u001b[39m\n';

export function renderBanner(): void {
  console.log(BANNER);
}

export function renderInfo(pkg: { name: string; version: string; description?: string }): void {
  const devTag = isDev ? pc.yellow(' (dev)') : '';
  const info = `${pc.dim(pkg.name)} ${pc.cyan(`v${pkg.version}`)}${devTag}`;
  const desc = pkg.description ? pc.dim(` — ${pkg.description}`) : '';
  console.log(`${info}${desc}\n`);
}
