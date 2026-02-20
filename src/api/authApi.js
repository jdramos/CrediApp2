// Mock login. Luego lo cambias a fetch real.
export async function loginRequest({ user_name, password }) {
  await sleep(450);

  // usuarios mock
  const users = {
    admin: { id: 1, user_name: "admin", full_name: "Admin", role: "ADMIN", branch_id: 1 },
    supervisor: { id: 2, user_name: "supervisor", full_name: "Supervisor", role: "SUPERVISOR", branch_id: 1 },
    promotor: { id: 3, user_name: "promotor", full_name: "Promotor", role: "PROMOTOR", branch_id: 1 },
    cobrador: { id: 4, user_name: "cobrador", full_name: "Cobrador", role: "COBRADOR", branch_id: 1 },
  };

  const u = users[user_name?.toLowerCase()];
  if (!u || password !== "1234") {
    const err = new Error("Usuario o contraseña incorrectos");
    err.status = 401;
    throw err;
  }

  return {
    token: "mock-token-" + Date.now(),
    user: u,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}