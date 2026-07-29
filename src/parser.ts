export interface ModuleDeclaration {
  name: string;
  parameters: string[];
  ports: string[];
}

export interface GenerateOptions {
  instancePrefix?: string;
  alignConnections?: boolean;
}

export class SystemVerilogParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SystemVerilogParseError';
  }
}

const IDENTIFIER_PATTERN = /\\[^\s,()[\]{}]+|[A-Za-z_][A-Za-z0-9_$]*/g;
const MODULE_LIFETIMES = new Set(['automatic', 'static']);

export function parseModuleDeclaration(source: string): ModuleDeclaration {
  const text = maskComments(source);
  const moduleIndex = findKeyword(text, 'module');
  if (moduleIndex < 0) {
    throw new SystemVerilogParseError('No module declaration was found in the selection.');
  }

  let cursor = skipWhitespace(text, moduleIndex + 'module'.length);
  let identifier = readIdentifier(text, cursor);

  if (identifier && MODULE_LIFETIMES.has(identifier.value)) {
    cursor = skipWhitespace(text, identifier.end);
    identifier = readIdentifier(text, cursor);
  }

  if (!identifier) {
    throw new SystemVerilogParseError('The module name could not be parsed.');
  }

  const moduleName = identifier.value;
  cursor = skipWhitespace(text, identifier.end);

  let parameters: string[] = [];
  if (text[cursor] === '#') {
    cursor = skipWhitespace(text, cursor + 1);
    if (text[cursor] !== '(') {
      throw new SystemVerilogParseError('Expected a parameter list after "#".');
    }
    const parameterEnd = findMatchingDelimiter(text, cursor, '(', ')');
    parameters = extractDeclarationNames(text.slice(cursor + 1, parameterEnd), 'parameter');
    cursor = skipWhitespace(text, parameterEnd + 1);
  }

  let ports: string[] = [];
  if (text[cursor] === '(') {
    const portEnd = findMatchingDelimiter(text, cursor, '(', ')');
    ports = extractDeclarationNames(text.slice(cursor + 1, portEnd), 'port');
  } else if (text[cursor] !== ';') {
    throw new SystemVerilogParseError('The module port list could not be parsed.');
  }

  return {
    name: moduleName,
    parameters: uniqueNames(parameters),
    ports: uniqueNames(ports)
  };
}

export function generateInstantiation(
  declaration: ModuleDeclaration,
  options: GenerateOptions = {}
): string {
  const instancePrefix = options.instancePrefix ?? 'u_';
  const alignConnections = options.alignConnections ?? true;
  const instanceName = `${instancePrefix}${plainIdentifier(declaration.name)}`;
  const allNames = [...declaration.parameters, ...declaration.ports];
  const width = alignConnections
    ? Math.max(0, ...allNames.map((name) => name.length))
    : 0;

  const lines: string[] = [];
  if (declaration.parameters.length > 0) {
    lines.push(`${declaration.name} #(`);
    lines.push(...formatConnections(declaration.parameters, width));
    lines.push(`) ${instanceName} (`);
  } else {
    lines.push(`${declaration.name} ${instanceName} (`);
  }

  lines.push(...formatConnections(declaration.ports, width));
  lines.push(');');
  return `${lines.join('\n')}\n`;
}

function formatConnections(names: string[], width: number): string[] {
  return names.map((name, index) => {
    const comma = index === names.length - 1 ? '' : ',';
    const paddedName = width > 0 ? name.padEnd(width, ' ') : name;
    return `    .${paddedName} ( ${name} )${comma}`;
  });
}

