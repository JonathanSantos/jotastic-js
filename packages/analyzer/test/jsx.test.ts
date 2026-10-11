// @vitest-environment node
import { parseExpression } from '@babel/parser'
import { describe, expect, test } from 'vitest'
import { attributeKind, eventName, isAssignable, isProbablyPrimitive, normalizeAttribute } from '../src/index'

const expr = (s: string) => parseExpression(s, { plugins: ['jsx', 'typescript'] })

describe('eventName (18 §5.4)', () => {
  test.each([
    ['onClick', ['click', false]],
    ['onClickCapture', ['click', true]],
    ['onDblClick', ['dblclick', false]],
    ['onMouseEnter', ['mouseenter', false]],
    ['on:x-y', ['x-y', false]],
    ['onion', null],
    ['value', null],
  ] as const)('%s', (prop, expected) => expect(eventName(prop)).toEqual(expected))
})

describe('normalizeAttribute', () => {
  test.each([
    ['className', 'class'],
    ['htmlFor', 'for'],
    ['tabindex', 'tabIndex'],
    ['readonly', 'readOnly'],
    ['maxlength', 'maxLength'],
    ['id', 'id'],
  ])('%s → %s', (a, b) => expect(normalizeAttribute(a)).toBe(b))
})

describe('attributeKind (18 §5.3)', () => {
  test.each([
    ['div', 'class', 'class'],
    ['div', 'className', 'class'],
    ['div', 'style', 'style'],
    ['div', 'ref', 'ref'],
    ['li', 'key', 'key'],
    ['div', 'children', 'children'],
    ['div', 'innerHTML', 'innerHTML'],
    ['div', 'textContent', 'innerHTML'],
    ['input', 'value', 'prop'],
    ['input', 'checked', 'prop'],
    ['video', 'muted', 'prop'],
    ['input', 'indeterminate', 'prop'],
    ['button', 'disabled', 'bool'],
    ['input', 'readOnly', 'bool'],
    ['input', 'readonly', 'bool'],
    ['form', 'novalidate', 'bool'],
    ['input', 'autofocus', 'bool'],
    ['script', 'defer', 'bool'],
    ['button', 'onClick', 'event'],
    ['div', 'on:custom-ev', 'event'],
    ['div', 'data-x', 'attr'],
    ['div', 'aria-label', 'attr'],
    ['a', 'href', 'attr'],
    ['div', 'tabIndex', 'attr'],
    ['input', 'maxLength', 'attr'],
    ['circle', 'r', 'attr'],
    ['svg', 'viewBox', 'attr'],
    ['div', 'dangerouslySetInnerHTML', 'ignore'],
  ])('<%s %s> → %s', (tag, name, kind) => expect(attributeKind(tag, name)).toBe(kind))
})

describe('isProbablyPrimitive', () => {
  test.each([
    ["'a'", true],
    ['1', true],
    ['true', true],
    ['null', true],
    ['undefined', true],
    ['`a${b}`', true],
    ['!x', true],
    ['typeof x', true],
    ['-x', true],
    ['a + b', true],
    ['a > b', true],
    ['a && b > 1', true],
    ['a ?? 0', true],
    ['a ? 1 : 2', true],
    ['s.trim()', true],
    ['s.toUpperCase()', true],
    ['xs.length', true],
    ['Math.max(a, b)', true],
    ['x', false],
    ['x.y', false],
    ['{}', false],
    ['[]', false],
    ['f()', false],
    ['new Date()', false],
    ['a || {}', false],
    ['a ? 1 : {}', false],
  ])('%s → %s', (src, expected) => expect(isProbablyPrimitive(expr(src))).toBe(expected))
})

describe('isAssignable', () => {
  test.each([
    ['x', true],
    ['x.y', true],
    ['x[0]', true],
    ['x!', true],
    ['x?.y', false],
    ['f()', false],
    ["'a'", false],
  ])('%s → %s', (src, expected) => expect(isAssignable(expr(src))).toBe(expected))
})
