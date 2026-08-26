import test from 'node:test';
import assert from 'node:assert/strict';
import { findCity, searchCities } from './cidades.js';

test('searchCities matches city names ignoring accents and case', () => {
  assert.deepEqual(searchCities('sao paulo'), ['São Paulo - SP']);
  assert.ok(searchCities('curitiba').includes('Curitiba - PR'));
  assert.ok(searchCities('rio').includes('Rio Branco - AC'));
});

test('findCity accepts a catalog city and rejects non-city text', () => {
  assert.equal(findCity('sao paulo - sp'), 'São Paulo - SP');
  assert.equal(findCity('Rua Augusta, 100 - SP'), null);
  assert.equal(findCity('Bairro Centro - SP'), null);
});
