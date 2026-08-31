export function normalizeWorkType(type) {
  return String(type || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeFieldName(fieldName) {
  return String(fieldName || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function isTravelType(type) {
  return normalizeWorkType(type) === "viagem";
}

export function isLunchType(type) {
  return normalizeWorkType(type) === "refeicao";
}

export function shouldShowVehicleFields(type) {
  return !isTravelType(type) && !isLunchType(type);
}

export function shouldShowVehicleDetailFields(type) {
  return shouldShowVehicleFields(type);
}

const BUILT_IN_VEHICLE_FIELD_NAMES = new Set([
  "montadora",
  "modelo",
  "submodelo",
  "versao modelo",
  "versao_modelo",
  "placa",
  "ano",
  "veiculo",
  "vehicle",
]);

export function filterVehicleDetailCustomFields(fields = []) {
  return (Array.isArray(fields) ? fields : []).filter((field) => {
    const name = normalizeFieldName(
      field?.field_name || field?.name || field?.label || "",
    );
    return !BUILT_IN_VEHICLE_FIELD_NAMES.has(name);
  });
}
