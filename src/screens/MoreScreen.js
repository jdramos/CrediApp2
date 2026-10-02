import React, { useContext, useEffect, useState } from "react";
import { View, StyleSheet, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Avatar, List, Divider, Portal, Dialog, TextInput, Button, HelperText, Snackbar, Switch } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SessionContext } from "../auth/SessionContext";
import { changePassword } from "../api/userApi";
import { confirmAction } from "../utils/confirm";
import { remindersEnabled, setRemindersEnabled, syncReminders } from "../notifications/reminders";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const initials = (name) =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  hero: {
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
    alignItems: "center",
  },
  name: { color: COLORS.onGradient, fontWeight: "800", marginTop: SPACING.sm },
  role: { color: COLORS.onGradientMuted, marginTop: 2 },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    ...SHADOW.card,
  },
  sectionTitle: {
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
});

// Reemplaza el hamburger-drawer viejo: acceso a saldos, datos de la
// cuenta y cerrar sesión, en una pantalla propia dentro de la barra de
// pestañas — más "app moderna" que un cajón lateral.
export default function MoreScreen() {
  const { session, signOut } = useContext(SessionContext);
  const fullName = session?.user?.full_name || session?.user?.user_name || "Usuario";
  const tenantName = session?.tenant?.commercial_name || session?.tenant?.legal_name || "";

  const [pwdVisible, setPwdVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [snackbar, setSnackbar] = useState("");
  const [remindersOn, setRemindersOn] = useState(true);
  const canPay = session?.permissions?.includes("pagos.insertar") || session?.permissions?.includes("pagos.ver");

  useEffect(() => {
    remindersEnabled().then(setRemindersOn);
  }, []);

  const toggleReminders = async (value) => {
    setRemindersOn(value);
    await setRemindersEnabled(value);
    if (!value) {
      setSnackbar("Recordatorios desactivados");
      return;
    }
    const res = await syncReminders(session.token, { force: true, requestPermission: true });
    if (res.reason === "no-permission") {
      setRemindersOn(false);
      await setRemindersEnabled(false);
      setSnackbar("Activá las notificaciones de la app en los ajustes del teléfono para recibir recordatorios");
    } else {
      setSnackbar(res.scheduled > 0 ? "Recordatorios activados" : "Recordatorios activados (no hay cobros próximos por avisar)");
    }
  };

  const onLogout = () => {
    Alert.alert("Cerrar sesión", "¿Seguro que deseas cerrar sesión?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: signOut },
    ]);
  };

  const closePwdDialog = () => {
    setPwdVisible(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPwdError("");
  };

  const savePassword = async () => {
    try {
      setPwdSaving(true);
      await changePassword(session.token, session.user.id, { currentPassword, newPassword });
      closePwdDialog();
      setSnackbar("Contraseña actualizada");
    } catch (e) {
      setPwdError(e?.message ?? "No se pudo cambiar la contraseña");
    } finally {
      setPwdSaving(false);
    }
  };

  const onChangePassword = () => {
    setPwdError("");
    if (!currentPassword || !newPassword) {
      setPwdError("Complete todos los campos");
      return;
    }
    if (newPassword.length < 8) {
      setPwdError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError("Las contraseñas nuevas no coinciden");
      return;
    }
    confirmAction("Cambiar contraseña", "¿Confirmás cambiar tu contraseña?", savePassword);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={GRADIENTS.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Avatar.Text size={64} label={initials(fullName)} color={COLORS.primary} style={{ backgroundColor: COLORS.onGradient }} />
        <Text variant="titleLarge" style={styles.name}>{fullName}</Text>
        {!!tenantName && <Text variant="bodyMedium" style={styles.role}>{tenantName}</Text>}
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.card}>
          <List.Item
            title="Usuario"
            description={session?.user?.user_name || "-"}
            left={(props) => <List.Icon {...props} icon="account-circle-outline" color={COLORS.primary} />}
          />
          <Divider />
          <List.Item
            title="Sucursales asignadas"
            description={session?.user?.branches?.length ? String(session.user.branches.length) : "Todas"}
            left={(props) => <List.Icon {...props} icon="office-building-outline" color={COLORS.primary} />}
          />
        </Animated.View>

        {canPay && (
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.card}>
            <List.Item
              title="Recordatorios de cobro"
              description="Aviso a las 7:30 con lo que vence hoy y a las 6:00 pm con lo de mañana"
              descriptionNumberOfLines={3}
              left={(props) => <List.Icon {...props} icon="bell-ring-outline" color={COLORS.primary} />}
              right={() => <Switch value={remindersOn} onValueChange={toggleReminders} />}
            />
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.card}>
          <List.Item
            title="Cambiar contraseña"
            left={(props) => <List.Icon {...props} icon="lock-reset" color={COLORS.primary} />}
            onPress={() => setPwdVisible(true)}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).springify()} style={styles.card}>
          <List.Item
            title="Cerrar sesión"
            titleStyle={{ color: COLORS.danger, fontWeight: "700" }}
            left={(props) => <List.Icon {...props} icon="logout" color={COLORS.danger} />}
            onPress={onLogout}
          />
        </Animated.View>
      </ScrollView>

      <Portal>
        <Dialog visible={pwdVisible} onDismiss={closePwdDialog}>
          <Dialog.Title>Cambiar contraseña</Dialog.Title>
          <Dialog.Content style={{ gap: SPACING.sm }}>
            <TextInput
              label="Contraseña actual"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              mode="outlined"
              outlineStyle={{ borderRadius: RADIUS.md }}
            />
            <TextInput
              label="Nueva contraseña"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              mode="outlined"
              style={{ marginTop: SPACING.sm }}
              outlineStyle={{ borderRadius: RADIUS.md }}
            />
            <TextInput
              label="Confirmar nueva contraseña"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              mode="outlined"
              style={{ marginTop: SPACING.sm }}
              outlineStyle={{ borderRadius: RADIUS.md }}
            />
            <HelperText type="error" visible={!!pwdError}>{pwdError}</HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closePwdDialog} disabled={pwdSaving}>Cancelar</Button>
            <Button onPress={onChangePassword} loading={pwdSaving} disabled={pwdSaving}>Guardar</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar("")} duration={2500}>
        {snackbar}
      </Snackbar>
    </SafeAreaView>
  );
}
