// SPEC-009 §5.6.5 — o "Desfazer" do aviso só vale para a ação que o criou.

/** O topo da pilha ainda é `item`? (Se não, desfazer mexeria em outra ação.) */
export function canUndoFromToast(stack: readonly unknown[], item: unknown): boolean {
  return item !== undefined && item !== null && stack.length > 0 && stack[stack.length - 1] === item;
}
