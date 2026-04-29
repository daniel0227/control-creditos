async function readJson(response) {
  const data = await response.json().catch(function () {
    return null;
  });

  if (!response.ok) {
    throw new Error(data && data.error ? data.error : "No se pudo completar la solicitud.");
  }

  return data;
}

async function request(path, options) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  return readJson(response);
}

export function fetchDashboard() {
  return request("/api/dashboard");
}

export function createCredit(payload) {
  return request("/api/credits", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCredit(id, payload) {
  return request("/api/credits/" + id, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function archiveCredit(id, reason) {
  return request("/api/credits/" + id + "/archive", {
    method: "POST",
    body: JSON.stringify({ reason: reason }),
  });
}

export function restoreCredit(id) {
  return request("/api/credits/" + id + "/restore", {
    method: "POST",
  });
}

export function upsertPayment(creditId, payment) {
  return request("/api/credits/" + creditId + "/payments/" + payment.month, {
    method: "PUT",
    body: JSON.stringify(payment),
  });
}

export function deletePayment(creditId, month) {
  return request("/api/credits/" + creditId + "/payments/" + month, {
    method: "DELETE",
  });
}
