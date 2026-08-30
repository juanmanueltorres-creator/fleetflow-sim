import { createReadStream } from 'node:fs'

function isJsonTokenBoundary(character) {
  return character === undefined || /[\s,:{}\[\]]/.test(character)
}

export function normalizeAmazonJsonValue(text) {
  let output = ''
  let inString = false
  let escaping = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (inString) {
      output += character
      if (escaping) {
        escaping = false
      } else if (character === '\\') {
        escaping = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
      output += character
      continue
    }

    if (
      text.startsWith('NaN', index)
      && isJsonTokenBoundary(text[index - 1])
      && isJsonTokenBoundary(text[index + 3])
    ) {
      output += 'null'
      index += 2
      continue
    }

    output += character
  }

  return output
}

function parseValue(rawValue, path, key) {
  try {
    return JSON.parse(normalizeAmazonJsonValue(rawValue.trim()))
  } catch (error) {
    throw new Error(
      `Could not parse top-level entry ${key} from ${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function* streamJsonObjectEntries(path, { highWaterMark = 64 * 1024 } = {}) {
  const stream = createReadStream(path, { encoding: 'utf8', highWaterMark })

  let state = 'root-start'
  let keyRaw = ''
  let currentKey = null
  let keyEscaping = false
  let valueRaw = ''
  let valueDepth = 0
  let valueInString = false
  let valueEscaping = false
  let scalarValue = false
  let rootEnded = false

  for await (const chunk of stream) {
    for (let index = 0; index < chunk.length; index += 1) {
      const character = chunk[index]

      if (state === 'root-start') {
        if (/\s/.test(character)) continue
        if (character !== '{') throw new Error(`Expected top-level object in ${path}`)
        state = 'key-or-end'
        continue
      }

      if (state === 'key-or-end') {
        if (/\s/.test(character)) continue
        if (character === '}') {
          rootEnded = true
          state = 'after-root'
          continue
        }
        if (character !== '"') throw new Error(`Expected top-level key in ${path}`)
        keyRaw = ''
        keyEscaping = false
        state = 'key'
        continue
      }

      if (state === 'key') {
        if (keyEscaping) {
          keyRaw += character
          keyEscaping = false
          continue
        }
        if (character === '\\') {
          keyRaw += character
          keyEscaping = true
          continue
        }
        if (character === '"') {
          currentKey = JSON.parse(`"${keyRaw}"`)
          state = 'colon'
          continue
        }
        keyRaw += character
        continue
      }

      if (state === 'colon') {
        if (/\s/.test(character)) continue
        if (character !== ':') throw new Error(`Expected colon after ${currentKey} in ${path}`)
        state = 'value-start'
        continue
      }

      if (state === 'value-start') {
        if (/\s/.test(character)) continue
        valueRaw = character
        valueDepth = character === '{' || character === '[' ? 1 : 0
        valueInString = character === '"'
        valueEscaping = false
        scalarValue = valueDepth === 0
        state = 'value'
        continue
      }

      if (state === 'value') {
        if (valueInString) {
          valueRaw += character
          if (valueEscaping) {
            valueEscaping = false
          } else if (character === '\\') {
            valueEscaping = true
          } else if (character === '"') {
            valueInString = false
            if (scalarValue && valueDepth === 0) {
              yield [currentKey, parseValue(valueRaw, path, currentKey)]
              currentKey = null
              valueRaw = ''
              state = 'after-value'
            }
          }
          continue
        }

        if (scalarValue && valueDepth === 0 && (character === ',' || character === '}')) {
          yield [currentKey, parseValue(valueRaw, path, currentKey)]
          currentKey = null
          valueRaw = ''
          if (character === ',') {
            state = 'key-or-end'
          } else {
            rootEnded = true
            state = 'after-root'
          }
          continue
        }

        valueRaw += character
        if (character === '"') {
          valueInString = true
          valueEscaping = false
        } else if (character === '{' || character === '[') {
          valueDepth += 1
        } else if (character === '}' || character === ']') {
          valueDepth -= 1
          if (!scalarValue && valueDepth === 0) {
            yield [currentKey, parseValue(valueRaw, path, currentKey)]
            currentKey = null
            valueRaw = ''
            state = 'after-value'
          }
        }
        continue
      }

      if (state === 'after-value') {
        if (/\s/.test(character)) continue
        if (character === ',') {
          state = 'key-or-end'
          continue
        }
        if (character === '}') {
          rootEnded = true
          state = 'after-root'
          continue
        }
        throw new Error(`Expected comma or top-level object end in ${path}`)
      }

      if (state === 'after-root') {
        if (!/\s/.test(character)) throw new Error(`Unexpected trailing content in ${path}`)
      }
    }
  }

  if (!rootEnded) throw new Error(`Unexpected end of JSON object in ${path}`)
}
