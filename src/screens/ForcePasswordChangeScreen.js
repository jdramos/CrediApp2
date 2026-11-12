import React, { useContext, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Button, HelperText } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SessionContext } from "../auth/SessionContext";
import { changePassword } from "../api/userApi";
import { isNetworkError } from "../api/credimasterClient";
import { isConnected } from "../offline/network";
import { passwordProblem, PASSWORD_HINT } from "../utils/passwordPolicy";
import KeyboardAwareScroll from "../components/KeyboardAwareScroll";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: "center", paddingTop: SPACING.xl, paddingBottom: SPACING.xl, paddingHorizontal: SPACING.lg },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SPACING.md,
    ...SHADOW.card,
  },
  heroTitle: { color: COLORS.onGradient, fontWeight: "800", textAlign: "center" },
  heroName: { color: COLORS.onGradientMuted, marginTop: 4, textAlign: "center" },
  sheet: {
    flexGrow: 1,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.lg + 6,
    borderTopRightRadius: RADIUS.lg + 6,
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
    gap: SPACING.sm,
    ...SHADOW.card,
  },
  title: { fontWeight: "800", color: COLORS.text },
  subtitle: { marginTop: 2, color: COLORS.muted },
  input: { marginTop: SPACING.sm, backgroundColor: COLORS.card },
  btn: { marginTop: SPACING.md, borderRadius: RADIUS.md },
});

const NO_INTERNET =
  "Para cambiar la contraseña necesita conexión a internet. Active los datos móviles o conéctese a una red Wi‑Fi e intente de nuevo.";
const NO_SERVER =
  "No se pudo comunicar con el servidor. La señal es muy débil o no hay internet. Revise su conexión e intente de nuevo.";

// Cambio de contraseña obligatorio (dueño, 2026-11-12): el usuario nuevo, o aquel
// a quien un administrador le restableció la contraseña, entra con una contraseña
// temporal (el login trae must_change_password) y no puede usar la app hasta
// cambiarla. Es la misma pantalla de la web (ForcePasswordChangePage.jsx). Solo
// funciona con señal: no se encola como los cobros.
export default function ForcePasswordChangeScreen() {
  const { session, completePasswordChange, signOut } = useContext(SessionContext);
  const userName = session?.user?.user_name || "";
  const fullName = session?.user?.full_name || userName;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const newRef = useRef(null);
  const confirmRef = useRef(null);

  const onSubmit = async () => {
    if (loading) return;
    setError("");
    // El login quita los espacios de los extremos: aquí también, para que la
    // nueva contraseña sea la misma que luego se escribe al entrar.
    const current = currentPassword.trim();
    const next = newPassword.trim();
    const confirm = confirmPassword.trim();

    if (!current) {
      setError("Escriba la contraseña temporal con la que entró.");
      return;
    }
    const problem = passwordProblem(next, { userName });
    if (problem) {
      setError(problem);
      return;
    }
    if (next !== confirm) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    if (next === current) {
      setError("La nueva contraseña debe ser distinta de la temporal.");
      return;
    }

    setLoading(true);
    try {
      if (!(await isConnected().catch(() => true))) {
        setError(NO_INTERNET);
        return;
      }
      await changePassword(session.token, session.user.id, { currentPassword: current, newPassword: next });
      await completePasswordChange();
    } catch (e) {
      // 401 = la sesión venció o se abrió en otro dispositivo: el aviso y el
      // cierre de sesión los hace SessionContext.
      if (e?.status === 401) return;
      setError(isNetworkError(e) ? NO_SERVER : e?.message || "No se pudo cambiar la contraseña. Intente de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const eye = (
    <TextInput.Icon
      icon={showPass ? "eye-off-outline" : "eye-outline"}
      onPress={() => setShowPass((v) => !v)}
      forceTextInputFocus={false}
      accessibilityLabel={showPass ? "Ocultar contraseñas" : "Mostrar contraseñas"}
    />
  );
  const fieldProps = {
    secureTextEntry: !showPass,
    autoCapitalize: "none",
    autoCorrect: false,
    mode: "outlined",
    style: styles.input,
    outlineStyle: { borderRadius: RADIUS.md, borderColor: COLORS.border },
    left: <TextInput.Icon icon="lock-outline" />,
    editable: !loading,
  };

  return (
    <LinearGradient colors={GRADIENTS.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <KeyboardAwareScroll style={styles.flex} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={styles.hero}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="lock-reset" size={38} color={COLORS.primary} />
            </View>
            <Text variant="titleLarge" style={styles.heroTitle}>Cambio de contraseña obligatorio</Text>
            {!!fullName && <Text variant="bodyMedium" style={styles.heroName}>{fullName}</Text>}
          </View>

          <View style={styles.sheet}>
            <Text variant="titleMedium" style={styles.title}>Cree su contraseña personal</Text>
            <Text variant="bodyMedium" style={styles.subtitle}>
              Entró con una contraseña temporal. Antes de continuar, cámbiela por una que solo usted conozca. {PASSWORD_HINT}
            </Text>
            <Text variant="bodySmall" style={styles.subtitle}>Necesita conexión a internet para guardarla.</Text>

            <TextInput
              {...fieldProps}
              label="Contraseña temporal"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="next"
              onSubmitEditing={() => newRef.current?.focus()}
              right={eye}
            />
            <TextInput
              {...fieldProps}
              ref={newRef}
              label="Nueva contraseña"
              value={newPassword}
              onChangeText={setNewPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
            />
            <TextInput
              {...fieldProps}
              ref={confirmRef}
              label="Confirmar nueva contraseña"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
            />

            <HelperText type="error" visible={!!error}>
              {error}
            </HelperText>

            <Button
              mode="contained"
              onPress={onSubmit}
              loading={loading}
              disabled={loading}
              style={styles.btn}
              contentStyle={{ height: 48 }}
              labelStyle={{ fontWeight: "700" }}
            >
              Guardar y continuar
            </Button>
            <Button onPress={() => signOut()} disabled={loading} style={{ marginTop: SPACING.xs }}>
              Cerrar sesión
            </Button>
          </View>
        </KeyboardAwareScroll>
      </SafeAreaView>
    </LinearGradient>
  );
}
