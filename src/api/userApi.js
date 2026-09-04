import { credimasterPut } from "./credimasterClient";

// Cambia la contraseña del usuario logueado — requiere la contraseña
// actual (verificada server-side). PUT /api/users/:userId/reset-password,
// permitido siempre sobre el propio userId (requireSelfOrPermission).
export const changePassword = (token, userId, { currentPassword, newPassword }) =>
  credimasterPut(`/api/users/${userId}/reset-password`, { currentPassword, newPassword }, token);
