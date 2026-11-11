import { MutationCache } from '@tanstack/react-query';
import { errorMessage, toast } from '../components/toastStore';

// SPEC-009 §5.4 — erro de qualquer ação vira aviso, perto de onde a pessoa
// está olhando (antes era um texto no topo da página, muitas vezes fora da
// vista). Formulário mostra o erro no próprio campo e marca `INLINE_ERROR`.

export const INLINE_ERROR = { meta: { inlineError: true } } as const;

export const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    if (mutation.meta?.inlineError) return;
    toast({ message: errorMessage(error), tone: 'error' });
  },
});
