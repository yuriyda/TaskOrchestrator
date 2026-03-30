/**
 * Keyboard layout utilities — QWERTY ↔ ЙЦУКЕН bidirectional mapping.
 * Used for search: when user types in wrong layout, swapLayout converts the query.
 */
export const _EN: string = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
export const _RU: string = "йцукенгшщзхъфывапролджэячсмитьбю";
export const _layoutMap: Record<string, string> = {};
for (let i = 0; i < _EN.length; i++) { _layoutMap[_EN[i]] = _RU[i]; _layoutMap[_RU[i]] = _EN[i]; }
export function swapLayout(str: string): string {
  let out = "";
  for (const ch of str) out += _layoutMap[ch] || ch;
  return out;
}
