import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCities } from './cidades.js';

test('searchCities matches city names ignoring accents and case', () => {
  assert.deepEqual(searchCities('sao paulo'), ['São Paulo - SP']);
  assert.ok(searchCities('curitiba').includes('Curitiba - PR'));
  assert.ok(searchCities('rio').includes('Rio Branco - AC'));
});
