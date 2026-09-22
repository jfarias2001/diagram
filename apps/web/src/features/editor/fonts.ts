import { type FontId } from '@diagram/shared';

// Fontes do quadro (SPEC-007 §5.4). Todas são auto-hospedadas (@fontsource,
// empacotadas pelo Vite), o que respeita a CSP `font-src 'self'` — nada é
// buscado num CDN em tempo de uso.
//
// O arquivo de cada família é carregado SÓ quando um documento a usa: são
// import() dinâmicos, então quem abre um mapa com a fonte padrão não baixa as
// outras sete. Enquanto o arquivo chega, o quadro segue com a fonte padrão.

type Loader = () => Promise<unknown>;

const LOADERS: Record<Exclude<FontId, 'sans'>, Loader> = {
  inter: () => import('@fontsource-variable/inter'),
  geometrica: () => import('@fontsource-variable/outfit'),
  serifada: () => import('@fontsource-variable/source-serif-4'),
  manuscrita: () => import('@fontsource-variable/caveat'),
  condensada: () => import('@fontsource-variable/oswald'),
  mono: () => import('@fontsource-variable/jetbrains-mono'),
  legivel: () => import('@fontsource/atkinson-hyperlegible'),
};

const started = new Map<FontId, Promise<void>>();

/**
 * Garante que a família esteja carregada. Chamar de novo não baixa outra vez.
 * Uma falha de rede não derruba o editor: o quadro fica com a fonte padrão.
 */
export function loadFont(id: FontId): Promise<void> {
  const cached = started.get(id);
  if (cached) return cached;
  const loader = id === 'sans' ? null : LOADERS[id];
  const promise = (loader ? loader() : Promise.resolve())
    .then(() => undefined)
    .catch(() => undefined);
  started.set(id, promise);
  return promise;
}
