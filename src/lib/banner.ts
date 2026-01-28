import cfonts from 'cfonts';
import pc from 'picocolors';

export function renderBanner(): void {
  const result = cfonts.render('clones', {
    font: 'tiny',
    colors: ['candy'],
    space: false,
  });
  if (result) {
    console.log(result.string);
  }
}

export function renderInfo(pkg: { name: string; version: string; description?: string }): void {
  const info = `${pc.dim(pkg.name)} ${pc.cyan(`v${pkg.version}`)}`;
  const desc = pkg.description ? pc.dim(` — ${pkg.description}`) : '';
  console.log(`${info}${desc}\n`);
}
