// A bounded arithmetic parser: no eval, variables, assignments, or JavaScript.
export function calculate(expression) {
  if (typeof expression !== 'string' || expression.length > 300) throw new Error('Expression must be at most 300 characters.');
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[()+\-*/^]/gi) || [];
  if (tokens.join('').toLowerCase() !== expression.replace(/\s/g, '').toLowerCase()) throw new Error('Unsupported expression.');
  let index = 0, depth = 0;
  const functions = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log, exp: Math.exp, abs: Math.abs };
  function atom() {
    if (++depth > 32) throw new Error('Expression too deeply nested.');
    const token = tokens[index++];
    let result;
    if (token === '(') { result = add(); if (tokens[index++] !== ')') throw new Error('Missing closing parenthesis.'); }
    else if (token === '+' || token === '-') { result = (token === '-' ? -1 : 1) * power(); }
    else if (token?.toLowerCase() === 'pi') result = Math.PI;
    else if (token?.toLowerCase() === 'e') result = Math.E;
    else if (Object.hasOwn(functions, token?.toLowerCase() || '')) {
      if (tokens[index++] !== '(') throw new Error('Function requires parentheses.');
      result = functions[token.toLowerCase()](add());
      if (tokens[index++] !== ')') throw new Error('Missing closing parenthesis.');
    } else if (token && /^\d|^\.\d/.test(token)) result = Number(token);
    else throw new Error('Expected a number.');
    depth--; return result;
  }
  function power() { const left = atom(); return tokens[index] === '^' ? (index++, left ** power()) : left; }
  function multiply() { let value = power(); while (tokens[index] === '*' || tokens[index] === '/') { const op = tokens[index++]; const right = power(); value = op === '*' ? value * right : value / right; } return value; }
  function add() { let value = multiply(); while (tokens[index] === '+' || tokens[index] === '-') { const op = tokens[index++]; const right = multiply(); value = op === '+' ? value + right : value - right; } return value; }
  const value = add();
  if (index !== tokens.length || !Number.isFinite(value)) throw new Error('Expression has no finite real result.');
  return value;
}