function extractDeclarationNames(
  list: string,
  kind: 'parameter' | 'port'
): string[] {
  const parts = splitTopLevel(list, ',');
  const names: string[] = [];

  for (const originalPart of parts) {
    let part = removeAttributes(removeCompilerDirectiveLines(originalPart)).trim();
    if (!part) {
      continue;
    }

    const namedPort = part.match(/^\.\s*(\\[^\s(]+|[A-Za-z_][A-Za-z0-9_$]*)\s*\(/);
    if (kind === 'port' && namedPort) {
      names.push(namedPort[1]);
      continue;
    }

    const assignmentIndex = findTopLevelCharacter(part, '=');
    if (assignmentIndex >= 0) {
      part = part.slice(0, assignmentIndex).trim();
    }

    part = removeTrailingUnpackedDimensions(part);
    const tokens = part.match(IDENTIFIER_PATTERN);
    if (!tokens || tokens.length === 0) {
      continue;
    }

    const name = tokens[tokens.length - 1];
    if (name === 'parameter' || name === 'localparam') {
      continue;
    }
    names.push(name);
  }

  return names;
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '(' || character === '[' || character === '{') {
      stack.push(character);
      continue;
    }

    if (character === ')' || character === ']' || character === '}') {
      stack.pop();
      continue;
    }

    if (character === separator && stack.length === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(text.slice(start));
  return parts;
}

function maskComments(source: string): string {
  let result = '';
  let index = 0;
  let state: 'code' | 'line-comment' | 'block-comment' | 'string' = 'code';
  let escaped = false;

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (state === 'code') {
      if (character === '/' && next === '/') {
        result += '  ';
        index += 2;
        state = 'line-comment';
        continue;
      }
      if (character === '/' && next === '*') {
        result += '  ';
        index += 2;
        state = 'block-comment';
        continue;
      }
      if (character === '"') {
        state = 'string';
      }
      result += character;
      index += 1;
      continue;
    }

    if (state === 'line-comment') {
      if (character === '\n' || character === '\r') {
        result += character;
        state = 'code';
      } else {
        result += ' ';
      }
      index += 1;
      continue;
    }

    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        result += '  ';
        index += 2;
        state = 'code';
      } else {
        result += character === '\n' || character === '\r' ? character : ' ';
        index += 1;
      }
      continue;
    }

    if (escaped) {
      result += character === '\n' || character === '\r' ? character : ' ';
      escaped = false;
    } else if (character === '\\') {
      result += ' ';
      escaped = true;
    } else if (character === '"') {
      result += character;
      state = 'code';
    } else {
      result += character === '\n' || character === '\r' ? character : ' ';
    }
    index += 1;
  }

  return result;
}

function findKeyword(text: string, keyword: string): number {
  const pattern = new RegExp(`\\b${keyword}\\b`, 'g');
  const match = pattern.exec(text);
  return match?.index ?? -1;
}

function skipWhitespace(text: string, start: number): number {
  let cursor = start;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function readIdentifier(
  text: string,
  start: number
): { value: string; end: number } | undefined {
  if (text[start] === '\\') {
    let end = start + 1;
    while (end < text.length && !/\s/.test(text[end])) {
      end += 1;
    }
    return { value: text.slice(start, end), end };
  }

  const match = text.slice(start).match(/^[A-Za-z_][A-Za-z0-9_$]*/);
  if (!match) {
    return undefined;
  }
  return { value: match[0], end: start + match[0].length };
}

function findMatchingDelimiter(
  text: string,
  start: number,
  open: string,
  close: string
): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new SystemVerilogParseError(`Unterminated "${open}${close}" list.`);
}

function findTopLevelCharacter(text: string, target: string): number {
  const parts = splitTopLevel(text, target);
  return parts.length > 1 ? parts[0].length : -1;
}

function removeCompilerDirectiveLines(text: string): string {
  return text.replace(/^\s*`[^\r\n]*(?:\r?\n|$)/gm, '');
}

function removeAttributes(text: string): string {
  return text.replace(/\(\*[\s\S]*?\*\)/g, ' ');
}

function removeTrailingUnpackedDimensions(text: string): string {
  let result = text.trim();
  while (result.endsWith(']')) {
    let depth = 0;
    let openingIndex = -1;
    for (let index = result.length - 1; index >= 0; index -= 1) {
      if (result[index] === ']') {
        depth += 1;
      } else if (result[index] === '[') {
        depth -= 1;
        if (depth === 0) {
          openingIndex = index;
          break;
        }
      }
    }
    if (openingIndex < 0) {
      break;
    }
    result = result.slice(0, openingIndex).trimEnd();
  }
  return result;
}

function uniqueNames(names: string[]): string[] {
  return [...new Set(names)];
}

function plainIdentifier(identifier: string): string {
  if (!identifier.startsWith('\\')) {
    return identifier;
  }
  return identifier
    .slice(1)
    .replace(/[^A-Za-z0-9_$]+/g, '_')
    .replace(/^([^A-Za-z_])/, '_$1');
}
