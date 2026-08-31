import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldShowVehicleFields,
  shouldShowVehicleDetailFields,
  filterVehicleDetailCustomFields,
} from './task-field-rules.js';

test('vehicle detail fields should be shown for most work types', () => {
  assert.equal(shouldShowVehicleDetailFields('Visita técnica'), true);
  assert.equal(shouldShowVehicleDetailFields('Manutenção'), true);
  assert.equal(shouldShowVehicleDetailFields('Análise de veículos'), true);
});

test('vehicle detail fields should stay hidden for travel and meal types', () => {
  assert.equal(shouldShowVehicleDetailFields('Viagem'), false);
  assert.equal(shouldShowVehicleDetailFields('Refeição'), false);
  assert.equal(shouldShowVehicleDetailFields('refeicao'), false);
});

test('basic vehicle fields can still appear for analysis of vehicles', () => {
  assert.equal(shouldShowVehicleFields('Análise de veículos'), true);
  assert.equal(shouldShowVehicleFields('Viagem'), false);
  assert.equal(shouldShowVehicleFields('Refeição'), false);
});

test('custom fields for standard vehicle info are filtered out to avoid duplication', () => {
  const fields = [
    { field_name: 'Montadora' },
    { field_name: 'Modelo' },
    { field_name: 'Versão Modelo' },
    { field_name: 'Placa' },
    { field_name: 'Ano' },
    { field_name: 'Observação' },
  ];

  const filtered = filterVehicleDetailCustomFields(fields);

  assert.deepEqual(filtered.map((field) => field.field_name), ['Observação']);
});
