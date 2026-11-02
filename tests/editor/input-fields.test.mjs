import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FieldRenderer, NumberField, BooleanField } from '../../src/editor/ui/Input.tsx';

test('unsettable fields distinguish missing values from zero, false and empty strings', () => {
    const fields = [
        { name: 'amount', label: 'Amount', type: 'number', allowUnset: true },
        { name: 'enabled', label: 'Enabled', type: 'boolean', allowUnset: true },
        { name: 'name', label: 'Name', type: 'string', allowUnset: true },
    ];
    const defined = renderToStaticMarkup(h(FieldRenderer, { fields, values: { amount: 0, enabled: false, name: '' }, onChange() {} }));
    assert.equal((defined.match(/aria-label="Unset /g) ?? []).length, 3);
    assert.ok(!defined.includes('aria-label="Set '));
    const missing = renderToStaticMarkup(h(FieldRenderer, { fields, values: {}, onChange() {} }));
    assert.equal((missing.match(/aria-label="Set /g) ?? []).length, 3);
});

test('unset custom controls are not evaluated; bound fields offer Set only when optional', () => {
    const html = renderToStaticMarkup(h(FieldRenderer, { fields: [{ name: 'custom', label: 'Custom', type: 'custom', allowUnset: true,
        initialValue: { count: 1 }, render() { throw new Error('Must not render an unset value'); } }], values: {}, onChange() {} }));
    assert.match(html, /aria-label="Set custom"/);
    for (const [Field, name] of [[NumberField, 'Amount'], [BooleanField, 'Enabled']]) {
        const markup = renderToStaticMarkup(h(Field, { name: 'value', label: name, allowUnset: true, values: {}, onChange() {} }));
        assert.match(markup, new RegExp(`aria-label="Set ${name.toLowerCase()}"`));
    }
    const required = renderToStaticMarkup(h(NumberField, { name: 'value', label: 'Amount', values: { value: 0 }, onChange() {} }));
    assert.ok(!required.includes('aria-label="Unset'));
});
